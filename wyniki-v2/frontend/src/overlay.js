import {
  SCOREBOARD_SLIDE_MS,
  cloneCourt,
  courtIdentityKey,
  holdRemainingMs,
  isScoreboardHeld,
} from './shared/scoreboardHold.js';
import { calcMatchTime } from './shared/matchTime.js';
import { overlayCategoryLabel, overlayCourtLabel, overlayPhaseLabel } from './shared/overlayLabel.js';
import { abbreviatePersonName } from './shared/teamDisplay.js';

const pathParts = window.location.pathname.split('/').filter(Boolean);
const hasTournamentSlot = pathParts[0] === 'overlay' && pathParts.length >= 3;
const overlayId = hasTournamentSlot ? (pathParts[2] || '1') : (pathParts[pathParts.length - 1] || '1');
const requestedTournamentSlot = hasTournamentSlot ? (parseInt(pathParts[1], 10) || 1) : null;
const SETTINGS_POLL_MS = 2000;
let allCourtIds = [];  // Will be populated from snapshot

function codeToFlag(code) {
    if (!code || code.length < 2) return '';
    return 'https://flagcdn.com/w80/' + code.toLowerCase().slice(0, 2) + '.png';
}
let courts = {};
let settings = { tournament_logo: null, tournament_name: '', overlays: {} };
let activeTournaments = [];
let activeTournament = null;
let eventSource = null;
let scoreAnim = {};
let scoreAnimHold = {};
let boardHold = {};
let holdRefreshTimer = null;
let exitLocks = {};
const SERVE_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#C6E953" stroke="#ffffff" stroke-width="2"></circle><path d="M6.2 6.4c5.4 4.5 5.4 14.7 0 19.2" fill="none" stroke="#ffffff" stroke-width="2"></path><path d="M25.8 6.4c-5.4 4.5-5.4 14.7 0 19.2" fill="none" stroke="#ffffff" stroke-width="2"></path></svg>';

function getPreset() {
    return settings.overlays?.[overlayId] || { name: '', auto_hide: false, elements: [] };
}

function overlayLook(preset) {
    var look = (preset && preset.look) || {};
    var speed = Number(look.anim_speed);
    var scale = Number(look.scale);
    return {
        flags: look.flags !== false,
        class: look.class === true,
        phase: look.phase !== false,
        clock: look.clock !== false,
        logo: look.logo !== false,
        anim_enter: look.anim_enter !== false,
        anim_point: look.anim_point !== false,
        anim_game: look.anim_game !== false,
        anim_set: look.anim_set !== false,
        anim_speed: speed > 0 ? speed : 1,
        scale: scale > 0 ? scale : 1,
    };
}

function isElementCourtOccupied(el) {
    return isScoreboardHeld(resolveCourtState(el && el.court_id));
}

function overlayHasOccupiedCourt(preset) {
    return (preset.elements || []).some(isElementCourtOccupied);
}

function overlayHasMovingBoard() {
    return Object.keys(boardHold).some(function(key) {
        var phase = boardHold[key] && boardHold[key].phase;
        return phase === 'visible' || phase === 'entering' || phase === 'exiting' || phase === 'swapping';
    });
}

