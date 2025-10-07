const qs = new URLSearchParams(location.search);
const appRoot = document.querySelector('#app');
const kortMeta = document.querySelector('meta[name="kort"]');
const kortSource = qs.get('kort') || appRoot?.dataset?.kort || kortMeta?.content || '1';
const parsedKort = Number.parseInt(kortSource, 10);
const kort = Number.isNaN(parsedKort) ? 1 : parsedKort;
if (appRoot) {
  appRoot.dataset.kort = String(kort);
}
const $ = sel => document.querySelector(sel);
const setText = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};
const setSelectValue = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.value = value;
};
const state = {
  names: { A: 'Zawodnik A', B: 'Zawodnik B' },
  currentSet: 1,
  sets: { a: [0, 0, 0], b: [0, 0, 0] },
  currentGames: { A: 0, B: 0 },
  tieBreak: { A: 0, B: 0 },
  matchTime: { h: 0, m: 0, s: 0 },
  mode: '3set',
  serve: 'none'
};
const NAME_TARGETS = {
  A: ['hdr-a', 'pA-name', 'sa-name', 'cga-name', 'tba-name'],
  B: ['hdr-b', 'pB-name', 'sb-name', 'cgb-name', 'tbb-name']
};
const viewContainer = document.querySelector('#view-container');
const tabList = document.querySelector('#view-tabs');
let activeView = null;
const mt = state.matchTime;
const live = (msg, timeout = 800) => {
  const n = $('#live');
  if (n) {
    n.textContent = msg;
    setTimeout(() => {
      if (n.textContent === msg) n.textContent = '';
    }, timeout);
  }
};
const ORIGIN = location.origin;

function renderNames(side){
  const name = state.names[side] || '';
  const ids = NAME_TARGETS[side] || [];
  for (const id of ids) setText(id, name);
}
function renderCurrentSet(){ setText('current-set', state.currentSet); }
function renderSets(){
  state.sets.a.forEach((val, idx) => setText(`s${idx + 1}a`, val));
  state.sets.b.forEach((val, idx) => setText(`s${idx + 1}b`, val));
}
function renderCurrentGames(){
  setText('cga', state.currentGames.A);
  setText('cgb', state.currentGames.B);
}
function renderTieBreak(){
  setText('tba', state.tieBreak.A);
  setText('tbb', state.tieBreak.B);
}
function renderMatchTime(){
  setText('mt-h', mt.h);
  setText('mt-m', mt.m);
  setText('mt-s', mt.s);
}
function renderMode(){ setSelectValue('modeSel', state.mode); }
function renderServe(){
  document.querySelectorAll('#view-container [data-cmd="SetServe"]').forEach(btn => {
    btn.classList.toggle('is-current', (btn.dataset.value || 'none') === state.serve);
  });
}
function renderView(viewId){
  switch(viewId){
    case 'points':
      renderNames('A');
      renderNames('B');
      break;
    case 'serve':
      renderServe();
      break;
    case 'current-set':
      renderNames('A');
      renderNames('B');
      renderCurrentSet();
      renderSets();
      renderCurrentGames();
      break;
    case 'tie-break':
      renderNames('A');
      renderNames('B');
      renderTieBreak();
      break;
    case 'match-time':
      renderMatchTime();
      break;
    case 'settings':
      renderMode();
      break;
    default:
      break;
  }
}

function activateView(viewId){
  if(!viewContainer) return;
  if(activeView === viewId) return;

  const prevTab = tabList?.querySelector('.tabs__item.is-active');
  if(prevTab){
    prevTab.classList.remove('is-active');
    prevTab.setAttribute('aria-selected', 'false');
  }

  const tab = tabList?.querySelector(`[data-view="${viewId}"]`);
  if(tab){
    tab.classList.add('is-active');
    tab.setAttribute('aria-selected', 'true');
  }

  viewContainer.innerHTML = '';
  const tmpl = document.getElementById(`view-${viewId}`);
  if(!tmpl){
    activeView = null;
    return;
  }
  const fragment = tmpl.content.firstElementChild?.cloneNode(true);
  if(!fragment){
    activeView = null;
    return;
  }
  const panelId = `panel-${viewId}`;
  fragment.id = panelId;
  fragment.classList.add('is-active');
  fragment.setAttribute('role', 'tabpanel');
  if(tab){
    tab.setAttribute('aria-controls', panelId);
  }
  viewContainer.appendChild(fragment);
  activeView = viewId;
  renderView(viewId);
}

tabList?.addEventListener('click', e => {
  const btn = e.target.closest('.tabs__item');
  if(!btn) return;
  const viewId = btn.dataset.view;
  if(viewId) activateView(viewId);
});

