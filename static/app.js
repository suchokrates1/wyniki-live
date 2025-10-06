let COURTS = [];
const grid = document.getElementById('grid');
const navlist = document.getElementById('navlist');
const errLine = document.getElementById('errLine');
const pauseBtn = document.getElementById('pauseBtn');
const lastRefresh = document.getElementById('lastRefresh');

let paused = false;
let prev = {};
let timer = null;

function flash(el){
  if (!el) return;
  el.classList.add('changed');
  setTimeout(() => el.classList.remove('changed'), 1200);
}

function lsKey(k){ return `announce-k${k}`; }
function getAnnounce(k){ return localStorage.getItem(lsKey(k)) === 'on'; }
function setAnnounce(k, val){ localStorage.setItem(lsKey(k), val ? 'on' : 'off'); }

function makeCourtCard(k){
  const section = document.createElement('section');
  section.className = 'card';
  section.id = `kort-${k}`;
  section.setAttribute('aria-labelledby', `heading-${k}`);
  section.innerHTML = `
    <div class="card-head">
      <h2 id="heading-${k}">
        Kort ${k} — <span id="title-${k}">Gracz A vs Gracz B</span>
      </h2>
      <label class="control">
        <input type="checkbox" id="announce-${k}">
        <span>Czytaj wynik</span>
      </label>
    </div>

    <p class="status" id="status-${k}">
      <span class="dot off" aria-hidden="true"></span>
      <span class="txt">Status: nieznany</span>
    </p>

    <table aria-describedby="status-${k}">
      <caption id="cap-${k}" class="sr-only">Wyniki – Kort ${k}: Gracz A vs Gracz B</caption>
      <thead>
        <tr>
          <th scope="col">Nazwisko</th>
          <th scope="col">Punkty</th>
          <th scope="col">Set&nbsp;1 (gemy)</th>
          <th scope="col">Set&nbsp;2 (gemy)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th id="k${k}-name-A" scope="row">-</th>
          <td id="k${k}-pts-A">-</td>
          <td id="k${k}-s1-A">0</td>
          <td id="k${k}-s2-A">0</td>
        </tr>
        <tr>
          <th id="k${k}-name-B" scope="row">-</th>
          <td id="k${k}-pts-B">-</td>
          <td id="k${k}-s1-B">0</td>
          <td id="k${k}-s2-B">0</td>
        </tr>
      </tbody>
    </table>

    <div id="live-${k}" class="sr-only" aria-live="polite" aria-atomic="true"></div>
  `;

  const cb = section.querySelector(`#announce-${k}`);
  cb.checked = getAnnounce(k);
  cb.addEventListener('change', () => setAnnounce(k, cb.checked));

  return section;
}

function ensureCardsFromSnapshot(snap){
  COURTS = Object.keys(snap).sort((a,b)=>Number(a)-Number(b));
  navlist.innerHTML = '';
  COURTS.forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = `<a href="#kort-${k}">Kort ${k}</a>`;
    navlist.appendChild(li);
  });
  grid.innerHTML = '';
  COURTS.forEach(k => grid.appendChild(makeCourtCard(k)));
}

function setStatus(k, visible, tieVisible){
  const p = document.getElementById(`status-${k}`);
  const dot = p.querySelector('.dot');
  const txt = p.querySelector('.txt');

  let mainStatus = 'nieznany';
  if (visible === true) mainStatus = 'widoczny';
  else if (visible === false) mainStatus = 'ukryty';

  const tieTxt = tieVisible === true ? ' | Super tiebreak: TAK'
               : tieVisible === false ? ' | Super tiebreak: NIE'
               : '';

  txt.textContent = `Status: ${mainStatus}${tieTxt}`;
  if (visible === true) { dot.classList.remove('off'); dot.classList.add('on'); }
  else { dot.classList.remove('on'); dot.classList.add('off'); }
}

function announce(k, text){
  if (!getAnnounce(k)) return;
  const live = document.getElementById(`live-${k}`);
  live.textContent = text;
}