function sortCourtIds(ids) {
    return ids.slice().sort(function(a, b) {
        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
}

function syncTournamentContext() {
    var resolved = null;
    if (requestedTournamentSlot != null) {
        resolved = activeTournaments[requestedTournamentSlot - 1] || null;
    }
    if (!resolved) {
        var presetTournamentId = getPreset()?.tournament_id;
        if (presetTournamentId != null) {
            resolved = activeTournaments.find(function(tournament) {
                return String(tournament.id) === String(presetTournamentId);
            }) || null;
        }
    }
    activeTournament = resolved || activeTournaments[0] || null;
    if (activeTournament?.name) {
        document.title = activeTournament.name + ' - Tennis Score Overlay';
    }
}

function getTournamentCourtEntries() {
    var entries = Object.keys(courts).map(function(kortId) {
        return { kortId: kortId, court: courts[kortId] || {} };
    });
    if (activeTournament?.id != null) {
        entries = entries.filter(function(entry) {
            return String(entry.court?.tournament_id) === String(activeTournament.id);
        });
        entries.sort(function(a, b) {
            var orderA = parseInt(a.court?.display_order, 10);
            var orderB = parseInt(b.court?.display_order, 10);
            if (!Number.isNaN(orderA) || !Number.isNaN(orderB)) {
                return (Number.isNaN(orderA) ? Number.MAX_SAFE_INTEGER : orderA) - (Number.isNaN(orderB) ? Number.MAX_SAFE_INTEGER : orderB);
            }
            return String(a.court?.name || a.kortId).localeCompare(String(b.court?.name || b.kortId), undefined, { numeric: true, sensitivity: 'base' });
        });
        return entries;
    }
    return sortCourtIds(entries.map(function(entry) { return entry.kortId; })).map(function(kortId) {
        return { kortId: kortId, court: courts[kortId] || {} };
    });
}

function resolveCourtState(courtToken) {
    if (activeTournament?.id != null) {
        var ordinal = parseInt(courtToken, 10);
        if (!Number.isNaN(ordinal) && ordinal > 0) {
            var mapped = getTournamentCourtEntries()[ordinal - 1];
            if (mapped) return mapped.court || {};
        }
    }
    return courts[courtToken] || {};
}

function tbSuperscripts(setInfo) {
    if (!setInfo || setInfo.tb == null || setInfo.stb) return { a: '', b: '' };
    var a = Number(setInfo.p1 || 0), b = Number(setInfo.p2 || 0);
    if (a === b) return { a: '', b: '' };
    var tb = String(setInfo.tb);
    return a < b ? { a: tb, b: '' } : { a: '', b: tb };
}

function setCellHtml(val, sup, kind, flashCls) {
    var supHtml = sup ? '<span class="sb-tv-sup">' + sup + '</span>' : '';
    var cls = 'sb-tv-set ' + kind + (flashCls ? ' ' + flashCls : '');
    return '<div class="' + cls + '"><span>' + val + '</span>' + supHtml + '</div>';
}

function takeScoreAnim(cid, sig) {
    var prev = scoreAnim[cid];
    if (!prev) {
        scoreAnim[cid] = {
            ptsA: sig.ptsA, ptsB: sig.ptsB, gamesA: sig.gamesA, gamesB: sig.gamesB, sets: sig.sets, serve: sig.serve, tbLabel: sig.tbLabel || '',
            tickPtsA: 0, tickPtsB: 0, tickGameA: 0, tickGameB: 0, tickSet: 0,
        };
        return { tickPtsA: 0, tickPtsB: 0, tickGameA: 0, tickGameB: 0, tickSet: 0, just: {}, prevServe: sig.serve };
    }
    var just = {
        ptsA: sig.ptsA !== prev.ptsA,
        ptsB: sig.ptsB !== prev.ptsB,
        gamesA: sig.gamesA !== prev.gamesA,
        gamesB: sig.gamesB !== prev.gamesB,
        sets: sig.sets !== prev.sets,
        serve: sig.serve !== prev.serve,
        tb: !!(sig.tbLabel && sig.tbLabel !== prev.tbLabel),
        tbHide: !!(!sig.tbLabel && prev.tbLabel),
    };
    var next = {
        ptsA: sig.ptsA, ptsB: sig.ptsB, gamesA: sig.gamesA, gamesB: sig.gamesB, sets: sig.sets, serve: sig.serve, tbLabel: sig.tbLabel || '',
        tickPtsA: prev.tickPtsA + (just.ptsA ? 1 : 0),
        tickPtsB: prev.tickPtsB + (just.ptsB ? 1 : 0),
        tickGameA: prev.tickGameA + (just.gamesA ? 1 : 0),
        tickGameB: prev.tickGameB + (just.gamesB ? 1 : 0),
        tickSet: prev.tickSet + (just.sets ? 1 : 0),
    };
    scoreAnim[cid] = next;
    return {
        tickPtsA: next.tickPtsA, tickPtsB: next.tickPtsB, tickGameA: next.tickGameA, tickGameB: next.tickGameB, tickSet: next.tickSet,
        just: just,
        prevServe: prev.serve,
        prevTbLabel: prev.tbLabel || '',
    };
}

function beginScoreAnimHold(cid, flags, look) {
    var existed = !!scoreAnimHold[cid];
    scoreAnimHold[cid] = Object.assign({}, scoreAnimHold[cid] || {}, flags);
    if (existed) return;
    var holdMs = Math.round(700 / (look.anim_speed || 1));
    setTimeout(function() {
        delete scoreAnimHold[cid];
        render();
    }, holdMs);
}

function resolveScoreAnimMotion(cid, anim, look, actualServe) {
    var shownServe = actualServe || '';
    if (look.anim_set) {
        if (anim.just.sets && anim.just.serve) {
            beginScoreAnimHold(cid, { enter: true, peel: true }, look);
        } else if (anim.just.sets) {
            beginScoreAnimHold(cid, { peel: true }, look);
        } else if (anim.just.serve) {
            beginScoreAnimHold(cid, { enter: true }, look);
        }
    }
    if (anim.just.tb) beginScoreAnimHold(cid, { tbRise: true }, look);
    if (anim.just.tbHide) beginScoreAnimHold(cid, { tbFall: true, tbFallLabel: anim.prevTbLabel || '' }, look);
    var hold = scoreAnimHold[cid];
    return {
        shownServe: (hold && hold.visualServe) ? hold.visualServe : shownServe,
        setPeel: !!(hold && hold.peel),
        rideServe: !!(hold && hold.ride),
        enterServe: !!(hold && hold.enter),
        tbRise: !!(hold && hold.tbRise),
        tbFall: !!(hold && hold.tbFall),
        tbFallLabel: (hold && hold.tbFallLabel) || '',
    };
}

function flashCls(prefix, tick, changed) {
    if (!changed || !tick) return '';
    return 'is-' + prefix + '-' + (tick % 2 === 0 ? 'a' : 'b');
}

function renderScoreboard(el, courtOverride) {
    const cid = el.court_id;
    const court = courtOverride || resolveCourtState(cid);
    const pA = court.A || {}, pB = court.B || {};
    const active = court.match_status?.active || false;
    const inactiveClass = active ? '' : ' match-inactive';
    const curSet = court.current_set || 1;
    const bgOpacity = el.bg_opacity != null ? el.bg_opacity : 0.95;
    const hasSetDetail = Array.isArray(court.sets_detail) && court.sets_detail.length > 0;
    const regularSetWins = (function() {
        const wins = { A: 0, B: 0 };
        if (hasSetDetail) {
            for (const setInfo of court.sets_detail) {
                if (setInfo?.stb) continue;
                const a = Number(setInfo?.p1 ?? 0);
                const b = Number(setInfo?.p2 ?? 0);
                if (a > b) wins.A += 1;
                else if (b > a) wins.B += 1;
            }
            return wins;
        }
        for (let setIdx = 1; setIdx <= 2; setIdx += 1) {
            const a = Number(pA['set'+setIdx] || 0);
            const b = Number(pB['set'+setIdx] || 0);
            if (a > b) wins.A += 1;
            else if (b > a) wins.B += 1;
        }
        return wins;
    })();
    const isSuperTB = !!court.super_tiebreak_active || (Number(curSet) === 3 && regularSetWins.A === 1 && regularSetWins.B === 1);
    const readSetValue = (playerState, setIdx) => {
        if (active && setIdx > curSet) return 0;
        return playerState['set'+setIdx] || 0;
    };
    const completed = [];
    if (hasSetDetail) {
        court.sets_detail.forEach(function(d) {
            if (d?.stb) return;
            var sup = tbSuperscripts(d);
            completed.push({ a: Number(d.p1 || 0), b: Number(d.p2 || 0), supA: sup.a, supB: sup.b });
        });
    } else {
        var lastCompleted = active ? (curSet - 1) : 3;
        for (var s = 1; s <= lastCompleted && s <= 3; s++) {
            var a = Number(readSetValue(pA, s) || 0), b = Number(readSetValue(pB, s) || 0);
            if (!active && a === 0 && b === 0) continue;
            completed.push({ a: a, b: b, supA: '', supB: '' });
        }
    }
    let liveGames = (active && !isSuperTB)
        ? { a: Number(readSetValue(pA, curSet) || 0), b: Number(readSetValue(pB, curSet) || 0) }
        : null;
    if (!liveGames && !isSuperTB && completed.length === 0) {
        liveGames = { a: 0, b: 0 };
    }
    const isTie = court.tie?.visible || false;
    const ptA = active ? ((isTie || isSuperTB) ? (court.tie?.A || 0) : (pA.points || '0')) : '\u2014';
    const ptB = active ? ((isTie || isSuperTB) ? (court.tie?.B || 0) : (pB.points || '0')) : '\u2014';
    const tbOn = active && (isTie || isSuperTB);
    const look = overlayLook(getPreset());
    const meta = court.history_meta || {};
    const cat = look.phase ? overlayCategoryLabel(meta.category) : '';
    const phase = look.phase ? overlayPhaseLabel(meta.phase) : '';
    const metaParts = [cat, phase].filter(Boolean).join(' · ');
    const showHeaderCourt = (el.label_position || 'above') !== 'none';
    const courtName = showHeaderCourt ? overlayCourtLabel(el.label_text, el.court_id) : '';
    const timeStr = look.clock ? (calcMatchTime(court) || '') : '';
    const showFlags = look.flags;
    const gridCols = 'minmax(0,1fr) auto' + (liveGames ? ' var(--set-w)' : '') + ' var(--pts-w)';
    const anim = takeScoreAnim(cid, {
        ptsA: String(ptA), ptsB: String(ptB),
        gamesA: liveGames ? String(liveGames.a) : '',
        gamesB: liveGames ? String(liveGames.b) : '',
        sets: completed.map(function(c) { return c.a + '-' + c.b; }).join('|'),
        serve: court.serve || '',
        tbLabel: tbOn ? (isSuperTB ? 'stb' : 'tb') : '',
    });
    const gameFlashA = look.anim_game ? flashCls('gameflash', anim.tickGameA, !!anim.just.gamesA) : '';
    const gameFlashB = look.anim_game ? flashCls('gameflash', anim.tickGameB, !!anim.just.gamesB) : '';
    const motion = resolveScoreAnimMotion(cid, anim, look, court.serve || '');
    const setPeel = motion.setPeel;
    const ptsFlashA = look.anim_point ? flashCls('ptflash', anim.tickPtsA, !!anim.just.ptsA) : '';
    const ptsFlashB = look.anim_point ? flashCls('ptflash', anim.tickPtsB, !!anim.just.ptsB) : '';
    const wipeCls = look.anim_set ? flashCls('setwipe', anim.tickSet, !!anim.just.sets) : '';

    function pRow(p, serveKey, sideClass) {
        var isServing = motion.shownServe === serveKey;
        var flagHtml = showFlags ? (flagSpans(p) || '<span class="player-flag"></span>') : '';
        var dName = p.full_name || p.surname || '\u2014';
        var isTeam = String(dName).indexOf(' / ') !== -1;
        var teamClass = isTeam ? ' is-team' : '';
        var serveCls = isServing ? ' is-on' : '';
        if (look.anim_set && isServing && (motion.rideServe || motion.enterServe)) serveCls += ' is-peel';
        var doneHtml = completed.map(function(c, i) {
            var val = serveKey === 'A' ? c.a : c.b;
            var sup = serveKey === 'A' ? c.supA : c.supB;
            var flash = (setPeel && i === completed.length - 1) ? 'is-peel' : '';
            return setCellHtml(val, sup, 'is-done', flash);
        }).join('');
        var liveHtml = '';
        if (liveGames) {
            var liveVal = serveKey === 'A' ? liveGames.a : liveGames.b;
            var liveFlash = serveKey === 'A' ? gameFlashA : gameFlashB;
            liveHtml = setCellHtml(liveVal, '', 'is-live', liveFlash);
        }
        var ptsVal = serveKey === 'A' ? ptA : ptB;
        var ptsFlash = serveKey === 'A' ? ptsFlashA : ptsFlashB;
        return '<div class="sb-tv-row ' + sideClass + '">'
            + '<div class="sb-tv-player">'
            + (showFlags ? '<div class="sb-tv-flag">' + flagHtml + '</div>' : '')
            + nameVariantsHtml(dName, 'player-name' + teamClass)
            + '<span class="sb-tv-serve' + serveCls + '">' + SERVE_SVG + '</span></div>'
            + '<div class="sb-tv-dones">' + doneHtml + '</div>'
            + liveHtml
            + '<div class="sb-tv-pts' + (tbOn ? ' is-tiebreak' : '') + (ptsFlash ? ' ' + ptsFlash : '') + '">' + ptsVal + '</div>'
            + '</div>';
    }

    var tbHtml = '';
    var tbText = motion.tbFall
        ? (motion.tbFallLabel === 'stb' ? 'Super tie-break' : 'Tie-break')
        : (tbOn ? (isSuperTB ? 'Super tie-break' : 'Tie-break') : '');
    if (tbText) {
        var tbCls = motion.tbFall ? ' is-fall' : (motion.tbRise ? ' is-rise' : '');
        tbHtml = '<span class="sb-tv-tb' + tbCls + '">' + tbText + '</span>';
    }
    var clockHtml = timeStr
        ? '<span class="sb-tv-clock" data-court="' + cid + '">' + timeStr + '</span>'
        : '';
    var opacityStyle = bgOpacity < 1 ? 'opacity:' + bgOpacity + ';' : '';
    var speedStyle = '--sb-speed:' + look.anim_speed + ';';
    var scaleStyle = 'transform:scale(' + look.scale + ');transform-origin:top left;';

    return '<div class="sb-tv' + inactiveClass + '" style="' + opacityStyle + speedStyle + scaleStyle + '--sb-cols:' + gridCols + ';">'
        + '<div class="sb-tv-card">'
        + '<div class="sb-tv-header">'
        + (courtName ? '<span class="sb-tv-court">' + courtName + '</span>' : '')
        + '<span class="sb-tv-meta">' + metaParts + '</span>'
        + tbHtml
        + clockHtml + '</div>'
        + '<div class="sb-tv-rows">'
        + pRow(pA, 'A', 'side-a')
        + pRow(pB, 'B', 'side-b')
        + '</div>'
        + '<div class="sb-tv-wipe' + (wipeCls ? ' ' + wipeCls : '') + '"></div>'
        + '</div></div>';
}

function _v(val, suffix) { return val != null ? val + (suffix||'') : '\u2014'; }
function _serveRatio(si, st) { return (si != null && st != null) ? si+'/'+st : '\u2014'; }
function _totalPtsWon(own, opp) {
    var a = (own.aces||0) + (own.winners||0);
    var b = (opp.double_faults||0) + (opp.forced_errors||0) + (opp.unforced_errors||0);
    return a + b;
}

function renderStats(el, courtOverride) {
    var court = courtOverride || resolveCourtState(el.court_id);
    var active = court.match_status?.active || false;
    if (!active) return '';
    var st = court.stats || {};
    var pA = court.A || {}, pB = court.B || {};
    var nA = pA.full_name||pA.surname||'A';
    var nB = pB.full_name||pB.surname||'B';
    if (String(nA).indexOf(' / ') !== -1) nA = abbreviateName(nA);
    if (String(nB).indexOf(' / ') !== -1) nB = abbreviateName(nB);
    var sA = st.player_a||{}, sB = st.player_b||{};
    var mode = el.stats_mode || 'simple';
    var rows = [
        {l:'Asy', a:_v(sA.aces), b:_v(sB.aces)},
        {l:'Podw. b\u0142\u0119dy', a:_v(sA.double_faults), b:_v(sB.double_faults)},
        {l:'Winnery', a:_v(sA.winners), b:_v(sB.winners)},
    ];
    if (mode === 'advanced') {
        rows.push({l:'B\u0142. wymuszone', a:_v(sA.forced_errors), b:_v(sB.forced_errors)});
    }
    rows.push({l:'B\u0142. niewymuszone', a:_v(sA.unforced_errors), b:_v(sB.unforced_errors)});
    if (mode === 'advanced') {
        rows.push({l:'1. serwis', a:_serveRatio(sA.first_serves_in, sA.first_serves_total), b:_serveRatio(sB.first_serves_in, sB.first_serves_total)});
    }
    rows.push({l:'1. serwis %', a:_v(sA.first_serve_pct,'%'), b:_v(sB.first_serve_pct,'%')});
    if (mode === 'advanced') {
        rows.push({l:'2. serwis %', a:_v(sA.second_serve_pct,'%'), b:_v(sB.second_serve_pct,'%')});
        rows.push({l:'Pkt wygrane', a:_totalPtsWon(sA,sB), b:_totalPtsWon(sB,sA)});
    }
    var title = mode === 'advanced' ? 'Statystyki zaawansowane' : 'Statystyki';
    return '<div class="stats-panel">'
        +'<div class="stats-title">'+title+'</div>'
        +'<div class="stats-header"><div></div><div class="player-col">'+nA+'</div><div class="player-col">'+nB+'</div></div>'
        +rows.map(function(r){return '<div class="stats-row"><div class="stat-label">'+r.l+'</div><div class="stat-value">'+r.a+'</div><div class="stat-value">'+r.b+'</div></div>';}).join('')
        +'</div>';
}

function estimateTopSlotHeight(el) {
    return 136;
}

function slideDirClass(el) {
    if (el.zone === 'top') return 'slide-up';
    if (el.zone === 'bottom') return 'slide-down';
    var y = Number(el.y) || 0;
    var h = Number(el.h) || 0;
    return (y + h / 2) < 540 ? 'slide-up' : 'slide-down';
}

function renderWatermark(preset) {
    var wm = preset.watermark;
    if (!wm || !wm.enabled) return '';
    // Vest Media brand (same file as vestmedia.pl footer) — not tournament logo
    var logo = '/vest-media-logo.png';
    var size = wm.size || 140;
    var opacity = wm.opacity != null ? wm.opacity : 0.4;
    var margin = 36;
    var pos = wm.position || 'bottom-right';
    var place = '';
    if (pos === 'top-left') place = 'left:'+margin+'px;top:'+margin+'px;';
    else if (pos === 'top-right') place = 'right:'+margin+'px;top:'+margin+'px;';
    else if (pos === 'bottom-left') place = 'left:'+margin+'px;bottom:'+margin+'px;';
    else place = 'right:'+margin+'px;bottom:'+margin+'px;';
    return '<img class="ov-watermark" src="'+logo+'" alt="Vest Media" style="'+place+'width:'+size+'px;height:'+size+'px;opacity:'+opacity+';">';
}

function elementKey(el, index) {
    return String(el.type || 'score') + ':' + String(el.court_id != null ? el.court_id : index);
}

function fillWrapper(wrap, el, court) {
    wrap.innerHTML = el.type === 'stats' ? renderStats(el, court) : renderScoreboard(el, court);
}

function applyWrapperChrome(wrap, el, look) {
    var slide = slideDirClass(el);
    wrap.classList.toggle('has-h', !!el.h);
    wrap.classList.remove('slide-up', 'slide-down');
    wrap.classList.add(slide);
    wrap.classList.toggle('no-enter', !look.anim_enter);
    wrap.style.left = (el.x || 0) + 'px';
    wrap.style.top = (el.y || 0) + 'px';
    wrap.style.width = (el.w || 0) + 'px';
    wrap.style.height = el.h ? (el.h + 'px') : '';
}

function scheduleHoldRefresh() {
    if (holdRefreshTimer) {
        clearTimeout(holdRefreshTimer);
        holdRefreshTimer = null;
    }
    var preset = getPreset();
    var soonest = null;
    (preset.elements || []).forEach(function(el) {
        var remaining = holdRemainingMs(resolveCourtState(el.court_id));
        if (remaining == null || remaining <= 0) return;
        if (soonest == null || remaining < soonest) soonest = remaining;
    });
    if (soonest == null) return;
    holdRefreshTimer = setTimeout(function() {
        holdRefreshTimer = null;
        render();
        requestAnimationFrame(fitPlayerNames);
    }, soonest + 40);
}

function finishWrapperExit(key, wrap, el, look) {
    var slot = boardHold[key];
    if (!slot || (slot.phase !== 'exiting' && slot.phase !== 'swapping')) return;
    if (slot.phase === 'swapping' && slot.pendingCourt) {
        fillWrapper(wrap, el, slot.pendingCourt);
        slot.identity = slot.pendingIdentity || courtIdentityKey(slot.pendingCourt);
        slot.lastCourt = cloneCourt(slot.pendingCourt);
        slot.frozen = null;
        slot.pendingCourt = null;
        slot.pendingIdentity = '';
        slot.phase = 'visible';
        boardHold[key] = slot;
        requestAnimationFrame(function() {
            requestAnimationFrame(function() {
                wrap.classList.remove('el-hidden');
                requestAnimationFrame(fitPlayerNames);
            });
        });
        return;
    }
    slot.identity = '';
    slot.frozen = null;
    slot.pendingCourt = null;
    slot.phase = 'hidden';
    boardHold[key] = slot;
    wrap.innerHTML = '';
    render();
}

function startWrapperExit(key, wrap, el, look) {
    if (exitLocks[key]) return;
    exitLocks[key] = true;
    wrap.classList.add('el-hidden');
    var done = false;
    function complete(ev) {
        if (ev && ev.target !== wrap) return;
        if (done) return;
        done = true;
        wrap.removeEventListener('transitionend', complete);
        clearTimeout(fallback);
        delete exitLocks[key];
        finishWrapperExit(key, wrap, el, look);
    }
    var fallback = setTimeout(complete, SCOREBOARD_SLIDE_MS + 80);
    wrap.addEventListener('transitionend', complete);
    if (!look.anim_enter) complete();
}

function syncWrapperBoard(wrap, key, el, look, autoHide) {
    var live = resolveCourtState(el.court_id);
    var slot = boardHold[key] || { phase: 'hidden', identity: '', frozen: null, lastCourt: null };

    if (el.visible === false) {
        wrap.classList.add('el-hidden');
        boardHold[key] = { phase: 'hidden', identity: '', frozen: null, lastCourt: null };
        return;
    }

    if (!autoHide) {
        fillWrapper(wrap, el, live);
        wrap.classList.remove('el-hidden');
        boardHold[key] = {
            phase: 'visible',
            identity: courtIdentityKey(live),
            frozen: null,
            lastCourt: cloneCourt(live),
        };
        return;
    }

    if (slot.phase === 'exiting' || slot.phase === 'swapping') return;

    var show = isScoreboardHeld(live);
    var identity = show ? courtIdentityKey(live) : '';

    if (slot.phase === 'visible' && identity && slot.identity && identity !== slot.identity) {
        slot.frozen = cloneCourt(slot.lastCourt);
        slot.pendingCourt = cloneCourt(live);
        slot.pendingIdentity = identity;
        slot.phase = 'swapping';
        boardHold[key] = slot;
        startWrapperExit(key, wrap, el, look);
        return;
    }

    if (slot.phase === 'visible' && !show) {
        slot.frozen = cloneCourt(slot.lastCourt || live);
        slot.phase = 'exiting';
        boardHold[key] = slot;
        startWrapperExit(key, wrap, el, look);
        return;
    }

    if (slot.phase !== 'visible' && show) {
        fillWrapper(wrap, el, live);
        slot.identity = identity;
        slot.lastCourt = cloneCourt(live);
        slot.frozen = null;
        slot.phase = 'visible';
        boardHold[key] = slot;
        if (look.anim_enter) {
            wrap.classList.add('el-hidden');
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    wrap.classList.remove('el-hidden');
                });
            });
        } else {
            wrap.classList.remove('el-hidden');
        }
        return;
    }

    if (slot.phase === 'visible' && show) {
        fillWrapper(wrap, el, live);
        slot.identity = identity;
        slot.lastCourt = cloneCourt(live);
        boardHold[key] = slot;
    }
}

