import { abbreviateCompetitorName, lastNameToken, splitTeamDisplayName } from './teamDisplay.js';
import { calcMatchTime } from './matchTime.js';
import { overlayCategoryLabel, overlayPhaseLabel } from './overlayLabel.js';

export const TV_SERVE_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#C6E953" stroke="#ffffff" stroke-width="2"></circle><path d="M6.2 6.4c5.4 4.5 5.4 14.7 0 19.2" fill="none" stroke="#ffffff" stroke-width="2"></path><path d="M25.8 6.4c-5.4 4.5-5.4 14.7 0 19.2" fill="none" stroke="#ffffff" stroke-width="2"></path></svg>';

const scoreAnim = {};
const scoreAnimHold = {};

export function escapeTvHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function codeToFlag(code) {
  if (!code || String(code).length < 2) return '';
  return 'https://flagcdn.com/w80/' + String(code).toLowerCase().slice(0, 2) + '.png';
}

export function tvFlagSpans(player) {
  const p = player || {};
  const flagUrl = p.flag_url || (p.flag_code ? codeToFlag(p.flag_code) : '');
  const partnerUrl = p.flag_url_partner || (p.flag_code_partner ? codeToFlag(p.flag_code_partner) : '');
  const primary = String(p.flag_code || '').toUpperCase();
  const partner = String(p.flag_code_partner || '').toUpperCase();
  if (flagUrl && partnerUrl && partner && partner !== primary) {
    return '<span class="flag-split">'
      + '<span class="sb-flag is-a" style="background-image:url(' + escapeTvHtml(flagUrl) + ')"></span>'
      + '<span class="sb-flag is-b" style="background-image:url(' + escapeTvHtml(partnerUrl) + ')"></span>'
      + '</span>';
  }
  if (flagUrl) return '<span class="sb-flag" style="background-image:url(' + escapeTvHtml(flagUrl) + ')"></span>';
  return '';
}

function tbSuperscripts(setInfo) {
  if (!setInfo || setInfo.tb == null || setInfo.stb) return { a: '', b: '' };
  const a = Number(setInfo.p1 || 0);
  const b = Number(setInfo.p2 || 0);
  if (a === b) return { a: '', b: '' };
  const tb = escapeTvHtml(String(setInfo.tb));
  return a < b ? { a: tb, b: '' } : { a: '', b: tb };
}

function lastNameOnly(name) {
  const split = splitTeamDisplayName(name);
  if (split) return lastNameToken(split[0]) + ' / ' + lastNameToken(split[1]);
  return lastNameToken(name) || String(name || '');
}

export function tvNameVariantsHtml(full, className) {
  const safe = escapeTvHtml(full);
  return '<span class="' + className + '" data-full="' + safe + '">'
    + '<span class="sb-name-full">' + safe + '</span>'
    + '<span class="sb-name-init">' + escapeTvHtml(abbreviateCompetitorName(full)) + '</span>'
    + '<span class="sb-name-last">' + escapeTvHtml(lastNameOnly(full)) + '</span>'
    + '</span>';
}

function setCellHtml(val, sup, kind, flashCls) {
  const supHtml = sup ? '<span class="sb-tv-sup">' + sup + '</span>' : '';
  const cls = 'sb-tv-set ' + kind + (flashCls ? ' ' + flashCls : '');
  return '<div class="' + cls + '"><span>' + escapeTvHtml(val) + '</span>' + supHtml + '</div>';
}

function takeScoreAnim(cid, sig) {
  const prev = scoreAnim[cid];
  if (!prev) {
    scoreAnim[cid] = { ...sig, tbLabel: sig.tbLabel || '' };
    return { just: {}, prevServe: sig.serve };
  }
  const just = {
    sets: sig.sets !== prev.sets,
    serve: sig.serve !== prev.serve,
    tb: !!(sig.tbLabel && sig.tbLabel !== prev.tbLabel),
    tbHide: !!(!sig.tbLabel && prev.tbLabel),
  };
  scoreAnim[cid] = { ...sig, tbLabel: sig.tbLabel || '' };
  return { just, prevServe: prev.serve, prevTbLabel: prev.tbLabel || '' };
}

function beginScoreAnimHold(cid, flags, look, onHoldEnd) {
  const existed = !!scoreAnimHold[cid];
  scoreAnimHold[cid] = { ...scoreAnimHold[cid], ...flags };
  if (existed) return;
  const holdMs = Math.round(700 / (Number(look.anim_speed) > 0 ? look.anim_speed : 1));
  setTimeout(() => {
    delete scoreAnimHold[cid];
    if (typeof onHoldEnd === 'function') onHoldEnd();
  }, holdMs);
}