function announcePoints(k, surname, pointsText){
  if (!surname || surname === '-') surname = 'zawodnik';
  announce(k, `punkty ${surname} ${pointsText}`);
}

function announceGames(k, surname, games){
  if (!surname || surname === '-') surname = 'zawodnik';
  announce(k, `gemy ${surname} ${games}`);
}

function announceSetEnd(k, winnerSurname, winnerGames, loserSurname, loserGames){
  if (!winnerSurname || winnerSurname === '-') winnerSurname = 'zawodnik';
  if (!loserSurname || loserSurname === '-') loserSurname = 'rywal';
  announce(k, `koniec seta: ${winnerSurname} ${winnerGames} do ${loserSurname} ${loserGames}`);
}

function announceTiePoint(k, surname, value){
  if (!surname || surname === '-') surname = 'zawodnik';
  announce(k, `tiebreak ${surname} ${value}`);
}

function announceTieToggle(k, on){
  announce(k, on ? 'Super tiebreak rozpoczęty' : 'Super tiebreak zakończony');
}

function updateTitle(k, Aname, Bname){
  const title = document.getElementById(`title-${k}`);
  const cap = document.getElementById(`cap-${k}`);
  const safeA = (Aname && Aname !== '-') ? Aname : 'Gracz A';
  const safeB = (Bname && Bname !== '-') ? Bname : 'Gracz B';
  title.textContent = `${safeA} vs ${safeB}`;
  cap.textContent = `Wyniki – Kort ${k}: ${safeA} vs ${safeB}`;
}