activateView('points');

function buildPayload(command, value, extra){
  const body = { command };
  if (value !== undefined) body.value = value;
  if (extra && typeof extra === 'object') Object.assign(body, extra);
  return body;
}

async function postJSON(url, body){
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const txt = await r.text();
  let data;
  if (txt) {
    try { data = JSON.parse(txt); } catch (e) { data = { raw: txt }; }
  }
  if (!r.ok) {
    const err = new Error((data && (data.message || data.error)) || `${r.status} ${r.statusText}`);
    err.status = r.status;
    err.details = data;
    throw err;
  }
  return data ?? {};
}

async function callUno(command, value, extra){
  const body = buildPayload(command, value, extra);
  return postJSON(`/api/uno/exec/${kort}`, body);
}

async function dispatchCommand(command, value, extra, opts = {}){
  const body = buildPayload(command, value, extra);
  const reflectBody = opts.reflectPayload || body;

  const sendReflect = () => postJSON(`/api/local/reflect/${kort}`, reflectBody);
  const sendUno = () => postJSON(`/api/uno/exec/${kort}`, body);

  const reflectPromise = sendReflect();
  const unoPromise = opts.reflectFirst
    ? reflectPromise.catch(() => {}).then(() => sendUno())
    : sendUno();

  const [reflectResult, unoResult] = await Promise.allSettled([
    reflectPromise.then(data => ({ target: 'reflect', data })),
    unoPromise.then(data => ({ target: 'uno', data }))
  ]);

  const out = {};
  for (const result of [reflectResult, unoResult]) {
    if (result.status === 'fulfilled') {
      out[result.value.target] = result.value.data;
    } else if (!opts.silent) {
      const err = result.reason || {};
      console.error('Command dispatch error', command, err);
      const details = err.details;
      let msg = err.message || 'Błąd komunikacji';
      if(details){
        let errors = null;
        if(Array.isArray(details.errors)){
          errors = details.errors;
        }else if(details.errors && typeof details.errors === 'object'){
          errors = Object.values(details.errors).reduce((all, item)=>{
            if(Array.isArray(item)) return all.concat(item);
            if(item!=null) all.push(item);
            return all;
          }, []);
        }
        if(errors && errors.length) msg = errors.join(', ');
        else if(typeof details.detail === 'string') msg = details.detail;
      }
      live(msg, 2000);
    }
  }
  return out;
}

function applyCooldown(btn, ms = 220){
  if (!btn) return null;
  if (btn.dataset.cooling === '1') return null;
  btn.dataset.cooling = '1';
  const wasDisabled = btn.disabled;
  if (!wasDisabled) btn.disabled = true;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (!wasDisabled) btn.disabled = false;
    delete btn.dataset.cooling;
  };
  const timer = setTimeout(release, ms);
  return () => {
    clearTimeout(timer);
    release();
  };
}

function flagEmoji(cc=''){ return cc.toUpperCase().replace(/./g,c=>String.fromCodePoint(127397+c.charCodeAt(0))); }
function shortName(first, last){ return `${(first||'').trim().slice(0,1)}. ${last||''}`.trim(); }
function flagUrl(cc, explicit){
  if(explicit) return explicit;
  const up = (cc||'').toUpperCase();
  if(window.FLAG_URLS && window.FLAG_URLS[up]) return window.FLAG_URLS[up];
  return `${ORIGIN}/flags/${up.toLowerCase()}.svg`;
}