function resolveScoreMotion(cid, anim, look, actualServe, onHoldEnd) {
  const shownServe = actualServe || '';
  if (look.anim_set !== false) {
    if (anim.just.sets && anim.just.serve) {
      beginScoreAnimHold(cid, { enter: true, peel: true }, look, onHoldEnd);
    } else if (anim.just.sets) {
      beginScoreAnimHold(cid, { peel: true }, look, onHoldEnd);
    } else if (anim.just.serve) {
      beginScoreAnimHold(cid, { enter: true }, look, onHoldEnd);
    }
  }
  if (anim.just.tb) beginScoreAnimHold(cid, { tbRise: true }, look, onHoldEnd);
  if (anim.just.tbHide) {
    beginScoreAnimHold(cid, { tbFall: true, tbFallLabel: anim.prevTbLabel || '' }, look, onHoldEnd);
  }
  const hold = scoreAnimHold[cid];
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

function buildTvScoreModel(court) {
  const pA = court.A || {};
  const pB = court.B || {};
  const active = !!court.match_status?.active;
  const curSet = court.current_set || 1;
  const hasSetDetail = Array.isArray(court.sets_detail) && court.sets_detail.length > 0;
  const wins = { A: 0, B: 0 };
  if (hasSetDetail) {
    for (const setInfo of court.sets_detail) {
      if (setInfo?.stb) continue;
      const a = Number(setInfo?.p1 ?? 0);
      const b = Number(setInfo?.p2 ?? 0);
      if (a > b) wins.A += 1;
      else if (b > a) wins.B += 1;
    }
  } else {
    for (let setIdx = 1; setIdx <= 2; setIdx += 1) {
      const a = Number(pA['set' + setIdx] || 0);
      const b = Number(pB['set' + setIdx] || 0);
      if (a > b) wins.A += 1;
      else if (b > a) wins.B += 1;
    }
  }
  const isSuperTB = !!court.super_tiebreak_active || (Number(curSet) === 3 && wins.A === 1 && wins.B === 1);
  const readSetValue = (playerState, setIdx) => {
    if (active && setIdx > curSet) return 0;
    return playerState['set' + setIdx] || 0;
  };
  const completed = [];
  if (hasSetDetail) {
    court.sets_detail.forEach((d) => {
      if (d?.stb) return;
      const sup = tbSuperscripts(d);
      completed.push({ a: Number(d.p1 || 0), b: Number(d.p2 || 0), supA: sup.a, supB: sup.b });
    });
  } else {
    const lastCompleted = active ? (curSet - 1) : 3;
    for (let s = 1; s <= lastCompleted && s <= 3; s++) {
      const a = Number(readSetValue(pA, s) || 0);
      const b = Number(readSetValue(pB, s) || 0);
      if (!active && a === 0 && b === 0) continue;
      completed.push({ a, b, supA: '', supB: '' });
    }
  }
  let liveGames = (active && !isSuperTB)
    ? { a: Number(readSetValue(pA, curSet) || 0), b: Number(readSetValue(pB, curSet) || 0) }
    : null;
  if (!liveGames && !isSuperTB && completed.length === 0) {
    liveGames = { a: 0, b: 0 };
  }
  const isTie = court.tie?.visible || false;
  return {
    pA,
    pB,
    active,
    isSuperTB,
    completed,
    liveGames,
    isTie,
    ptA: active ? ((isTie || isSuperTB) ? (court.tie?.A || 0) : (pA.points || '0')) : '\u2014',
    ptB: active ? ((isTie || isSuperTB) ? (court.tie?.B || 0) : (pB.points || '0')) : '\u2014',
    tbOn: active && (isTie || isSuperTB),
  };
}

export function renderTvScoreboard({
  courtId,
  court = {},
  courtName = '',
  look = {},
  bgOpacity = 1,
  onAnimTick,
} = {}) {
  const model = buildTvScoreModel(court);
  const meta = court.history_meta || {};
  const cat = look.phase === false ? '' : overlayCategoryLabel(meta.category);
  const phase = look.phase === false ? '' : overlayPhaseLabel(meta.phase);
  const metaParts = [cat, phase].filter(Boolean).join(' · ');
  const timeStr = (look.clock !== false && model.active) ? (calcMatchTime(court) || '') : '';
  const showFlags = look.flags !== false;
  const gridCols = 'minmax(0,1fr) auto' + (model.liveGames ? ' var(--set-w)' : '') + ' var(--pts-w)';
  const scale = Number(look.scale) > 0 ? Number(look.scale) : 1;
  const speed = Number(look.anim_speed) > 0 ? Number(look.anim_speed) : 1;
  const anim = takeScoreAnim(String(courtId || 'court'), {
    ptsA: String(model.ptA),
    ptsB: String(model.ptB),
    gamesA: model.liveGames ? String(model.liveGames.a) : '',
    gamesB: model.liveGames ? String(model.liveGames.b) : '',
    sets: model.completed.map((c) => c.a + '-' + c.b).join('|'),
    serve: court.serve || '',
    tbLabel: model.tbOn ? (model.isSuperTB ? 'stb' : 'tb') : '',
  });
  const motion = resolveScoreMotion(
    String(courtId || 'court'),
    anim,
    look,
    court.serve || '',
    onAnimTick,
  );

  const pRow = (p, serveKey, sideClass) => {
    const isServing = motion.shownServe === serveKey;
    const flagHtml = showFlags ? (tvFlagSpans(p) || '<span class="sb-flag"></span>') : '';
    const dName = p.full_name || p.surname || '\u2014';
    const teamClass = String(dName).includes(' / ') ? ' is-team' : '';
    let serveCls = isServing ? ' is-on' : '';
    if (look.anim_set !== false && isServing && (motion.rideServe || motion.enterServe)) serveCls += ' is-peel';
    const doneHtml = model.completed.map((c, i) => {
      const val = serveKey === 'A' ? c.a : c.b;
      const sup = serveKey === 'A' ? c.supA : c.supB;
      const flash = (motion.setPeel && i === model.completed.length - 1) ? 'is-peel' : '';
      return setCellHtml(val, sup, 'is-done', flash);
    }).join('');
    const liveHtml = model.liveGames
      ? setCellHtml(serveKey === 'A' ? model.liveGames.a : model.liveGames.b, '', 'is-live')
      : '';
    const ptsVal = serveKey === 'A' ? model.ptA : model.ptB;
    return '<div class="sb-tv-row ' + sideClass + '">'
      + '<div class="sb-tv-player">'
      + (showFlags ? '<div class="sb-tv-flag">' + flagHtml + '</div>' : '')
      + tvNameVariantsHtml(dName, 'sb-name' + teamClass)
      + '<span class="sb-tv-serve' + serveCls + '">' + TV_SERVE_SVG + '</span></div>'
      + '<div class="sb-tv-dones">' + doneHtml + '</div>'
      + liveHtml
      + '<div class="sb-tv-pts' + (model.tbOn ? ' is-tiebreak' : '') + '">' + escapeTvHtml(ptsVal) + '</div>'
      + '</div>';
  };

  const tbText = motion.tbFall
    ? (motion.tbFallLabel === 'stb' ? 'Super tie-break' : 'Tie-break')
    : (model.tbOn ? (model.isSuperTB ? 'Super tie-break' : 'Tie-break') : '');
  const tbHtml = tbText
    ? '<span class="sb-tv-tb' + (motion.tbFall ? ' is-fall' : (motion.tbRise ? ' is-rise' : '')) + '">' + tbText + '</span>'
    : '';
  const clockHtml = timeStr ? '<span class="sb-tv-clock">' + escapeTvHtml(timeStr) + '</span>' : '';
  const opacityStyle = bgOpacity < 1 ? 'opacity:' + bgOpacity + ';' : '';
  const inactiveClass = model.active ? '' : ' match-inactive';

  return '<div class="sb-tv' + inactiveClass + '" style="' + opacityStyle + '--sb-cols:' + gridCols + ';--sb-speed:' + speed + ';transform:scale(' + scale + ');transform-origin:top left;">'
    + '<div class="sb-tv-card">'
    + '<div class="sb-tv-header">'
    + (courtName ? '<span class="sb-tv-court">' + escapeTvHtml(courtName) + '</span>' : '')
    + '<span class="sb-tv-meta">' + escapeTvHtml(metaParts) + '</span>'
    + tbHtml
    + clockHtml + '</div>'
    + '<div class="sb-tv-rows">'
    + pRow(model.pA, 'A', 'side-a')
    + pRow(model.pB, 'B', 'side-b')
    + '</div></div></div>';
}