function updateCourt(k, data){
  // status + tiebreak indicator
  setStatus(k, data.overlay_visible, data.tie?.visible);

  const prevK = prev[k] || { A:{}, B:{}, tie:{} };
  const A = data.A || {}, B = data.B || {};

  const nameAChanged = A.surname !== undefined && A.surname !== prevK?.A?.surname;
  const nameBChanged = B.surname !== undefined && B.surname !== prevK?.B?.surname;
  if (nameAChanged) {
    const cell = document.getElementById(`k${k}-name-A`);
    cell.textContent = A.surname || '-';
    flash(cell);
  }
  if (nameBChanged) {
    const cell = document.getElementById(`k${k}-name-B`);
    cell.textContent = B.surname || '-';
    flash(cell);
  }
  if (nameAChanged || nameBChanged) {
    updateTitle(k, A.surname, B.surname);
  }

  // POINTS
  if (A.points !== undefined && A.points !== prevK?.A?.points){
    const cell = document.getElementById(`k${k}-pts-A`);
    cell.textContent = A.points ?? '-';
    flash(cell);
    announcePoints(k, A.surname || prevK?.A?.surname, cell.textContent);
  }
  if (B.points !== undefined && B.points !== prevK?.B?.points){
    const cell = document.getElementById(`k${k}-pts-B`);
    cell.textContent = B.points ?? '-';
    flash(cell);
    announcePoints(k, B.surname || prevK?.B?.surname, cell.textContent);
  }

  // GAMES – SET 1
  if (A.set1 !== undefined && A.set1 !== prevK?.A?.set1){
    const cell = document.getElementById(`k${k}-s1-A`); cell.textContent = A.set1 ?? 0; flash(cell);
    announceGames(k, A.surname || prevK?.A?.surname, cell.textContent);
  }
  if (B.set1 !== undefined && B.set1 !== prevK?.B?.set1){
    const cell = document.getElementById(`k${k}-s1-B`); cell.textContent = B.set1 ?? 0; flash(cell);
    announceGames(k, B.surname || prevK?.B?.surname, cell.textContent);
  }
  // koniec set1: 4:x lub x:4 (wywołujemy tylko w momencie osiągnięcia 4)
  const s1A = A.set1 ?? prevK?.A?.set1;
  const s1B = B.set1 ?? prevK?.B?.set1;
  const s1Aprev = prevK?.A?.set1;
  const s1Bprev = prevK?.B?.set1;
  if ((s1A === 4 && s1Aprev !== 4) || (s1B === 4 && s1Bprev !== 4)){
    const winner = (s1A === 4) ? (A.surname || prevK?.A?.surname) : (B.surname || prevK?.B?.surname);
    const loser =  (s1A === 4) ? (B.surname || prevK?.B?.surname) : (A.surname || prevK?.A?.surname);
    const wGames = 4;
    const lGames = (s1A === 4) ? (s1B ?? 0) : (s1A ?? 0);
    announceSetEnd(k, winner, wGames, loser, lGames);
  }

  // GAMES – SET 2
  if (A.set2 !== undefined && A.set2 !== prevK?.A?.set2){
    const cell = document.getElementById(`k${k}-s2-A`); cell.textContent = A.set2 ?? 0; flash(cell);
    announceGames(k, A.surname || prevK?.A?.surname, cell.textContent);
  }
  if (B.set2 !== undefined && B.set2 !== prevK?.B?.set2){
    const cell = document.getElementById(`k${k}-s2-B`); cell.textContent = B.set2 ?? 0; flash(cell);
    announceGames(k, B.surname || prevK?.B?.surname, cell.textContent);
  }
  // koniec set2: 4:x lub x:4
  const s2A = A.set2 ?? prevK?.A?.set2;
  const s2B = B.set2 ?? prevK?.B?.set2;
  const s2Aprev = prevK?.A?.set2;
  const s2Bprev = prevK?.B?.set2;
  if ((s2A === 4 && s2Aprev !== 4) || (s2B === 4 && s2Bprev !== 4)){
    const winner = (s2A === 4) ? (A.surname || prevK?.A?.surname) : (B.surname || prevK?.B?.surname);
    const loser =  (s2A === 4) ? (B.surname || prevK?.B?.surname) : (A.surname || prevK?.A?.surname);
    const wGames = 4;
    const lGames = (s2A === 4) ? (s2B ?? 0) : (s2A ?? 0);
    announceSetEnd(k, winner, wGames, loser, lGames);
  }

  // TIEBREAK
  const tieNow = data.tie || {};
  const tiePrev = prevK.tie || {};

  // przełączenie widoczności tiebreaka
  if (tieNow.visible !== undefined && tieNow.visible !== tiePrev.visible){
    announceTieToggle(k, tieNow.visible === true);
  }
  // punkty tiebreak
  if (typeof tieNow.A === 'number' && tieNow.A !== tiePrev.A){
    announceTiePoint(k, A.surname || prevK?.A?.surname, tieNow.A);
  }
  if (typeof tieNow.B === 'number' && tieNow.B !== tiePrev.B){
    announceTiePoint(k, B.surname || prevK?.B?.surname, tieNow.B);
  }
}

async function fetchSnapshot(){
  try{
    const r = await fetch('/api/snapshot', {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    errLine.textContent = '';
    return await r.json();
  }catch(e){
    errLine.textContent = 'Błąd pobierania danych (' + e.message + ').';
    return null;
  }
}

function computeCourts(data){
  return Object.keys(data).sort((a,b)=>Number(a)-Number(b));
}

async function bootstrap(){
  const data = await fetchSnapshot();
  if (!data) return;
  ensureCardsFromSnapshot(data);
  COURTS = computeCourts(data);
  COURTS.forEach(k => { if (data[k]) updateCourt(k, data[k]); });
  prev = data;
  lastRefresh.textContent = new Date().toLocaleTimeString();
}

async function tick(){
  if (paused) return;
  const data = await fetchSnapshot();
  if (!data) return;

  const keysNow = computeCourts(data);
  if (keysNow.join(',') !== COURTS.join(',')) {
    ensureCardsFromSnapshot(data);
    COURTS = keysNow;
  }
  COURTS.forEach(k => { if (data[k]) updateCourt(k, data[k]); });
  prev = data;
  lastRefresh.textContent = new Date().toLocaleTimeString();
}

function start(){
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 1000);
}

pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.setAttribute('aria-pressed', String(paused));
  pauseBtn.textContent = paused ? 'Wznów odświeżanie' : 'Wstrzymaj odświeżanie';
});

bootstrap().then(start);
