const qs = new URLSearchParams(location.search);
const kort = parseInt(qs.get('kort') || '1', 10);
const $ = sel => document.querySelector(sel);
const live = msg => { const n = $('#live'); if(n){ n.textContent = msg; setTimeout(()=>n.textContent='',800); }};
const ORIGIN = location.origin;

async function execUno(command, value, extra){
  const body = { command };
  if(value !== undefined) body.value = value;
  if(extra && typeof extra === 'object') Object.assign(body, extra);
  const r = await fetch(`/api/uno/exec/${kort}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
  });
  if(!r.ok) throw new Error('UNO HTTP '+r.status);
  return r.json().catch(()=>({}));
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
    try{ await execUno('SetCustomization', undefined, {content:{Flags:true, "Image Fit":"contain"}}); }catch(e){}
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
    try{ await execUno(side==='A' ? 'SetNamePlayerA' : 'SetNamePlayerB', full); }catch(e){}
    updateNames(side, full);
    await primeFlags();
    const fieldId = side==='A' ? 'Player A Flag' : 'Player B Flag';
    const url = flagUrl(p.country, p.flagUrl);
    try{ await execUno('SetCustomizationField', undefined, {fieldId, value:url}); }catch(e){}
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

  try{ const r = await execUno('GetNamePlayerA'); if(r?.payload){ updateNames('A', r.payload); } }catch(e){}
  try{ const r = await execUno('GetNamePlayerB'); if(r?.payload){ updateNames('B', r.payload); } }catch(e){}
  try{ const r = await execUno('GetMode'); if(r?.payload){ $('#modeSel').value = r.payload; } }catch(e){}
  try{ const r = await execUno('GetSet'); if(r?.payload!=null){ $('#current-set').textContent = r.payload; } }catch(e){}
  for(const pl of ['A','B']){
    for(const i of [1,2,3]){
      try{
        const r = await execUno(`GetSet${i}Player${pl}`);
        if(r?.payload!=null) { $(`#s${i}${pl.toLowerCase()}`).textContent = r.payload; }
      }catch(e){}
    }
  }
  try{ const r = await execUno('GetCurrentSetPlayerA'); if(r?.payload!=null){ $('#cga').textContent = r.payload; } }catch(e){}
  try{ const r = await execUno('GetCurrentSetPlayerB'); if(r?.payload!=null){ $('#cgb').textContent = r.payload; } }catch(e){}
  try{ const r = await execUno('GetTieBreakPlayerA'); if(r?.payload!=null){ $('#tba').textContent = r.payload; } }catch(e){}
  try{ const r = await execUno('GetTieBreakPlayerB'); if(r?.payload!=null){ $('#tbb').textContent = r.payload; } }catch(e){}
  try{
    const r = await execUno('GetMatchTime');
    const total = parseInt(r?.payload||'0',10)||0;
    mt.h=Math.floor(total/3600); mt.m=Math.floor((total%3600)/60); mt.s=total%60; updateMt();
  }catch(e){}
}

document.addEventListener('click', e=>{
  const b = e.target.closest('button[data-cmd]');
  if(!b) return;
  const cmd = b.dataset.cmd;
  const sel = b.dataset.select;
  const val = sel ? $(`#${sel}`).value : b.dataset.value;
  execUno(cmd, val).catch(()=>{});
});

document.querySelector('[data-cmd="IncreaseSet"]').addEventListener('click', ()=>{
  const el = $('#current-set'); el.textContent = clamp(parseInt(el.textContent||'1',10)+1,1,5);
});
document.querySelector('[data-cmd="DecreaseSet"]').addEventListener('click', ()=>{
  const el = $('#current-set'); el.textContent = clamp(parseInt(el.textContent||'1',10)-1,1,5);
});

$('#reset-sets').addEventListener('click', async ()=>{
  const cmds = [
    ['SetSet1PlayerA',0],['SetSet2PlayerA',0],['SetSet3PlayerA',0],
    ['SetSet1PlayerB',0],['SetSet2PlayerB',0],['SetSet3PlayerB',0]
  ];
  for(const [c,v] of cmds){ try{ await execUno(c,v); }catch(e){} }
  ['s1a','s2a','s3a','s1b','s2b','s3b'].forEach(id=>$( '#'+id ).textContent='0');
});

$('#reset-current-games').addEventListener('click', async ()=>{
  await execUno('SetCurrentSetPlayerA',0); $('#cga').textContent='0';
  await execUno('SetCurrentSetPlayerB',0); $('#cgb').textContent='0';
});

$('#reset-tb').addEventListener('click', async ()=>{
  await execUno('SetTieBreakPlayerA',0); $('#tba').textContent='0';
  await execUno('SetTieBreakPlayerB',0); $('#tbb').textContent='0';
});

const mt = {h:0,m:0,s:0};
function updateMt(){
  $('#mt-h').textContent = mt.h;
  $('#mt-m').textContent = mt.m;
  $('#mt-s').textContent = mt.s;
  const total = mt.h*3600 + mt.m*60 + mt.s;
  execUno('SetMatchTime', total).catch(()=>{});
}
$('#mt-play').addEventListener('click', ()=>execUno('PlayMatchTime'));
$('#mt-pause').addEventListener('click', ()=>execUno('PauseMatchTime'));
$('#mt-reset').addEventListener('click', async ()=>{
  mt.h=0;mt.m=0;mt.s=0; updateMt(); await execUno('ResetMatchTime');
});
document.addEventListener('click', e=>{
  const b = e.target.closest('button[data-time]');
  if(!b) return;
  const d = parseInt(b.dataset.time,10);
  let total = mt.h*3600 + mt.m*60 + mt.s + d;
  if(total<0) total=0;
  mt.h = Math.floor(total/3600);
  mt.m = Math.floor((total%3600)/60);
  mt.s = total%60;
  updateMt();
});

bootstrap();