function render() {
    var preset = getPreset();
    var look = overlayLook(preset);
    var anyOccupied = overlayHasOccupiedCourt(preset) || overlayHasMovingBoard();
    var autoHidden = preset.auto_hide && !anyOccupied;
    var sx = window.innerWidth / 1920;
    var sy = window.innerHeight / 1080;
    var scale = Math.min(sx, sy);
    var elems = preset.elements || [];

    // Apply top-bar grid positioning (mirrors admin overlay.js)
    if (preset.top_bar?.enabled) {
        var topEls = elems.filter(function(e){ return e.zone === 'top'; });
        if (topEls.length > 0) {
            var cols = preset.top_bar.columns || 3;
            var mx = preset.top_bar.margin_x || 0;
            var mt = preset.top_bar.margin_top || 0;
            var gap = preset.top_bar.gap || 10;
            var totalW = 1920 - 2 * mx;
            var usable = topEls.length > cols ? cols : topEls.length;
            var colW = Math.round((totalW - (usable - 1) * gap) / usable);
            var slotH = null;
            if (preset.top_bar.reserve_expanded !== false) {
                slotH = Math.max.apply(null, topEls.map(estimateTopSlotHeight));
            } else if (topEls[0].h) {
                slotH = topEls[0].h;
            }
            topEls.forEach(function(el, i) {
                if (i >= cols) return;
                el.x = Math.round(mx + i * (colW + gap));
                el.y = mt;
                el.w = colW;
                if (slotH) el.h = slotH;
            });
        }
    }

    var app = document.getElementById('app');
    var layout = app.querySelector(':scope > .layout');
    if (!layout) {
        app.innerHTML = '<div class="layout"></div>';
        layout = app.querySelector(':scope > .layout');
    }
    layout.style.transform = 'scale(' + scale + ')';
    layout.classList.toggle('auto-hidden', autoHidden);

    var seen = {};
    elems.forEach(function(el, index) {
        var key = elementKey(el, index);
        seen[key] = true;
        var wrap = layout.querySelector('.element-wrapper[data-el-key="' + key + '"]');
        if (!wrap) {
            wrap = document.createElement('div');
            wrap.className = 'element-wrapper el-hidden ' + slideDirClass(el);
            wrap.setAttribute('data-el-key', key);
            layout.appendChild(wrap);
        }
        applyWrapperChrome(wrap, el, look);
        syncWrapperBoard(wrap, key, el, look, !!preset.auto_hide);
    });

    layout.querySelectorAll('.element-wrapper').forEach(function(node) {
        var key = node.getAttribute('data-el-key');
        if (seen[key]) return;
        node.remove();
        delete boardHold[key];
        delete exitLocks[key];
    });

    var oldWm = layout.querySelector('.ov-watermark');
    if (oldWm) oldWm.remove();
    var wmHtml = renderWatermark(preset);
    if (wmHtml) layout.insertAdjacentHTML('beforeend', wmHtml);

    scheduleHoldRefresh();
}