function makeCombo(root, side){
  root.classList.add('combo');
  root.setAttribute('role','combobox');
  root.setAttribute('aria-expanded','false');

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'combo__button';
  btn.setAttribute('aria-haspopup','listbox');

  const lbl = document.createElement('span');
  lbl.className = 'combo__label';
  const flag = document.createElement('span');
  flag.className = 'combo__flag';
  flag.textContent = '🏳️';
  const txt = document.createElement('span');
  txt.textContent = 'Wybierz zawodnika';
  lbl.append(flag, txt);

  const chev = document.createElement('span');
  chev.textContent = '▾';

  btn.append(lbl, chev);
  root.append(btn);

  const pop = document.createElement('div');
  pop.className = 'combo__popup';
  pop.setAttribute('role','dialog');
  pop.innerHTML = `
    <input class="combo__search" type="text" placeholder="Szukaj…" aria-label="Szukaj zawodnika">
    <div class="combo__list" role="listbox"></div>
  `;
  root.append(pop);

  const list = pop.querySelector('.combo__list');
  const search = pop.querySelector('.combo__search');

  let options = [];
  function render(filter=''){
    list.innerHTML = '';
    const q = filter.trim().toLowerCase();
    const src = Array.isArray(window.PLAYERS) ? window.PLAYERS : [];
    const filtered = src.filter(p => {
      const s = `${p.first} ${p.last} ${p.country}`.toLowerCase();
      return s.includes(q);
    });
    if(filtered.length===0){
      const empty = document.createElement('div');
      empty.className='combo__empty';
      empty.textContent='Brak wyników';
      list.append(empty);
      return;
    }
    options = filtered;
    for(const p of filtered){
      const opt = document.createElement('div');
      opt.className='combo__opt';
      opt.setAttribute('role','option');
      opt.setAttribute('tabindex','-1');
      const f = document.createElement('span'); f.className='flag'; f.textContent = flagEmoji(p.country);
      const t = document.createElement('span'); t.textContent = `${shortName(p.first,p.last)} (${p.last})`;
      opt.append(f,t);
      opt.addEventListener('click',()=>select(p));
      list.append(opt);
    }
  }
  render();

  let flagsPrimed = false;
  async function primeFlags(){
    if(flagsPrimed) return;
    flagsPrimed = true;
    await dispatchCommand('SetCustomization', undefined, {content:{Flags:true, "Image Fit":"contain"}}, {silent:true});
  }

  function open(){
    root.setAttribute('aria-expanded','true');
    pop.style.display='flex';
    search.value=''; render('');
    setTimeout(()=>search.focus(),10);
  }
  function close(){
    root.setAttribute('aria-expanded','false');
    pop.style.display='none';
    btn.focus();
  }

  async function select(p){
    flag.textContent = flagEmoji(p.country);
    txt.textContent = `${shortName(p.first,p.last)} (${p.country})`;
    close();
    const full = `${p.first} ${p.last}`.trim();
    updateNames(side, full);
    await dispatchCommand(side==='A' ? 'SetNamePlayerA' : 'SetNamePlayerB', full, undefined, {reflectFirst:true});
    await primeFlags();
    const fieldId = side==='A' ? 'Player A Flag' : 'Player B Flag';
    const url = flagUrl(p.country, p.flagUrl);
    await dispatchCommand('SetCustomizationField', undefined, {fieldId, value:url}, {silent:true});
    live(`Wybrano: ${full}`);
  }

  btn.addEventListener('click', ()=> root.getAttribute('aria-expanded')==='true' ? close() : open());
  document.addEventListener('click', (e)=>{ if(!root.contains(e.target)) close(); });
  search.addEventListener('input', e=>render(e.target.value));
}

