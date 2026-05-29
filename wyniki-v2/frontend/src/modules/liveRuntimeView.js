import { publicApi } from '../api/publicApi.js';

function flash(el) {
  if (!el) return;
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 1200);
}

function animatePointsChange(cell, prevText, nextText) {
  try {
    const old = String(prevText ?? '');
    const neu = String(nextText ?? '');
    const max = Math.max(old.length, neu.length);
    const container = document.createElement('span');
    container.className = 'digits';
    for (let i = 0; i < max; i++) {
      const digit = document.createElement('span');
      digit.className = 'digit';
      const spanOld = document.createElement('span');
      spanOld.className = 'd-old';
      spanOld.textContent = old[i] ?? '';
      const spanNew = document.createElement('span');
      spanNew.className = 'd-new';
      spanNew.textContent = neu[i] ?? '';
      digit.append(spanOld, spanNew);
      container.appendChild(digit);
    }
    cell.innerHTML = '';
    cell.appendChild(container);
    cell.classList.add('rolling');
    setTimeout(() => {
      cell.classList.remove('rolling');
      cell.textContent = nextText;
    }, 350);
  } catch {
    cell.textContent = nextText;
  }
}

export function createLiveRuntimeView() {
  return {
    courts: {},
    publicCourtIds: {},
    prevCourts: {},
    loading: true,
    error: null,
    lastUpdate: null,
    tournamentName: null,

    async fetchInitialData() {
      try {
        const data = await publicApi.getSnapshot();
        const courts = data.courts || {};
        this.courts = courts;
        this.publicCourtIds = Object.keys(courts).reduce((acc, courtId) => {
          acc[String(courtId)] = true;
          return acc;
        }, {});
        this.tournamentName = data.tournament_name || null;
        this.loading = false;
        this.lastUpdate = new Date();
      } catch (err) {
        this.error = err.message;
        this.loading = false;
      }
    },

    connectSSE() {
      const eventSource = new EventSource('/api/stream');

      eventSource.addEventListener('court_update', (e) => {
        try {
          const data = JSON.parse(e.data);
          const courtId = String(data.court_id);
          if (!this.publicCourtIds[courtId]) return;
          const prev = this.courts[courtId];

          this.$nextTick(() => {
            this.animateChanges(courtId, prev, data);
          });

          this.prevCourts[courtId] = prev ? { ...prev } : {};
          this.courts[courtId] = data;
          this.lastUpdate = new Date();
          if (prev?.match_status?.active && !data?.match_status?.active) {
            this.fetchHistory();
            if (this.liveSubTab === 'schedule') this.fetchSchedule();
          }
        } catch { /* ignore parse errors */ }
      });

      eventSource.onerror = () => {
        this.error = 'Połączenie przerwane';
        setTimeout(() => this.connectSSE(), 5000);
      };
    },

    animateChanges(courtId, prev, next) {
      if (!prev) return;
      const sides = ['A', 'B'];

      sides.forEach(side => {
        const prevPts = this.resolveDisplayPoints(prev, side);
        const nextPts = this.resolveDisplayPoints(next, side);
        if (prevPts !== nextPts) {
          const el = document.getElementById(`k${courtId}-pts-${side}`);
          if (el) {
            animatePointsChange(el, prevPts, nextPts);
            flash(el);
            if (nextPts === 'ADV' || nextPts === '40') {
              el.classList.add('flip-strong');
              setTimeout(() => el.classList.remove('flip-strong'), 450);
            }
          }
        }
      });

      for (let setIndex = 1; setIndex <= 3; setIndex++) {
        sides.forEach(side => {
          const key = `set${setIndex}`;
          const prevVal = prev[side]?.[key];
          const nextVal = next[side]?.[key];
          if (nextVal !== undefined && nextVal !== prevVal) {
            const el = document.getElementById(`k${courtId}-s${setIndex}-${side}`);
            if (el) flash(el);
          }
        });
      }

      sides.forEach(side => {
        const prevName = prev[side]?.full_name || prev[side]?.surname;
        const nextName = next[side]?.full_name || next[side]?.surname;
        if (nextName && prevName !== nextName) {
          const el = document.getElementById(`k${courtId}-name-${side}`);
          if (el) flash(el);
        }
      });
    },
  };
}