function connectSSE() {
    if (eventSource) eventSource.close();
    eventSource = new EventSource('/api/stream');
    eventSource.addEventListener('court_update', function(e) {
        try {
            var d = JSON.parse(e.data);
            if (d.court_id) {
                var cid = d.court_id;
                delete d.court_id;
                courts[cid] = d;
                // Track new court IDs dynamically
                if (allCourtIds.indexOf(cid) < 0) {
                    allCourtIds.push(cid);
                    allCourtIds = sortCourtIds(allCourtIds);
                }
                render();
                requestAnimationFrame(fitPlayerNames);
            }
        } catch(err) { console.error('SSE parse:', err); }
    });
    eventSource.onerror = function() { eventSource.close(); setTimeout(connectSSE, 5000); };
}

async function loadSnapshot() {
    try {
        var r = await fetch('/api/snapshot');
        var d = await r.json();
        var c = d.courts || d;
        Object.keys(c).forEach(function(id){ courts[id] = c[id]; });
        // Update dynamic court ID list
        allCourtIds = sortCourtIds(Object.keys(c));
    } catch(e) { console.error('Snapshot:', e); }
}

async function loadSettings() {
    try {
        var r = await fetch('/api/overlay/settings');
        if (r.ok) {
            settings = await r.json();
            syncTournamentContext();
        }
    } catch(e) { /* defaults */ }
}