function updateNames(side, full){
  const fallback = side === 'A' ? 'Zawodnik A' : 'Zawodnik B';
  state.names[side] = (full || fallback).trim() || fallback;
  renderNames(side);
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

async function bootstrap(){
  $('#app').dataset.kort = String(kort);
  $('#hdr-court').textContent = `Kort ${kort}`;
  makeCombo($('#cbxA'), 'A');
  makeCombo($('#cbxB'), 'B');

  try{ const r = await callUno('GetNamePlayerA'); if(r?.payload){ updateNames('A', r.payload); } }catch(e){}
  try{ const r = await callUno('GetNamePlayerB'); if(r?.payload){ updateNames('B', r.payload); } }catch(e){}
  try{ const r = await callUno('GetMode'); if(r?.payload){ state.mode = r.payload; renderMode(); } }catch(e){}
  try{ const r = await callUno('GetSet'); if(r?.payload!=null){ state.currentSet = clamp(parseInt(r.payload,10)||1,1,5); renderCurrentSet(); } }catch(e){}
  for(const pl of ['A','B']){
    const key = pl.toLowerCase();
    for(const i of [1,2,3]){
      try{
        const r = await callUno(`GetSet${i}Player${pl}`);
        if(r?.payload!=null) { state.sets[key][i-1] = parseInt(r.payload,10)||0; }
      }catch(e){}
    }
  }
  renderSets();
  try{ const r = await callUno('GetCurrentSetPlayerA'); if(r?.payload!=null){ state.currentGames.A = parseInt(r.payload,10)||0; } }catch(e){}
  try{ const r = await callUno('GetCurrentSetPlayerB'); if(r?.payload!=null){ state.currentGames.B = parseInt(r.payload,10)||0; } }catch(e){}
  renderCurrentGames();
  try{ const r = await callUno('GetTieBreakPlayerA'); if(r?.payload!=null){ state.tieBreak.A = parseInt(r.payload,10)||0; } }catch(e){}
  try{ const r = await callUno('GetTieBreakPlayerB'); if(r?.payload!=null){ state.tieBreak.B = parseInt(r.payload,10)||0; } }catch(e){}
  renderTieBreak();
  try{
    const r = await callUno('GetMatchTime');
    const total = parseInt(r?.payload||'0',10)||0;
    mt.h=Math.floor(total/3600); mt.m=Math.floor((total%3600)/60); mt.s=total%60; await updateMt();
  }catch(e){}
}

document.addEventListener('click', async e=>{
  const b = e.target.closest('button[data-cmd]');
  if(!b) return;
  const release = applyCooldown(b);
  if(!release) return;
  const cmd = b.dataset.cmd;
  const sel = b.dataset.select;
  const val = sel ? $(`#${sel}`)?.value : b.dataset.value;
  switch(cmd){
    case 'IncreaseSet':
      state.currentSet = clamp(state.currentSet + 1, 1, 5);
      renderCurrentSet();
      break;
    case 'DecreaseSet':
      state.currentSet = clamp(state.currentSet - 1, 1, 5);
      renderCurrentSet();
      break;
    case 'SetServe':
      state.serve = val || 'none';
      renderServe();
      break;
    case 'SetMode':
      if(val != null){
        state.mode = val;
        renderMode();
      }
      break;
    default:
      break;
  }
  try{
    await dispatchCommand(cmd, val);
  }finally{
    release();
  }
});

document.addEventListener('click', async e=>{
  const btn = e.target.closest('#reset-sets');
  if(!btn) return;
  const release = applyCooldown(btn, 400);
  if(!release) return;
  const cmds = [
    ['SetSet1PlayerA',0],['SetSet2PlayerA',0],['SetSet3PlayerA',0],
    ['SetSet1PlayerB',0],['SetSet2PlayerB',0],['SetSet3PlayerB',0]
  ];
  try{
    for(const [c,v] of cmds){ await dispatchCommand(c, v, undefined, {silent:true}); }
    state.sets.a = [0,0,0];
    state.sets.b = [0,0,0];
    renderSets();
  }finally{
    release();
  }
});

document.addEventListener('click', async e=>{
  const btn = e.target.closest('#reset-current-games');
  if(!btn) return;
  const release = applyCooldown(btn, 400);
  if(!release) return;
  try{
    await dispatchCommand('SetCurrentSetPlayerA',0, undefined, {silent:true});
    await dispatchCommand('SetCurrentSetPlayerB',0, undefined, {silent:true});
    state.currentGames.A = 0;
    state.currentGames.B = 0;
    renderCurrentGames();
  }finally{
    release();
  }
});

document.addEventListener('click', async e=>{
  const btn = e.target.closest('#reset-tb');
  if(!btn) return;
  const release = applyCooldown(btn, 400);
  if(!release) return;
  try{
    await dispatchCommand('SetTieBreakPlayerA',0, undefined, {silent:true});
    await dispatchCommand('SetTieBreakPlayerB',0, undefined, {silent:true});
    state.tieBreak.A = 0;
    state.tieBreak.B = 0;
    renderTieBreak();
  }finally{
    release();
  }
});

function updateMt(){
  renderMatchTime();
  const total = mt.h*3600 + mt.m*60 + mt.s;
  return dispatchCommand('SetMatchTime', total, undefined, {silent:true});
}
document.addEventListener('click', async e=>{
  const btn = e.target.closest('#mt-play');
  if(!btn) return;
  const release = applyCooldown(btn);
  if(!release) return;
  try{
    await dispatchCommand('PlayMatchTime', undefined, undefined, {silent:true});
  }finally{
    release();
  }
});
document.addEventListener('click', async e=>{
  const btn = e.target.closest('#mt-pause');
  if(!btn) return;
  const release = applyCooldown(btn);
  if(!release) return;
  try{
    await dispatchCommand('PauseMatchTime', undefined, undefined, {silent:true});
  }finally{
    release();
  }
});
document.addEventListener('click', async e=>{
  const btn = e.target.closest('#mt-reset');
  if(!btn) return;
  const release = applyCooldown(btn, 400);
  if(!release) return;
  mt.h=0;mt.m=0;mt.s=0;
  try{
    await updateMt();
    await dispatchCommand('ResetMatchTime', undefined, undefined, {silent:true});
  }finally{
    release();
  }
});
document.addEventListener('click', async e=>{
  const b = e.target.closest('button[data-time]');
  if(!b) return;
  const release = applyCooldown(b);
  if(!release) return;
  const d = parseInt(b.dataset.time,10);
  let total = mt.h*3600 + mt.m*60 + mt.s + d;
  if(total<0) total=0;
  mt.h = Math.floor(total/3600);
  mt.m = Math.floor((total%3600)/60);
  mt.s = total%60;
  try{
    await updateMt();
  }finally{
    release();
  }
});

bootstrap();
