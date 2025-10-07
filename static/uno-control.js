const qs = new URLSearchParams(location.search);
const kort = parseInt(qs.get('kort') || '1', 10);
const $ = sel => document.querySelector(sel);
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
  if(side==='A'){
    $('#hdr-a').textContent = full;
    $('#pA-name').textContent = full;
    $('#sa-name').textContent = full;
    $('#cga-name').textContent = full;
    $('#tba-name').textContent = full;
  }else{
    $('#hdr-b').textContent = full;
    $('#pB-name').textContent = full;
    $('#sb-name').textContent = full;
    $('#cgb-name').textContent = full;
    $('#tbb-name').textContent = full;
  }
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

async function bootstrap(){
  $('#app').dataset.kort = String(kort);
  $('#hdr-court').textContent = `Kort ${kort}`;
  makeCombo($('#cbxA'), 'A');
  makeCombo($('#cbxB'), 'B');

  try{ const r = await callUno('GetNamePlayerA'); if(r?.payload){ updateNames('A', r.payload); } }catch(e){}
  try{ const r = await callUno('GetNamePlayerB'); if(r?.payload){ updateNames('B', r.payload); } }catch(e){}
  try{ const r = await callUno('GetMode'); if(r?.payload){ $('#modeSel').value = r.payload; } }catch(e){}
  try{ const r = await callUno('GetSet'); if(r?.payload!=null){ $('#current-set').textContent = r.payload; } }catch(e){}
  for(const pl of ['A','B']){
    for(const i of [1,2,3]){
      try{
        const r = await callUno(`GetSet${i}Player${pl}`);
        if(r?.payload!=null) { $(`#s${i}${pl.toLowerCase()}`).textContent = r.payload; }
      }catch(e){}
    }
  }
  try{ const r = await callUno('GetCurrentSetPlayerA'); if(r?.payload!=null){ $('#cga').textContent = r.payload; } }catch(e){}
  try{ const r = await callUno('GetCurrentSetPlayerB'); if(r?.payload!=null){ $('#cgb').textContent = r.payload; } }catch(e){}
  try{ const r = await callUno('GetTieBreakPlayerA'); if(r?.payload!=null){ $('#tba').textContent = r.payload; } }catch(e){}
  try{ const r = await callUno('GetTieBreakPlayerB'); if(r?.payload!=null){ $('#tbb').textContent = r.payload; } }catch(e){}
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
  const val = sel ? $(`#${sel}`).value : b.dataset.value;
  try{
    await dispatchCommand(cmd, val);
  }finally{
    release();
  }
});

document.querySelector('[data-cmd="IncreaseSet"]').addEventListener('click', ()=>{
  const el = $('#current-set'); el.textContent = clamp(parseInt(el.textContent||'1',10)+1,1,5);
});
document.querySelector('[data-cmd="DecreaseSet"]').addEventListener('click', ()=>{
  const el = $('#current-set'); el.textContent = clamp(parseInt(el.textContent||'1',10)-1,1,5);
});

$('#reset-sets').addEventListener('click', async e=>{
  const release = applyCooldown(e.currentTarget, 400);
  if(!release) return;
  const cmds = [
    ['SetSet1PlayerA',0],['SetSet2PlayerA',0],['SetSet3PlayerA',0],
    ['SetSet1PlayerB',0],['SetSet2PlayerB',0],['SetSet3PlayerB',0]
  ];
  try{
    for(const [c,v] of cmds){ await dispatchCommand(c, v, undefined, {silent:true}); }
    ['s1a','s2a','s3a','s1b','s2b','s3b'].forEach(id=>$( '#'+id ).textContent='0');
  }finally{
    release();
  }
});

$('#reset-current-games').addEventListener('click', async e=>{
  const release = applyCooldown(e.currentTarget, 400);
  if(!release) return;
  try{
    await dispatchCommand('SetCurrentSetPlayerA',0, undefined, {silent:true}); $('#cga').textContent='0';
    await dispatchCommand('SetCurrentSetPlayerB',0, undefined, {silent:true}); $('#cgb').textContent='0';
  }finally{
    release();
  }
});

$('#reset-tb').addEventListener('click', async e=>{
  const release = applyCooldown(e.currentTarget, 400);
  if(!release) return;
  try{
    await dispatchCommand('SetTieBreakPlayerA',0, undefined, {silent:true}); $('#tba').textContent='0';
    await dispatchCommand('SetTieBreakPlayerB',0, undefined, {silent:true}); $('#tbb').textContent='0';
  }finally{
    release();
  }
});

const mt = {h:0,m:0,s:0};
function updateMt(){
  $('#mt-h').textContent = mt.h;
  $('#mt-m').textContent = mt.m;
  $('#mt-s').textContent = mt.s;
  const total = mt.h*3600 + mt.m*60 + mt.s;
  return dispatchCommand('SetMatchTime', total, undefined, {silent:true});
}
$('#mt-play').addEventListener('click', async function(e){
  const release = applyCooldown(e.currentTarget);
  if(!release) return;
  try{
    await dispatchCommand('PlayMatchTime', undefined, undefined, {silent:true});
  }finally{
    release();
  }
});
$('#mt-pause').addEventListener('click', async function(e){
  const release = applyCooldown(e.currentTarget);
  if(!release) return;
  try{
    await dispatchCommand('PauseMatchTime', undefined, undefined, {silent:true});
  }finally{
    release();
  }
});
$('#mt-reset').addEventListener('click', async function(e){
  const release = applyCooldown(e.currentTarget, 400);
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