async function loadActiveTournaments() {
    try {
        var r = await fetch('/api/tournaments/active');
        if (r.ok) {
            activeTournaments = await r.json();
        }
    } catch(e) { /* defaults */ }
    syncTournamentContext();
}

function lastNameOnly(name) {
    var raw = String(name || '');
    if (raw.indexOf(' / ') !== -1) {
        return raw.split(' / ').map(lastNameOnly).join(' / ');
    }
    var parts = raw.trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts[parts.length - 1] : raw;
}

function nameVariantsHtml(full, className) {
    var esc = String(full).replace(/"/g, '&quot;');
    return '<span class="' + className + '" data-full="' + esc + '">'
        + '<span class="sb-name-full">' + full + '</span>'
        + '<span class="sb-name-init">' + abbreviateName(full) + '</span>'
        + '<span class="sb-name-last">' + lastNameOnly(full) + '</span>'
        + '</span>';
}

function abbreviateName(name) {
    var raw = String(name || '');
    if (raw.indexOf(' / ') !== -1) {
        return raw.split(' / ').map(abbreviatePersonName).join(' / ');
    }
    return abbreviatePersonName(raw);
}

function flagSpans(p) {
    var flagUrl = p.flag_url || (p.flag_code ? codeToFlag(p.flag_code) : '');
    var partnerUrl = p.flag_url_partner || (p.flag_code_partner ? codeToFlag(p.flag_code_partner) : '');
    var primary = String(p.flag_code || '').toUpperCase();
    var partner = String(p.flag_code_partner || '').toUpperCase();
    if (flagUrl && partnerUrl && partner && partner !== primary) {
        return '<span class="flag-split">'
            + '<span class="player-flag has-image is-a" style="background-image:url(' + flagUrl + ')"></span>'
            + '<span class="player-flag has-image is-b" style="background-image:url(' + partnerUrl + ')"></span>'
            + '</span>';
    }
    if (flagUrl) return '<span class="player-flag has-image" style="background-image:url(' + flagUrl + ')"></span>';
    return '';
}

function fitPlayerNames() {
    document.querySelectorAll('.player-name').forEach(function(el) {
        el.style.transform = '';
        el.style.overflow = 'hidden';
        if (el.scrollWidth <= el.clientWidth + 1) return;
        el.style.overflow = 'visible';
        el.style.transform = 'scaleX(' + Math.max(el.clientWidth / el.scrollWidth, 0.7) + ')';
        el.style.transformOrigin = 'left center';
    });
}

async function init() {
    await Promise.all([loadSnapshot(), loadSettings(), loadActiveTournaments()]);
    render();
    requestAnimationFrame(fitPlayerNames);
    connectSSE();
    setInterval(async function() {
        await Promise.all([loadSettings(), loadActiveTournaments()]);
        render();
        requestAnimationFrame(fitPlayerNames);
    }, SETTINGS_POLL_MS);
    setInterval(function() {
        document.querySelectorAll('.sb-tv-clock').forEach(function(el) {
            var cid = el.getAttribute('data-court');
            var court = cid ? resolveCourtState(cid) : null;
            var timeStr = calcMatchTime(court);
            if (timeStr) el.textContent = timeStr;
        });
    }, 1000);
    window.addEventListener('resize', function() { render(); requestAnimationFrame(fitPlayerNames); });
}
init();
window.addEventListener('beforeunload', function() { if (eventSource) eventSource.close(); });
