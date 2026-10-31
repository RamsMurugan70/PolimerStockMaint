/* ============================================================
   DATA MODEL & PERSISTENCE
============================================================ */
const LSP = window.PPC_STOCK_PREFIX || 'pp_';
const LS = {
  colours: LSP+'colours', constructions: LSP+'constructions', tracers: LSP+'tracers',
  coils: LSP+'coils', dispatches: LSP+'dispatches', counters: LSP+'counters',
  bagConfig: LSP+'bagconfig', bagTare: LSP+'bagtare', bagPacking: LSP+'bagpacking', bagManual: LSP+'bagmanual'
};

const DEFAULTS = {
  colours: ['White','Black','Lemon Yellow','Mono Yellow','GGY','Lona Green','Red'],
  constructions: ['Soft','Medium Soft','Medium','Medium Hard','Hard'],
  tracers: ['Without Tracer','Black','Blue','Red']
};

function loadList(key){
  let v = localStorage.getItem(key);
  if(!v){
    let base = DEFAULTS[Object.keys(LS).find(k=>LS[k]===key)] || [];
    localStorage.setItem(key, JSON.stringify(base));
    return base.slice();
  }
  return JSON.parse(v);
}
function saveList(key, arr){ localStorage.setItem(key, JSON.stringify(arr)); }

function loadCoils(){ return JSON.parse(localStorage.getItem(LS.coils) || '[]'); }
function saveCoils(arr){ localStorage.setItem(LS.coils, JSON.stringify(arr)); }
function loadDispatches(){ return JSON.parse(localStorage.getItem(LS.dispatches) || '[]'); }
function saveDispatches(arr){ localStorage.setItem(LS.dispatches, JSON.stringify(arr)); }
function loadCounters(){ return JSON.parse(localStorage.getItem(LS.counters) || '{}'); }
function saveCounters(o){ localStorage.setItem(LS.counters, JSON.stringify(o)); }

const BAG_CONFIG_DEFAULTS = {7:15, 8:12, 9:10, 10:8, 12:6, 14:2};
function loadBagConfig(){
  let v = localStorage.getItem(LS.bagConfig);
  if(!v){ localStorage.setItem(LS.bagConfig, JSON.stringify(BAG_CONFIG_DEFAULTS)); return {...BAG_CONFIG_DEFAULTS}; }
  return JSON.parse(v);
}
function saveBagConfig(o){ localStorage.setItem(LS.bagConfig, JSON.stringify(o)); }
function loadBagTare(){
  let v = localStorage.getItem(LS.bagTare);
  if(v===null){ localStorage.setItem(LS.bagTare, '0.2'); return 0.2; }
  return parseFloat(v)||0;
}
function saveBagTare(n){ localStorage.setItem(LS.bagTare, String(n)); }
function loadBagPacking(){ return JSON.parse(localStorage.getItem(LS.bagPacking) || '[]'); }
function saveBagPacking(arr){ localStorage.setItem(LS.bagPacking, JSON.stringify(arr)); }

let colours = loadList(LS.colours);
let constructions = loadList(LS.constructions);
let tracers = loadList(LS.tracers);

/* ============================================================
   ABBREVIATIONS / ITEM CODE
============================================================ */
const RESIN_ABBR = {PP:'PP', HDPE:'HD'};
const PRODUCT_ABBR = {Danline:'DL', Mono:'MN'};
const COLOUR_ABBR = {White:'WHT',Black:'BLK','Lemon Yellow':'LYL','Mono Yellow':'MYL',GGY:'GGY','Lona Green':'LGR',Red:'RED'};
const CONSTR_ABBR = {Soft:'SFT','Medium Soft':'MSF',Medium:'MED','Medium Hard':'MHD',Hard:'HRD'};
const TRACER_ABBR = {'Without Tracer':'NT',Black:'BLK',Blue:'BLU',Red:'RED'};

function genAbbr(value, map){
  if(map[value]) return map[value];
  let words = value.trim().split(/\s+/);
  let ab = words.map(w=>w[0]).join('').toUpperCase();
  if(ab.length<2) ab = value.replace(/\s+/g,'').substring(0,3).toUpperCase();
  return ab;
}
function buildItemCode(resin, product, colour, size, construction, tracer, length, lengthUnit){
  return [
    RESIN_ABBR[resin]||resin.substring(0,2).toUpperCase(),
    PRODUCT_ABBR[product]||product.substring(0,2).toUpperCase(),
    genAbbr(colour, COLOUR_ABBR),
    size+'MM',
    genAbbr(construction, CONSTR_ABBR),
    genAbbr(tracer, TRACER_ABBR),
    (length!==undefined && length!==null && length!=='') ? length+lengthUnit.toUpperCase() : lengthUnit.toUpperCase()
  ].join('-');
}
function nextSerial(itemCode){
  // Serial = lowest number not currently used by any existing coil of this item code.
  // So numbers stay continuous: if a coil is deleted (even from the middle), its number is reused next.
  const used = new Set();
  loadCoils().forEach(c=>{
    if(c.itemCode!==itemCode || !c.serial) return;
    const num = parseInt(String(c.serial).split('-').pop(), 10);
    if(!isNaN(num)) used.add(num);
  });
  let n = 1;
  while(used.has(n)) n++;
  let counters = loadCounters();
  counters[itemCode] = Math.max(counters[itemCode]||0, n);
  saveCounters(counters);
  return itemCode+'-'+String(n).padStart(4,'0');
}
// When one or more coils are deleted, if their serial number(s) were the latest
// issued for that item code (no gap), roll the counter back so the next coil
// added continues the sequence instead of skipping the deleted number(s).
function reclaimSerialsForDeleted(deletedCoils){
  if(!deletedCoils || !deletedCoils.length) return;
  const counters = loadCounters();
  const byCode = {};
  deletedCoils.forEach(c=>{
    if(!c || !c.itemCode || !c.serial) return;
    const parts = c.serial.split('-');
    const num = parseInt(parts[parts.length-1], 10);
    if(isNaN(num)) return;
    (byCode[c.itemCode] = byCode[c.itemCode] || []).push(num);
  });
  Object.keys(byCode).forEach(code=>{
    const nums = byCode[code].slice().sort((a,b)=>b-a); // highest first
    let current = counters[code];
    if(current===undefined) return;
    let i=0;
    while(i<nums.length && nums[i]===current){
      current--; i++;
    }
    counters[code] = Math.max(current, 0);
  });
  saveCounters(counters);
}

/* ============================================================
   INIT / NAV
============================================================ */
document.querySelectorAll('nav.tabs button').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('nav.tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    document.querySelectorAll('main .page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-'+b.dataset.page).classList.add('active');
    if(b.dataset.page==='home') renderHome();
    if(b.dataset.page==='dashboard') renderDashboard();
    if(b.dataset.page==='stockEntry') renderStockPage();
    if(b.dataset.page==='dispatch') renderDispatchPage();
    if(b.dataset.page==='dispatchList') renderDispatchList();
    if(b.dataset.page==='customerDispatch') renderCustomerDispatch();
    if(b.dataset.page==='returned') renderReturned();
    if(b.dataset.page==='nonmovable') renderNonMovable();
    if(b.dataset.page==='bagpacking') renderBagPacking();
  };
});

function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.style.display='block';
  clearTimeout(t._h); t._h=setTimeout(()=>t.style.display='none', 2600);
}
function todayStr(){ return new Date().toISOString().slice(0,10); }
function setClock(){
  document.getElementById('clockLine').textContent = new Date().toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'});
}
setClock(); setInterval(setClock,60000);

function fillSelect(id, arr){
  const sel=document.getElementById(id);
  sel.innerHTML = arr.map(v=>`<option value="${v}">${v}</option>`).join('');
}
function addOption(kind, selectId){
  const val = prompt('Enter new value to add:');
  if(!val) return;
  const trimmed = val.trim();
  if(!trimmed) return;
  let arr = kind==='colours'?colours:kind==='constructions'?constructions:tracers;
  if(arr.some(a=>a.toLowerCase()===trimmed.toLowerCase())){ toast('Already exists'); return; }
  arr.push(trimmed);
  saveList(LS[kind], arr);
  fillSelect(selectId, arr);
  document.getElementById(selectId).value = trimmed;
  if(kind==='colours'){ ['f_colour','bp_colour'].forEach(id=>{ const el=document.getElementById(id); if(el && id!==selectId){ const keep=el.value; fillSelect(id,arr); el.value=keep; } }); }
  updateItemCodePreview();
  toast('Added: '+trimmed);
}

/* ============================================================
   STOCK ENTRY PAGE
============================================================ */
function initStockForm(){
  fillSelect('f_colour', colours);
  fillSelect('f_construction', constructions);
  fillSelect('f_tracer', tracers);
  const sizeSel=document.getElementById('f_size');
  sizeSel.innerHTML = Array.from({length:32},(_,i)=>i+1).map(n=>`<option value="${n}">${n} mm</option>`).join('');
  document.getElementById('f_date').value = lockedDetails ? lockedDetails.date : todayStr();
  if(lockedDetails){
    document.getElementById('f_resin').value = lockedDetails.resin;
    document.getElementById('f_product').value = lockedDetails.product;
    document.getElementById('f_colour').value = lockedDetails.colour;
    document.getElementById('f_size').value = lockedDetails.size;
    document.getElementById('f_construction').value = lockedDetails.construction;
    document.getElementById('f_tracer').value = lockedDetails.tracer;
    document.getElementById('f_length').value = lockedDetails.length;
    document.getElementById('f_lengthUnit').value = lockedDetails.lengthUnit;
  }
  ['f_resin','f_product','f_colour','f_size','f_construction','f_tracer','f_length','f_lengthUnit'].forEach(id=>{
    document.getElementById(id).addEventListener('change', updateItemCodePreview);
    document.getElementById(id).addEventListener('input', updateItemCodePreview);
  });
  updateItemCodePreview();
  // restore lock state if a session is active
  if(lockedDetails){
    applyLockUI(true);
  } else {
    applyLockUI(false);
  }
}
function updateItemCodePreview(){
  const code = buildItemCode(
    document.getElementById('f_resin').value,
    document.getElementById('f_product').value,
    document.getElementById('f_colour').value,
    document.getElementById('f_size').value,
    document.getElementById('f_construction').value,
    document.getElementById('f_tracer').value,
    document.getElementById('f_length').value,
    document.getElementById('f_lengthUnit').value
  );
  document.getElementById('f_itemCodePreview').value = code;
}

let lockedDetails = null; // {resin,product,colour,size,construction,tracer,length,lengthUnit,date,itemCode}
let sessionCoils = []; // coils added in this locked session, for on-screen list

function lockItemDetails(){
  const resin=document.getElementById('f_resin').value;
  const product=document.getElementById('f_product').value;
  const colour=document.getElementById('f_colour').value;
  const size=document.getElementById('f_size').value;
  const construction=document.getElementById('f_construction').value;
  const tracer=document.getElementById('f_tracer').value;
  const length=parseFloat(document.getElementById('f_length').value);
  const lengthUnit=document.getElementById('f_lengthUnit').value;
  const date=document.getElementById('f_date').value || todayStr();
  if(!length || length<=0){ toast('Enter a valid Length value'); return; }
  const itemCode = buildItemCode(resin,product,colour,size,construction,tracer,length,lengthUnit);
  lockedDetails = {resin,product,colour,size,construction,tracer,length,lengthUnit,date,itemCode};
  sessionCoils = [];
  applyLockUI(true);
  toast('Item details set: '+itemCode);
}
function unlockItemDetails(){
  lockedDetails=null;
  sessionCoils=[];
  applyLockUI(false);
}
function applyLockUI(locked){
  ['f_resin','f_product','f_colour','f_size','f_construction','f_tracer','f_length','f_lengthUnit','f_date'].forEach(id=>{
    document.getElementById(id).disabled = locked;
  });
  document.getElementById('lockBtn').style.display = locked? 'none':'inline-block';
  document.getElementById('addCoilPanel').style.display = locked? 'block':'none';
  if(locked){
    document.getElementById('lockedCodeLabel').textContent = '— '+lockedDetails.itemCode;
    document.getElementById('lockedLengthLabel').textContent = lockedDetails.length+' '+lockedDetails.lengthUnit;
    renderSessionCoils();
  }
}
function addSingleCoil(){
  if(!lockedDetails){ toast('Set item details first'); return; }
  const weight=parseFloat(document.getElementById('c_weight').value)||0;
  const d=lockedDetails;
  let coils=loadCoils();
  const serial = nextSerial(d.itemCode);
  const coil = {
    id:'c'+Date.now()+Math.random().toString(16).slice(2),
    serial, itemCode:d.itemCode, resin:d.resin, product:d.product, colour:d.colour, size:d.size,
    construction:d.construction, tracer:d.tracer, lengthUnit:d.lengthUnit,
    quantity:d.length, weight, date:d.date, status:'stock',
    dispatchId:null, dispatchDate:null, returnDate:null
  };
  coils.push(coil);
  saveCoils(coils);
  sessionCoils.push(coil);
  document.getElementById('c_weight').value='';
  document.getElementById('c_weight').focus();
  renderSessionCoils();
  renderStockTable();
  toast('Coil '+serial+' added');
}
function renderSessionCoils(){
  document.getElementById('lockedCoilCount').textContent = sessionCoils.length;
  const body=document.getElementById('sessionCoilBody');
  body.innerHTML = sessionCoils.length? sessionCoils.slice().reverse().map(c=>`<tr><td>${c.serial}</td><td>${c.quantity}</td><td>${c.weight||0}</td>
    <td><button class="btn danger sm" onclick="deleteSessionCoil('${c.id}')">✕</button></td></tr>`).join('')
    : '<tr><td colspan="4" class="empty">No coils added yet in this session.</td></tr>';
}
function deleteSessionCoil(id){
  if(!confirm('Remove this coil entry?')) return;
  const allCoils=loadCoils();
  const deleted = allCoils.find(c=>c.id===id);
  let coils=allCoils.filter(c=>c.id!==id);
  saveCoils(coils);
  reclaimSerialsForDeleted(deleted? [deleted] : []);
  sessionCoils = sessionCoils.filter(c=>c.id!==id);
  renderSessionCoils();
  renderStockTable();
}

let stockMode='all';
document.addEventListener('click', e=>{
  if(e.target.matches('.subtabs button[data-mode]')){
    document.querySelectorAll('#page-stockEntry .subtabs button').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    stockMode=e.target.dataset.mode;
    renderStockFilterRow();
    renderStockTable();
  }
  if(e.target.matches('.subtabs button[data-dmode]')){
    document.querySelectorAll('#page-dispatch .subtabs button').forEach(b=>b.classList.remove('active'));
    e.target.classList.add('active');
    dispatchMode=e.target.dataset.dmode;
    renderDispatchFilterRow();
    renderDispatchPickHost();
  }
});

function renderStockFilterRow(){
  const host=document.getElementById('stockFilterRow');
  const coils=loadCoils();
  if(stockMode==='date'){
    host.innerHTML = `<div class="field"><label>Select Date</label><input type="date" id="stockDateFilter" value="${todayStr()}"></div>`;
    document.getElementById('stockDateFilter').onchange = renderStockTable;
  } else if(stockMode==='itemcode'){
    const codes=[...new Set(coils.map(c=>c.itemCode))].sort();
    host.innerHTML = `<div class="field grow"><label>Select Item Code</label><select id="stockItemCodeFilter"><option value="">-- choose --</option>${codes.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>`;
    document.getElementById('stockItemCodeFilter').onchange = renderStockTable;
  } else if(stockMode==='selection'){
    host.innerHTML = `<span class="muted">Coils are grouped below by item code (resin/product/colour/size/construction/tracer/length). Tick any coils across groups, then Print/Excel/PDF exports only the ticked rows.</span>`;
  } else {
    host.innerHTML='';
  }
}

function sortBySerial(list){
  return list.slice().sort((a,b)=>a.serial.localeCompare(b.serial, undefined, {numeric:true, sensitivity:'base'}));
}
function renderStockTable(){
  const host=document.getElementById('stockTableHost');
  let coils = loadCoils();

  if(stockMode==='selection'){
    // grouped display — only coils currently in stock are selectable/deletable here
    const stockOnly = coils.filter(c=>c.status==='stock');
    const groups={};
    stockOnly.forEach(c=>{ (groups[c.itemCode]=groups[c.itemCode]||[]).push(c); });
    let html='';
    Object.keys(groups).sort().forEach(code=>{
      const list=sortBySerial(groups[code]);
      const totalWt=list.reduce((s,c)=>s+(c.weight||0),0);
      html+=`<div class="group-block">
        <div class="group-head" onclick="this.nextElementSibling.classList.toggle('collapsed')">
          <span class="itemcode">${code}</span>
          <span class="meta">${list.length} coils • total ${totalWt.toFixed(3)} kg</span>
        </div>
        <div class="group-body">
          <table><thead><tr><th class="no-print"><input type="checkbox" onclick="toggleGroup(this,'${code}')"></th><th>Serial</th><th>Length</th><th>Weight (Kg)</th><th>Date</th><th class="no-print">Edit</th><th class="no-print">Del</th></tr></thead>
          <tbody>
          ${list.map(c=>`<tr>
            <td class="no-print"><input type="checkbox" class="stockRowChk" data-id="${c.id}"></td>
            <td>${c.serial}</td><td>${c.quantity} ${c.lengthUnit}</td><td>${c.weight||0}</td><td>${c.date}</td>
            <td class="no-print"><button class="btn outline sm" onclick="editCoil('${c.id}')" title="Edit this coil">✎ Edit</button></td>
            <td class="no-print"><button class="btn danger sm" onclick="deleteCoil('${c.id}')">✕</button></td>
          </tr>`).join('')}
          </tbody></table>
        </div>
      </div>`;
    });
    host.innerHTML = html || '<div class="empty">No stock available.</div>';
    updateStockSelectionSummary();
    return;
  }

  let filtered = coils.filter(c=>c.status==='stock');
  if(stockMode==='date'){
    const d=document.getElementById('stockDateFilter')?.value;
    if(d) filtered = filtered.filter(c=>c.date===d);
  } else if(stockMode==='itemcode'){
    const code=document.getElementById('stockItemCodeFilter')?.value;
    if(code) filtered = filtered.filter(c=>c.itemCode===code);
    else filtered=[];
  }
  host.innerHTML = renderCoilTable(sortBySerial(filtered), {checkbox:true, checkClass:'stockRowChk', showStatus:false, showEdit:true, showDelete:true});
  updateStockSelectionSummary();
}
function toggleGroup(cb, code){
  document.querySelectorAll('#stockTableHost .stockRowChk').forEach(chk=>{
    const row=chk.closest('table');
    if(row && row.closest('.group-block').querySelector('.itemcode').textContent===code){
      chk.checked=cb.checked;
    }
  });
  updateStockSelectionSummary();
}
function updateStockSelectionSummary(){
  const bar = document.getElementById('selCoilCount');
  if(!bar) return;
  const checkedIds = [...document.querySelectorAll('.stockRowChk:checked')].map(c=>c.dataset.id);
  const coils = loadCoils();
  const selected = coils.filter(c=>checkedIds.includes(c.id));
  const totalWt = selected.reduce((s,c)=>s+(c.weight||0),0);
  document.getElementById('selCoilCount').textContent = checkedIds.length;
  document.getElementById('selCoilWeight').textContent = totalWt.toFixed(3);
}
document.addEventListener('change', e=>{
  if(e.target.classList && e.target.classList.contains('stockRowChk')) updateStockSelectionSummary();
});
function statusPill(s){
  return `<span class="pill ${s}">${s.toUpperCase()}</span>`;
}
function renderCoilTable(list, opts){
  if(!list.length) return '<div class="empty">No matching coils.</div>';
  opts=opts||{};
  let cols = `<th>Serial</th><th>Item Code</th><th>Material Type</th><th>Product</th><th>Colour</th><th>Size</th><th>Construction</th><th>Tracer</th><th>Unit</th><th>Qty</th><th>Weight (Kg)</th><th>Date</th>`;
  if(opts.showStatus) cols += `<th>Status</th>`;
  if(opts.showEdit) cols += `<th class="no-print">Edit</th>`;
  if(opts.showDelete) cols += `<th class="no-print">Del</th>`;
  let head = (opts.checkbox? `<th class="no-print"><input type="checkbox" onclick="checkAll(this,'${opts.checkClass}')"></th>`:'') + cols;
  let rows = list.map(c=>{
    let tds = `<td>${c.serial}</td><td class="itemcode">${c.itemCode}</td><td>${c.resin}</td><td>${c.product}</td><td>${c.colour}</td><td>${c.size}mm</td><td>${c.construction}</td><td>${c.tracer}</td><td>${c.lengthUnit}</td><td>${c.quantity}</td><td>${(c.weight||0)}</td><td>${c.date}</td>`;
    if(opts.showStatus) tds += `<td>${statusPill(c.status)}</td>`;
    if(opts.showEdit) tds += `<td class="no-print"><button class="btn outline sm" onclick="editCoil('${c.id}')" title="Edit this coil">✎ Edit</button></td>`;
    if(opts.showDelete) tds += `<td class="no-print"><button class="btn danger sm" onclick="deleteCoil('${c.id}')">✕</button></td>`;
    let cb = opts.checkbox? `<td class="no-print"><input type="checkbox" class="${opts.checkClass}" data-id="${c.id}"></td>`:'';
    return `<tr>${cb}${tds}</tr>`;
  }).join('');
  return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
/* ---- Edit a coil from the Stock Register ---- */
let editCoilId=null;
function editCoil(id){
  const c=loadCoils().find(x=>x.id===id); if(!c){ toast('Coil not found'); return; }
  editCoilId=id;
  const opt=(arr,cur)=>{ const a=arr.slice(); if(cur && !a.includes(cur)) a.push(cur); return a.map(v=>`<option value="${esc(v)}" ${String(v)===String(cur)?'selected':''}>${esc(v)}</option>`).join(''); };
  const sizes=Array.from({length:32},(_,i)=>i+1).map(n=>`<option value="${n}" ${String(n)===String(c.size)?'selected':''}>${n} mm</option>`).join('');
  let ov=document.getElementById('editCoilOverlay'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.id='editCoilOverlay'; ov.className='no-print';
  ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;';
  ov.innerHTML=`<div style="background:#fff;border-radius:10px;padding:18px 20px;width:640px;max-width:100%;max-height:92vh;overflow:auto;box-shadow:0 8px 30px rgba(0,0,0,.35);">
    <h2 style="margin:0 0 4px;">✎ Edit Coil</h2>
    <div class="muted" style="font-size:12.5px;margin-bottom:10px;">Serial: <b id="ec_serialLbl">${esc(c.serial)}</b> &nbsp;|&nbsp; Item Code: <b id="ec_codeLbl">${esc(c.itemCode)}</b></div>
    <div class="row">
      <div class="field"><label>Coil Weight (Kg)</label><input type="number" id="ec_weight" min="0" step="0.001" value="${c.weight||0}"></div>
      <div class="field"><label>Entry Date</label><input type="date" id="ec_date" value="${esc(c.date)}"></div>
      <div class="field"><label>Length</label><input type="number" id="ec_length" min="0" step="0.01" value="${esc(c.quantity)}"></div>
      <div class="field"><label>Length Unit</label><select id="ec_unit">${opt(['Yds','Mtrs'],c.lengthUnit)}</select></div>
      <div class="field"><label>Material Type</label><select id="ec_resin">${opt(['PP','HDPE'],c.resin)}</select></div>
      <div class="field"><label>Product Type</label><select id="ec_product">${opt(['Danline','Mono'],c.product)}</select></div>
      <div class="field"><label>Colour</label><select id="ec_colour">${opt(colours,c.colour)}</select></div>
      <div class="field"><label>Size (mm)</label><select id="ec_size">${sizes}</select></div>
      <div class="field"><label>Construction</label><select id="ec_construction">${opt(constructions,c.construction)}</select></div>
      <div class="field"><label>Tracer</label><select id="ec_tracer">${opt(tracers,c.tracer)}</select></div>
    </div>
    <div class="muted" style="font-size:12px;margin-top:8px;">If you change Material / Product / Colour / Size / Construction / Tracer / Length / Unit, the Item Code changes and the coil gets the next free serial under the new code.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
      <button class="btn outline" onclick="closeEditCoil()">✕ Cancel</button>
      <button class="btn amber" onclick="saveEditedCoil()">💾 Save Changes</button>
    </div></div>`;
  ov.addEventListener('mousedown',e=>{ if(e.target===ov) closeEditCoil(); });
  document.body.appendChild(ov);
  const w=document.getElementById('ec_weight'); w.focus(); w.select();
  ov.addEventListener('keydown',e=>{ if(e.key==='Enter'){ e.preventDefault(); saveEditedCoil(); } else if(e.key==='Escape') closeEditCoil(); });
}
function closeEditCoil(){ const ov=document.getElementById('editCoilOverlay'); if(ov) ov.remove(); editCoilId=null; }
function saveEditedCoil(){
  if(!editCoilId) return;
  const g=id=>document.getElementById(id).value;
  const weight=parseFloat(g('ec_weight')); 
  if(isNaN(weight) || weight<0){ toast('Enter a valid weight'); return; }
  const date=g('ec_date'); if(!date){ toast('Select the entry date'); return; }
  const length=g('ec_length'); if(length===''){ toast('Enter the length'); return; }
  const coils=loadCoils(); const c=coils.find(x=>x.id===editCoilId); if(!c){ closeEditCoil(); return; }
  const n={resin:g('ec_resin'),product:g('ec_product'),colour:g('ec_colour'),size:g('ec_size'),construction:g('ec_construction'),tracer:g('ec_tracer'),lengthUnit:g('ec_unit')};
  const newCode=buildItemCode(n.resin,n.product,n.colour,n.size,n.construction,n.tracer,length,n.lengthUnit);
  const oldCode=c.itemCode, oldSerial=c.serial;
  Object.assign(c,n,{weight,date,quantity:(parseFloat(length)||length)});
  if(newCode!==oldCode){
    c.itemCode=newCode;
    c.serial=nextSerial(newCode);              // computed while this coil still holds nothing under newCode
    reclaimSerialsForDeleted([{itemCode:oldCode,serial:oldSerial}]);
  }
  saveCoils(coils);
  const sc=sessionCoils.find(x=>x.id===c.id); if(sc) Object.assign(sc,c);
  closeEditCoil();
  toast('Coil '+c.serial+' updated');
  renderStockPage();
  if(typeof renderSessionCoils==='function') renderSessionCoils();
}
function checkAll(master, cls){
  document.querySelectorAll('.'+cls).forEach(c=>c.checked=master.checked);
  if(cls==='stockRowChk') updateStockSelectionSummary();
}
function deleteCoil(id){
  if(!confirm('Delete this coil entry permanently?')) return;
  const allCoils=loadCoils();
  const deleted = allCoils.find(c=>c.id===id);
  let coils=allCoils.filter(c=>c.id!==id);
  saveCoils(coils);
  reclaimSerialsForDeleted(deleted? [deleted] : []);
  if(sessionCoils.length) sessionCoils = sessionCoils.filter(c=>c.id!==id);
  toast('Coil deleted');
  renderStockPage();
}
function deleteSelectedStock(){
  const ids=[...document.querySelectorAll('.stockRowChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('No rows selected'); return; }
  if(!confirm('Delete '+ids.length+' selected coil(s)? This cannot be undone.')) return;
  const allCoils=loadCoils();
  const deletedList = allCoils.filter(c=>ids.includes(c.id));
  let coils=allCoils.filter(c=>!ids.includes(c.id));
  saveCoils(coils);
  reclaimSerialsForDeleted(deletedList);
  if(sessionCoils.length) sessionCoils = sessionCoils.filter(c=>!ids.includes(c.id));
  toast(ids.length+' coil(s) deleted');
  renderStockPage();
}
function moveSelectedToNonMovable(){
  const ids=[...document.querySelectorAll('.stockRowChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('No rows selected'); return; }
  if(!confirm('Move '+ids.length+' selected coil(s) to Non-Movable Stock? They will be removed from the Stock Register and Dispatch selection until moved back.')) return;
  let coils=loadCoils();
  coils=coils.map(c=> ids.includes(c.id) ? {...c, status:'nonmovable', nonMovableDate:todayStr()} : c);
  saveCoils(coils);
  if(sessionCoils.length) sessionCoils = sessionCoils.filter(c=>!ids.includes(c.id));
  toast(ids.length+' coil(s) moved to Non-Movable Stock');
  renderStockPage();
}
function getCheckedOrFiltered(tableScopeId, checkClass, fallbackList){
  const checked=[...document.querySelectorAll('#'+tableScopeId+' .'+checkClass+':checked')].map(c=>c.dataset.id);
  if(checked.length){
    let coils=loadCoils();
    return coils.filter(c=>checked.includes(c.id));
  }
  return fallbackList;
}
function renderStockPage(){
  initStockForm();
  renderStockFilterRow();
  renderStockTable();
  updateStockSelectionSummary();
}

/* ============================================================
   DISPATCH PAGE
============================================================ */
let dispatchMode='coil';
let cart = []; // array of coil ids

function renderDispatchFilterRow(){
  const host=document.getElementById('dispatchFilterRow');
  const coils=loadCoils().filter(c=>c.status==='stock');
  if(dispatchMode==='coil'){
    host.innerHTML = `<div class="field grow"><label>Search Serial / Item Code</label><input type="text" id="dispSearch" placeholder="Type to filter..."></div>`;
    document.getElementById('dispSearch').oninput = renderDispatchPickHost;
  } else if(dispatchMode==='itemcode'){
    const codes=[...new Set(coils.map(c=>c.itemCode))].sort();
    host.innerHTML = `<div class="field grow"><label>Select Item Code</label><select id="dispItemCode"><option value="">-- choose --</option>${codes.map(c=>`<option value="${c}">${c}</option>`).join('')}</select></div>`;
    document.getElementById('dispItemCode').onchange = renderDispatchPickHost;
  } else if(dispatchMode==='date'){
    host.innerHTML = `<div class="field"><label>Select Stock Entry Date</label><input type="date" id="dispDateFilter" value="${todayStr()}"></div>`;
    document.getElementById('dispDateFilter').onchange = renderDispatchPickHost;
  }
}
function renderDispatchPickHost(){
  const host=document.getElementById('dispatchPickHost');
  let coils=loadCoils().filter(c=>c.status==='stock');
  if(dispatchMode==='coil'){
    const q=(document.getElementById('dispSearch')?.value||'').toLowerCase();
    if(q) coils=coils.filter(c=>c.serial.toLowerCase().includes(q)||c.itemCode.toLowerCase().includes(q));
  } else if(dispatchMode==='itemcode'){
    const code=document.getElementById('dispItemCode')?.value;
    coils = code? coils.filter(c=>c.itemCode===code) : [];
  } else if(dispatchMode==='date'){
    const d=document.getElementById('dispDateFilter')?.value;
    coils = d? coils.filter(c=>c.date===d) : [];
  }
  host.innerHTML = renderCoilTable(sortBySerial(coils), {checkbox:true, checkClass:'pickChk'});
  host.innerHTML += `<div class="toolbar"><button class="btn amber sm" onclick="addPickedToCart()">➕ Add Selected to Dispatch Cart</button></div>`;
}
function addPickedToCart(){
  const ids=[...document.querySelectorAll('.pickChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('Select at least one coil'); return; }
  ids.forEach(id=>{ if(!cart.includes(id)) cart.push(id); });
  toast(ids.length+' coil(s) added to cart');
  renderCart();
}
function renderCart(){
  const coils=loadCoils();
  const items=cart.map(id=>coils.find(c=>c.id===id)).filter(Boolean);
  document.getElementById('cartCount').textContent=items.length;
  document.getElementById('cartQty').textContent=items.reduce((s,c)=>s+(c.weight||0),0).toFixed(3);
  document.getElementById('cartBody').innerHTML = items.map(c=>`<tr><td>${c.serial}</td><td class="itemcode">${c.itemCode}</td><td>${c.size}mm</td><td>${c.quantity} ${c.lengthUnit}</td><td>${(c.weight||0)}</td>
    <td><button class="btn danger sm" onclick="removeFromCart('${c.id}')">✕</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Cart is empty</td></tr>';
}
function removeFromCart(id){ cart=cart.filter(x=>x!==id); renderCart(); }
/* Dispatch number helpers — number is typed manually per dispatch; older records fall back to their internal ID */
function dNo(d){ return (d && (d.dispatchNo||'').toString().trim()) || (d && d.id) || ''; }
function dispatchNoExists(no){
  const n=(no||'').toString().trim().toLowerCase();
  return loadDispatches().some(d=>(d.dispatchNo||'').toString().trim().toLowerCase()===n);
}
function esc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function confirmDispatch(){
  if(!cart.length){ toast('Cart is empty'); return; }
  const date=document.getElementById('d_date').value || todayStr();
  const remarks=document.getElementById('d_remarks').value||'';
  const customer=(document.getElementById('d_customer')?.value||'').trim();
  const dispatchNo=(document.getElementById('d_no').value||'').trim();
  if(!dispatchNo){ toast('Enter a Dispatch Number'); document.getElementById('d_no').focus(); return; }
  if(dispatchNoExists(dispatchNo)){ toast('Dispatch No. "'+dispatchNo+'" already exists — use a different number'); document.getElementById('d_no').focus(); return; }
  let coils=loadCoils();
  const dispatchId='D'+Date.now();
  coils=coils.map(c=>{
    if(cart.includes(c.id)){
      return {...c, status:'dispatched', dispatchId, dispatchDate:date, customer};
    }
    return c;
  });
  saveCoils(coils);
  let dispatches=loadDispatches();
  dispatches.push({id:dispatchId, dispatchNo, date, coilIds:[...cart], remarks, customer, createdAt:new Date().toISOString()});
  saveDispatches(dispatches);
  toast('Dispatch No. '+dispatchNo+' created with '+cart.length+' coil(s)');
  cart=[];
  document.getElementById('d_remarks').value='';
  if(document.getElementById('d_customer')) document.getElementById('d_customer').value='';
  document.getElementById('d_no').value='';
  refreshCustomerList();
  renderCart();
  renderDispatchPickHost();
}
function renderDispatchPage(){
  refreshCustomerList();
  document.getElementById('d_date').value=todayStr();
  document.getElementById('d_no').value='';
  renderDispatchFilterRow();
  renderDispatchPickHost();
  renderCart();
}

/* ============================================================
   DISPATCH LIST PAGE
============================================================ */
function renderDispatchList(){
  const host=document.getElementById('dispatchListHost');
  let dispatches=loadDispatches().slice().sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  const filterDate=document.getElementById('dl_dateFilter')?.value;
  if(filterDate) dispatches=dispatches.filter(d=>d.date===filterDate);
  const coils=loadCoils();
  renderDailySizeSummary(dispatches, coils);
  renderDLItemCodeChecklist(dispatches, coils);
  if(!dispatches.length){ host.innerHTML='<div class="empty">No dispatches recorded.</div>'; return; }
  let html='';
  dispatches.forEach(d=>{
    const items=d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(Boolean).filter(c=>c.status==='dispatched');
    if(!items.length) return;
    const activeItems=items;
    const totalWt=activeItems.reduce((s,c)=>s+(c.weight||0),0);
    html+=`<div class="group-block">
      <div class="group-head" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span>Dispatch No: ${esc(dNo(d))} — ${d.date} ${(()=>{const cs=[...new Set(items.map(c=>customerOf(c,d)).filter(Boolean))]; return cs.length?('— 👤 '+esc(cs.join(', '))+' '):'';})()}${d.remarks?('— '+esc(d.remarks)):''}</span>
        <span class="meta">${activeItems.length} coil(s) • ${totalWt.toFixed(3)} kg</span>
      </div>
      <div class="group-body">
        <table><thead><tr><th class="no-print"><input type="checkbox" onclick="checkAll(this,'ret_${d.id}')"></th><th>Serial</th><th>Item Code</th><th>Size</th><th>Length</th><th>Weight (Kg)</th><th>Status</th></tr></thead>
        <tbody>
        ${items.map(c=>`<tr>
          <td class="no-print">${c.status==='dispatched'?`<input type="checkbox" class="ret_${d.id} retChk" data-id="${c.id}">`:''}</td>
          <td>${c.serial}</td><td class="itemcode">${c.itemCode}</td><td>${c.size}mm</td><td>${c.quantity} ${c.lengthUnit}</td><td>${(c.weight||0)}</td><td>${statusPill(c.status)}</td>
        </tr>`).join('')}
        </tbody></table>
        <div class="toolbar no-print" style="padding:8px 12px;">
          <button class="btn purple sm" onclick="returnCoils('${d.id}')">↩ Return Selected Coils</button>
          <button class="btn danger sm" onclick="deleteDispatchCoils('${d.id}')">🗑 Delete Selected Coils</button>
          <span class="spacer"></span>
          <button class="btn outline sm" onclick="printSingleDispatch('${d.id}')">🖶 Print</button>
          <button class="btn sm" onclick="exportSingleDispatchExcel('${d.id}')">⬇ Excel</button>
          <button class="btn amber sm" onclick="exportSingleDispatchPDF('${d.id}')">⬇ PDF</button>
        </div>
      </div>
    </div>`;
  });
  host.innerHTML=html;
}
function renderDLItemCodeChecklist(dispatches, coils){
  const host=document.getElementById('dlItemCodeChecklist');
  if(!host) return;
  const prevChecked=new Set([...document.querySelectorAll('.dlItemCodeChk:checked')].map(c=>c.dataset.itemcode));
  const codes=[...new Set(dispatches.flatMap(d=>d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(c=>c&&c.status==='dispatched').map(c=>c.itemCode)))].sort();
  host.innerHTML = codes.length? codes.map(code=>
    `<label style="display:flex;align-items:center;gap:4px;font-size:12.5px;"><input type="checkbox" class="dlItemCodeChk" data-itemcode="${code}" ${prevChecked.has(code)?'checked':''}> ${code}</label>`
  ).join('') : '<span class="muted" style="font-size:12px;">No item codes for the selected date.</span>';
  const selectAll=document.getElementById('dlItemCodeSelectAll');
  if(selectAll) selectAll.checked = codes.length>0 && codes.every(c=>prevChecked.has(c));
}
function getDLSelectedItemCodes(){
  return [...document.querySelectorAll('.dlItemCodeChk:checked')].map(c=>c.dataset.itemcode);
}
function renderDailySizeSummary(dispatches, coils){
  // Total Dispatch — Date Wise
  const dateGroups={};
  dispatches.forEach(d=>{
    const items = d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(Boolean).filter(c=>c.status==='dispatched');
    dateGroups[d.date] = dateGroups[d.date] || {date:d.date, dispatches:0, coils:0, totalWt:0};
    dateGroups[d.date].dispatches++;
    dateGroups[d.date].coils += items.length;
    dateGroups[d.date].totalWt += items.reduce((s,c)=>s+(c.weight||0),0);
  });
  const dateRows = Object.values(dateGroups).sort((a,b)=>b.date.localeCompare(a.date));
  document.querySelector('#totalDispatchDateTable tbody').innerHTML = dateRows.length? dateRows.map(g=>
    `<tr><td>${g.date}</td><td>${g.dispatches}</td><td>${g.coils}</td><td>${g.totalWt.toFixed(3)}</td></tr>`
  ).join('') : '<tr><td colspan="4" class="empty">No dispatches yet.</td></tr>';
  const grandDispatches = dateRows.reduce((s,g)=>s+g.dispatches,0);
  const grandCoils1 = dateRows.reduce((s,g)=>s+g.coils,0);
  const grandWt1 = dateRows.reduce((s,g)=>s+g.totalWt,0);
  document.querySelector('#totalDispatchDateTable tfoot').innerHTML = dateRows.length? `<tr style="font-weight:700;background:#eaf0f8;"><td>Grand Total</td><td>${grandDispatches}</td><td>${grandCoils1}</td><td>${grandWt1.toFixed(3)}</td></tr>` : '';

  // Item Code Wise Dispatch Summary — Per Day
  const groups={}; // key: date||itemCode
  dispatches.forEach(d=>{
    const items = d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(Boolean).filter(c=>c.status==='dispatched');
    items.forEach(c=>{
      const cu=customerOf(c,d); const key=d.date+'||'+c.itemCode+'||'+cu;
      groups[key]=groups[key]||{date:d.date, itemCode:c.itemCode, customer:cu, size:c.size, lengthQty:c.quantity, lengthUnit:c.lengthUnit, coils:0, totalWt:0};
      groups[key].coils++;
      groups[key].totalWt+=(c.weight||0);
    });
  });
  const rows=Object.values(groups).sort((a,b)=> b.date.localeCompare(a.date) || a.itemCode.localeCompare(b.itemCode) || a.customer.localeCompare(b.customer));
  document.querySelector('#itemCodeDaySummaryTable tbody').innerHTML = rows.length? rows.map(g=>
    `<tr><td>${g.date}</td><td class="itemcode">${g.itemCode}</td><td>${g.customer?esc(g.customer):'<span class="muted">—</span>'}</td><td>${g.size}mm</td><td>${g.lengthQty} ${g.lengthUnit}</td><td>${g.coils}</td><td>${g.totalWt.toFixed(3)}</td><td>${(g.totalWt/g.coils).toFixed(3)}</td>
    <td class="no-print"><button class="btn outline sm" onclick="editDispatchGroup('${g.itemCode}','${g.date}','${encC(g.customer)}')">✎ Edit</button> <button class="btn danger sm" onclick="deleteDispatchGroup('${g.itemCode}','${g.date}','${encC(g.customer)}')">✕ Delete</button></td></tr>`
  ).join('') : '<tr><td colspan="9" class="empty">No dispatches yet.</td></tr>';
  const grandCoils2 = rows.reduce((s,g)=>s+g.coils,0);
  const grandWt2 = rows.reduce((s,g)=>s+g.totalWt,0);
  document.querySelector('#itemCodeDaySummaryTable tfoot').innerHTML = rows.length? `<tr style="font-weight:700;background:#eaf0f8;"><td colspan="5">Grand Total</td><td>${grandCoils2}</td><td>${grandWt2.toFixed(3)}</td><td>${grandCoils2? (grandWt2/grandCoils2).toFixed(3):'0.000'}</td><td class="no-print"></td></tr>` : '';
  renderIDSItemCodeChecklist(rows);
}
function renderIDSItemCodeChecklist(rows){
  const host=document.getElementById('idsItemCodeChecklist');
  if(!host) return;
  const prevChecked=new Set([...document.querySelectorAll('.idsChk:checked')].map(c=>c.dataset.itemcode));
  const codes=[...new Set(rows.map(g=>g.itemCode))].sort();
  host.innerHTML = codes.length? codes.map(code=>
    `<label style="display:flex;align-items:center;gap:4px;font-size:12.5px;"><input type="checkbox" class="idsChk" data-itemcode="${code}" ${prevChecked.has(code)?'checked':''}> ${code}</label>`
  ).join('') : '<span class="muted" style="font-size:12px;">No item codes for the selected date.</span>';
  const selectAll=document.getElementById('idsSelectAll');
  if(selectAll) selectAll.checked = codes.length>0 && codes.every(c=>prevChecked.has(c));
}
function getIDSSelectedItemCodes(){
  return [...document.querySelectorAll('.idsChk:checked')].map(c=>c.dataset.itemcode);
}
function printTotalDispatchDate(){
  printGeneric('Total Dispatch — Date Wise Summary', document.getElementById('totalDispatchDateTable').outerHTML);
}
function exportTotalDispatchDateExcel(){
  const rows=[...document.querySelectorAll('#totalDispatchDateTable tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent));
  const footRows=[...document.querySelectorAll('#totalDispatchDateTable tfoot tr')].map(tr=>[...tr.children].map(td=>td.textContent));
  if(!rows.length || rows[0].length===1){ toast('No data to export'); return; }
  const header=[...document.querySelectorAll('#totalDispatchDateTable thead th')].map(th=>th.textContent);
  const ws=XLSX.utils.aoa_to_sheet([header, ...rows, ...footRows]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TotalDispatchByDate');
  XLSX.writeFile(wb, 'Total_Dispatch_Date_Wise_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function printItemCodeDaySummary(){
  const selectedCodes=getIDSSelectedItemCodes();
  const allRows=[...document.querySelectorAll('#itemCodeDaySummaryTable tbody tr')].filter(tr=>!tr.querySelector('.empty'));
  if(!allRows.length){ toast('No data to print'); return; }
  const rows = selectedCodes.length? allRows.filter(tr=>selectedCodes.includes(tr.children[1]?.textContent.trim())) : allRows;
  if(!rows.length){ toast('No data to print'); return; }
  let grandCoils=0, grandWt=0;
  rows.forEach(tr=>{ grandCoils += parseFloat(tr.children[5]?.textContent)||0; grandWt += parseFloat(tr.children[6]?.textContent)||0; });
  const bodyHtml = rows.map(tr=>'<tr>'+[...tr.children].slice(0,8).map(td=>td.outerHTML).join('')+'</tr>').join('');
  // Total row is appended as the last row of tbody (not a separate tfoot) so it
  // prints only once, on the final page, instead of repeating on every printed page.
  const totalRow = `<tr style="font-weight:700;background:#eaf0f8;"><td colspan="5">Grand Total</td><td>${grandCoils}</td><td>${grandWt.toFixed(3)}</td><td>${grandCoils? (grandWt/grandCoils).toFixed(3):'0.000'}</td></tr>`;
  const tableHTML = `<table><thead><tr><th>Date</th><th>Item Code</th><th>Customer</th><th>Size</th><th>Length</th><th>Coils</th><th>Total Weight (Kg)</th><th>Average Weight / Coil (Kg)</th></tr></thead><tbody>${bodyHtml}${totalRow}</tbody></table>`;
  const subheading = 'Item Code Wise Dispatch Summary — Per Day' + (selectedCodes.length? (' — Item Code: '+selectedCodes.join(', ')) : '');
  printGeneric('Item Code Wise Dispatch Summary — Per Day', tableHTML, subheading);
}
function exportItemCodeDaySummaryExcel(){
  const selectedCodes=getIDSSelectedItemCodes();
  const allRows=[...document.querySelectorAll('#itemCodeDaySummaryTable tbody tr')].filter(tr=>!tr.querySelector('.empty'));
  if(!allRows.length){ toast('No data to export'); return; }
  const filteredTrs = selectedCodes.length? allRows.filter(tr=>selectedCodes.includes(tr.children[1]?.textContent.trim())) : allRows;
  if(!filteredTrs.length){ toast('No data to export'); return; }
  const rows=filteredTrs.map(tr=>[...tr.children].slice(0,8).map(td=>td.textContent));
  let grandCoils=0, grandWt=0;
  filteredTrs.forEach(tr=>{ grandCoils += parseFloat(tr.children[5]?.textContent)||0; grandWt += parseFloat(tr.children[6]?.textContent)||0; });
  const footRows=[['Grand Total','','','','',grandCoils,grandWt.toFixed(3), grandCoils? (grandWt/grandCoils).toFixed(3):'0.000']];
  const header=[...document.querySelectorAll('#itemCodeDaySummaryTable thead th')].slice(0,8).map(th=>th.textContent);
  const ws=XLSX.utils.aoa_to_sheet([header, ...rows, ...footRows]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ItemCodeDaySummary');
  XLSX.writeFile(wb, 'Dispatch_ItemCode_PerDay_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function returnCoils(dispatchId){
  const ids=[...document.querySelectorAll('.ret_'+dispatchId+':checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('Select coils to return'); return; }
  if(!confirm('Return '+ids.length+' coil(s)? They will move to the separate Returned register.')) return;
  let coils=loadCoils();
  coils=coils.map(c=> ids.includes(c.id) ? {...c, status:'returned', returnDate:todayStr(), dispatchId:null, dispatchDate:null} : c);
  saveCoils(coils);
  // remove returned coils from their old dispatch entry (drop the entry if it becomes empty)
  let dispatches=loadDispatches().map(d=>({...d, coilIds:d.coilIds.filter(id=>!ids.includes(id))})).filter(d=>d.coilIds.length>0);
  saveDispatches(dispatches);
  removeCoilsFromBags(ids);
  toast(ids.length+' coil(s) returned');
  renderDispatchList();
}
function deleteDispatchCoils(dispatchId){
  const ids=[...document.querySelectorAll('.ret_'+dispatchId+':checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('Select coils to delete'); return; }
  if(!confirm('Permanently delete '+ids.length+' selected coil(s) from this dispatch? This cannot be undone.')) return;
  const allCoils=loadCoils();
  const deleted=allCoils.filter(c=>ids.includes(c.id));
  saveCoils(allCoils.filter(c=>!ids.includes(c.id)));
  reclaimSerialsForDeleted(deleted);
  removeCoilsFromBags(ids);
  saveDispatches(loadDispatches().map(d=>({...d, coilIds:d.coilIds.filter(id=>!ids.includes(id))})).filter(d=>d.coilIds.length>0));
  toast(ids.length+' coil(s) deleted');
  refreshDispatchViews();
}
function removeCoilsFromBags(ids){
  if(!ids.length) return;
  let bags = loadBagPacking();
  bags = bags.map(b=>({...b, coilIds: b.coilIds.filter(id=>!ids.includes(id))})).filter(b=>b.coilIds.length>0);
  saveBagPacking(bags);
}

/* ============================================================
   RETURNED PAGE
============================================================ */
function renderReturned(){
  const coils=loadCoils().filter(c=>c.status==='returned');
  const body=document.getElementById('returnedBody');
  body.innerHTML = coils.length? coils.map(c=>`<tr>
    <td class="no-print"><input type="checkbox" class="returnedChk" data-id="${c.id}"></td>
    <td>${c.serial}</td><td class="itemcode">${c.itemCode}</td><td>${c.quantity} ${c.lengthUnit}</td><td>${(c.weight||0)}</td><td>${c.returnDate||''}</td>
    <td class="no-print"><button class="btn danger sm" onclick="deleteReturnedCoil('${c.id}')">✕</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="empty">No returned coils.</td></tr>';
  document.getElementById('rd_date').value = todayStr();
}
function deleteReturnedCoil(id){
  if(!confirm('Delete this returned coil entry permanently? This cannot be undone.')) return;
  const allCoils=loadCoils();
  const deleted = allCoils.find(c=>c.id===id);
  let coils=allCoils.filter(c=>c.id!==id);
  saveCoils(coils);
  reclaimSerialsForDeleted(deleted? [deleted] : []);
  toast('Returned coil deleted');
  renderReturned();
}
function deleteSelectedReturned(){
  const ids=[...document.querySelectorAll('.returnedChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('No rows selected'); return; }
  if(!confirm('Delete '+ids.length+' selected returned coil(s)? This cannot be undone.')) return;
  const allCoils=loadCoils();
  const deletedList = allCoils.filter(c=>ids.includes(c.id));
  let coils=allCoils.filter(c=>!ids.includes(c.id));
  saveCoils(coils);
  reclaimSerialsForDeleted(deletedList);
  toast(ids.length+' returned coil(s) deleted');
  renderReturned();
}
function moveSelectedToStock(){
  const ids=[...document.querySelectorAll('.returnedChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('No rows selected'); return; }
  if(!confirm('Move '+ids.length+' selected returned coil(s) back into main Stock? They will appear in the Stock Register again.')) return;
  let coils=loadCoils();
  coils=coils.map(c=>{
    if(ids.includes(c.id)){
      return {...c, status:'stock', dispatchId:null, dispatchDate:null, returnDate:null};
    }
    return c;
  });
  saveCoils(coils);
  toast(ids.length+' coil(s) moved back to Stock');
  renderReturned();
}
function redispatchSelected(){
  const ids=[...document.querySelectorAll('.returnedChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('Select at least one returned coil'); return; }
  const date=document.getElementById('rd_date').value || todayStr();
  const remarks=document.getElementById('rd_remarks').value||'';
  const dispatchNo=(document.getElementById('rd_no').value||'').trim();
  if(!dispatchNo){ toast('Enter a Dispatch Number'); document.getElementById('rd_no').focus(); return; }
  if(dispatchNoExists(dispatchNo)){ toast('Dispatch No. "'+dispatchNo+'" already exists — use a different number'); return; }
  if(!confirm('Re-dispatch '+ids.length+' returned coil(s)?')) return;
  let coils=loadCoils();
  let dispatches=loadDispatches();
  const dispatchId='D'+Date.now();
  coils = coils.map(c=> ids.includes(c.id) ? {...c, status:'dispatched', dispatchId, dispatchDate:date, returnDate:null} : c);
  // safety: make sure these coils are not left in any older dispatch entry
  dispatches = dispatches.map(d=>({...d, coilIds: d.coilIds.filter(id=>!ids.includes(id))})).filter(d=>d.coilIds.length>0);
  dispatches.push({id:dispatchId, dispatchNo, date, coilIds:[...ids], remarks: remarks||'', createdAt:new Date().toISOString()});
  saveCoils(coils);
  saveDispatches(dispatches);
  toast(ids.length+' coil(s) dispatched on '+date);
  document.getElementById('rd_remarks').value='';
  document.getElementById('rd_no').value='';
  renderReturned();
  refreshDispatchViews();
}

/* ============================================================
   NON-MOVABLE STOCK PAGE
============================================================ */
function renderNonMovable(){
  const coils=loadCoils().filter(c=>c.status==='nonmovable');
  const body=document.getElementById('nonmovBody');
  body.innerHTML = coils.length? sortBySerial(coils).map(c=>`<tr>
    <td class="no-print"><input type="checkbox" class="nonmovChk" data-id="${c.id}"></td>
    <td>${c.serial}</td><td class="itemcode">${c.itemCode}</td><td>${c.resin}</td><td>${c.product}</td><td>${c.colour}</td><td>${c.size}mm</td><td>${c.construction}</td><td>${c.tracer}</td><td>${c.lengthUnit}</td><td>${c.quantity}</td><td>${(c.weight||0)}</td><td>${c.date}</td><td>${c.nonMovableDate||''}</td>
    <td class="no-print"><button class="btn danger sm" onclick="deleteNonMovableCoil('${c.id}')">✕</button></td></tr>`).join('')
    : '<tr><td colspan="15" class="empty">No non-movable stock.</td></tr>';
}
function deleteNonMovableCoil(id){
  if(!confirm('Delete this non-movable coil entry permanently? This cannot be undone.')) return;
  const allCoils=loadCoils();
  const deleted = allCoils.find(c=>c.id===id);
  let coils=allCoils.filter(c=>c.id!==id);
  saveCoils(coils);
  reclaimSerialsForDeleted(deleted? [deleted] : []);
  toast('Non-movable coil deleted');
  renderNonMovable();
}
function deleteSelectedNonMovable(){
  const ids=[...document.querySelectorAll('.nonmovChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('No rows selected'); return; }
  if(!confirm('Delete '+ids.length+' selected non-movable coil(s)? This cannot be undone.')) return;
  const allCoils=loadCoils();
  const deletedList = allCoils.filter(c=>ids.includes(c.id));
  let coils=allCoils.filter(c=>!ids.includes(c.id));
  saveCoils(coils);
  reclaimSerialsForDeleted(deletedList);
  toast(ids.length+' non-movable coil(s) deleted');
  renderNonMovable();
}
function moveSelectedNonMovableToStock(){
  const ids=[...document.querySelectorAll('.nonmovChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('No rows selected'); return; }
  if(!confirm('Return '+ids.length+' selected coil(s) to regular Stock?')) return;
  let coils=loadCoils();
  coils=coils.map(c=> ids.includes(c.id) ? {...c, status:'stock', nonMovableDate:null} : c);
  saveCoils(coils);
  toast(ids.length+' coil(s) returned to Stock');
  renderNonMovable();
}
function exportNonMovableExcel(){
  const coils=loadCoils().filter(c=>c.status==='nonmovable');
  if(!coils.length){ toast('No non-movable stock'); return; }
  const ws=XLSX.utils.json_to_sheet(coils);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'NonMovable');
  XLSX.writeFile(wb, 'NonMovable_Stock_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function printNonMovable(){
  const html=document.querySelector('#page-nonmovable table').outerHTML;
  printGeneric('Non-Movable Stock Register', html);
}

/* ============================================================
   BAG PACKING PAGE — standalone, manual entry, stored date wise
   Fields: Date, Item Code, Colour (from stock colours), Bag No, Total Quantity (Kg),
           Rope Size (typed), Length + Unit (Yards / Meters)
============================================================ */
function loadManualBags(){
  let arr; try{ arr=JSON.parse(localStorage.getItem(LS.bagManual)||'[]'); }catch(e){ arr=[]; }
  let changed=false;
  arr.forEach(b=>{ if(!b.date){ b.date=todayStr(); changed=true; } if(b.colour===undefined){ b.colour=''; changed=true; } if(b.length===undefined){ b.length=''; b.lengthUnit='Yards'; changed=true; } if(b.coils===undefined){ b.coils=''; changed=true; } if(b.dispatchNo===undefined){ b.dispatchNo=''; changed=true; }
    const m=String(b.ropeSize||'').trim().match(/^(\d+)\s*(mm)?$/i); if(m){ const nv=parseInt(m[1])+' mm'; if(nv!==b.ropeSize){ b.ropeSize=nv; changed=true; } } });
  if(changed) localStorage.setItem(LS.bagManual, JSON.stringify(arr));
  return arr;
}
function saveManualBags(a){ localStorage.setItem(LS.bagManual, JSON.stringify(a)); }
let bagEditId=null;
function bagEsc(v){ return String(v==null?'':v).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function bagCmp(a,b){ return (parseInt(a.bagNo)||0)-(parseInt(b.bagNo)||0) || String(a.bagNo).localeCompare(String(b.bagNo),undefined,{numeric:true}); }
function bagAvgCoil(q,c){ return c>0 ? (q/c).toFixed(3) : '—'; }   // average weight per coil = total kg / total coils
function bagDispNos(list){ return [...new Set(list.map(b=>String(b.dispatchNo||'').trim()).filter(Boolean))].join(', '); }
function bagCoils(b){ return (b.coils===''||b.coils==null)? '—' : b.coils; }
function bagLen(b){ return (b.length===''||b.length==null)? '—' : (b.length+' '+(b.lengthUnit||'')); }
function bagDates(){ return [...new Set(loadManualBags().map(b=>b.date))].sort().reverse(); }

function renderBagPacking(){
  // dropdowns / datalist
  const dl=document.getElementById('bp_itemCodeList');
  const codes=[...new Set(loadCoils().map(c=>c.itemCode).filter(Boolean))].sort();
  dl.innerHTML=codes.map(c=>`<option value="${bagEsc(c)}"></option>`).join('');
  const cs=document.getElementById('bp_colour'); const keep=cs.value; fillSelect('bp_colour', colours); if(keep) cs.value=keep;
  const dt=document.getElementById('bp_date'); if(!dt.value) dt.value=todayStr();

  // date-wise list
  const fd=document.getElementById('bp_filterDate').value;
  const host=document.getElementById('bagListHost');
  const all=loadManualBags();
  const dates=[...new Set(all.map(b=>b.date))].sort().reverse().filter(d=>!fd||d===fd);
  host.innerHTML = dates.length? dates.map(d=>{
    const list=all.filter(b=>b.date===d).sort(bagCmp);
    const tot=list.reduce((s,b)=>s+(+b.qty||0),0), tc=list.reduce((s,b)=>s+(parseInt(b.coils)||0),0);
    const rows=list.map((b,i)=>`<tr><td class="no-print"><input type="checkbox" class="bpRowChk" data-id="${b.id}" data-date="${d}"></td><td>${i+1}</td><td class="itemcode">${bagEsc(b.itemCode)}</td><td>${bagEsc(b.colour)}</td><td><strong>${bagEsc(b.bagNo)}</strong></td><td>${bagEsc(b.dispatchNo)||'—'}</td><td>${bagCoils(b)}</td><td>${(+b.qty||0).toFixed(3)}</td><td>${bagEsc(b.ropeSize)}</td><td>${bagEsc(bagLen(b))}</td><td class="no-print"><button class="btn outline sm" onclick="printBagLabels(['${b.id}'])" title="Print this bag label">🖶</button> <button class="btn outline sm" onclick="editManualBag('${b.id}')">✎ Edit</button> <button class="btn danger sm" onclick="deleteManualBag('${b.id}')">✕</button></td></tr>`).join('');
    return `<div class="group-head"><span>📅 ${d}</span><span class="meta">${list.length} bag(s) · ${tc} coil(s) · ${tot.toFixed(3)} kg · avg ${(tot/list.length).toFixed(3)} kg/bag${bagDispNos(list)?' · Dispatch No: '+bagEsc(bagDispNos(list)):''}</span><button class="btn outline sm no-print" style="margin-left:auto;" onclick="printBagPackingDate('${d}')" title="Print this date's bag packing list (ticked bags only, if any are ticked)">🖶 Print</button><button class="btn amber sm no-print" style="margin-left:6px;" onclick="exportBagPackingPDFDate('${d}')" title="Export this date's bag packing list to PDF">⬇ PDF</button><button class="btn sm no-print" style="margin-left:6px;" onclick="exportBagPackingExcelDate('${d}')" title="Export this date's bag packing list to Excel">⬇ Excel</button><button class="btn outline sm no-print" style="margin-left:6px;" onclick="printBagDeliveryNote('${d}','Bag No')" title="Delivery Note - bag no wise (ticked bags only, if any are ticked)">📄 DN Bag No</button><button class="btn outline sm no-print" style="margin-left:6px;" onclick="printBagDeliveryNote('${d}','Pallet No')" title="Delivery Note - pallet no wise (ticked bags only, if any are ticked)">📄 DN Pallet No</button><button class="btn sm no-print" style="margin-left:6px;" onclick="exportBagDeliveryNoteExcel('${d}','Bag No')" title="Delivery Note Excel - bag no wise">⬇ Excel Bag</button><button class="btn sm no-print" style="margin-left:6px;" onclick="exportBagDeliveryNoteExcel('${d}','Pallet No')" title="Delivery Note Excel - pallet no wise">⬇ Excel Pallet</button><button class="btn amber sm no-print" style="margin-left:6px;" onclick="exportBagDeliveryNotePDF('${d}','Bag No')" title="Delivery Note PDF - bag no wise">⬇ PDF Bag</button><button class="btn amber sm no-print" style="margin-left:6px;" onclick="exportBagDeliveryNotePDF('${d}','Pallet No')" title="Delivery Note PDF - pallet no wise">⬇ PDF Pallet</button></div>
      <div class="table-wrap" style="margin-bottom:14px;"><table><thead><tr><th class="no-print"><input type="checkbox" onclick="bagSelectDate(this,'${d}')" title="Select all for this date"></th><th>Sl.No</th><th>Item Code</th><th>Colour</th><th>Bag No</th><th>Dispatch No</th><th>Coils</th><th>Total Quantity (Kg)</th><th>Rope Size</th><th>Length</th><th class="no-print">Actions</th></tr></thead><tbody>${rows}</tbody></table></div>${bagSummaryHTML(list)}`;
  }).join('') : '<div class="empty">No bags added yet.</div>';
  renderBagPrintPanel();
}
function renderBagPrintPanel(){
  const sel=document.getElementById('bp_printDate'); const keep=sel.value;
  const ds=bagDates();
  sel.innerHTML = ds.length? ds.map(d=>`<option value="${d}">${d}</option>`).join('') : '<option value="">— no dates —</option>';
  if(keep && ds.includes(keep)) sel.value=keep;
  renderBagPrintCodes();
}
function renderBagPrintCodes(){
  const host=document.getElementById('bp_printCodes');
  const prev=new Set([...host.querySelectorAll('.bpCodeChk:checked')].map(c=>c.dataset.itemcode));
  const d=document.getElementById('bp_printDate').value;
  const codes=[...new Set(loadManualBags().filter(b=>b.date===d).map(b=>b.itemCode))].sort();
  host.innerHTML = codes.length
    ? `<label style="display:flex;align-items:center;gap:4px;font-weight:700;font-size:12.5px;"><input type="checkbox" onclick="checkAll(this,'bpCodeChk')"> Select All</label>`
      + codes.map(c=>`<label style="display:flex;align-items:center;gap:4px;font-size:12.5px;"><input type="checkbox" class="bpCodeChk" data-itemcode="${bagEsc(c)}" ${prev.has(c)?'checked':''}> ${bagEsc(c)}</label>`).join('')
    : '<span class="muted" style="font-size:12px;">No item codes for the selected date.</span>';
}

function addManualBag(){
  const date=document.getElementById('bp_date').value;
  const itemCode=document.getElementById('bp_itemCode').value.trim();
  const colour=document.getElementById('bp_colour').value;
  const bagNo=document.getElementById('bp_bagNo').value.trim();
  const dispatchNo=document.getElementById('bp_dispatchNo').value.trim();
  const coilsRaw=document.getElementById('bp_coils').value;
  const qtyRaw=document.getElementById('bp_qty').value;
  const ropeSize=document.getElementById('bp_ropeSize').value;
  const lenRaw=document.getElementById('bp_length').value;
  const lengthUnit=document.getElementById('bp_lengthUnit').value;
  if(!date){ toast('Select a Date'); return; }
  if(!itemCode){ toast('Enter / select an Item Code'); return; }
  if(!colour){ toast('Select a Colour (use + to add one)'); return; }
  if(!bagNo){ toast('Enter a Bag No.'); return; }
  const coils=parseInt(coilsRaw);
  if(coilsRaw==='' || isNaN(coils) || coils<0){ toast('Enter the No. of Coils in this bag'); return; }
  const qty=parseFloat(qtyRaw);
  if(qtyRaw==='' || isNaN(qty) || qty<0){ toast('Enter a valid Total Quantity'); return; }
  if(!ropeSize){ toast('Select the Rope Size'); return; }
  const length=parseFloat(lenRaw);
  if(lenRaw==='' || isNaN(length) || length<0){ toast('Enter a valid Length'); return; }
  const bags=loadManualBags();
  if(bagEditId){
    const b=bags.find(x=>x.id===bagEditId);
    if(b) Object.assign(b,{date,itemCode,colour,bagNo,dispatchNo,coils,qty,ropeSize,length,lengthUnit});
    toast('Bag updated');
  } else {
    bags.push({id:'MB'+Date.now()+Math.floor(Math.random()*1000), date,itemCode,colour,bagNo,dispatchNo,coils,qty,ropeSize,length,lengthUnit});
    toast('Bag '+bagNo+' added ('+date+')');
  }
  saveManualBags(bags);
  const pd=document.getElementById('bp_printDate'); renderBagPacking(); pd.value=date; renderBagPrintCodes();
  resetBagForm();
  document.getElementById('bp_bagNo').focus();
}
function resetBagForm(){
  bagEditId=null;
  ['bp_bagNo','bp_coils','bp_qty'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('bp_addBtn').textContent='➕ Add Bag';
  document.getElementById('bp_cancelBtn').style.display='none';
}
function cancelBagEdit(){ resetBagForm(); ['bp_itemCode','bp_ropeSize','bp_length'].forEach(id=>document.getElementById(id).value=''); document.getElementById('bp_date').value=todayStr(); }
function editManualBag(id){
  const b=loadManualBags().find(x=>x.id===id); if(!b) return;
  bagEditId=id;
  document.getElementById('bp_date').value=b.date;
  document.getElementById('bp_itemCode').value=b.itemCode;
  if(b.colour && !colours.includes(b.colour)){ colours.push(b.colour); saveList(LS.colours,colours); fillSelect('bp_colour',colours); }
  document.getElementById('bp_colour').value=b.colour;
  document.getElementById('bp_bagNo').value=b.bagNo;
  document.getElementById('bp_dispatchNo').value=b.dispatchNo||'';
  document.getElementById('bp_coils').value=b.coils;
  document.getElementById('bp_qty').value=b.qty;
  const rs=document.getElementById('bp_ropeSize');
  if(b.ropeSize && ![...rs.options].some(o=>o.value===b.ropeSize)){ rs.add(new Option(b.ropeSize,b.ropeSize)); }
  rs.value=b.ropeSize;
  document.getElementById('bp_length').value=b.length;
  document.getElementById('bp_lengthUnit').value=b.lengthUnit||'Yards';
  document.getElementById('bp_addBtn').textContent='💾 Update Bag';
  document.getElementById('bp_cancelBtn').style.display='';
  window.scrollTo({top:0,behavior:'smooth'});
}
function deleteManualBag(id){
  if(!confirm('Delete this bag?')) return;
  saveManualBags(loadManualBags().filter(b=>b.id!==id));
  if(bagEditId===id) cancelBagEdit();
  renderBagPacking(); toast('Bag deleted');
}
function clearManualBags(){
  if(!loadManualBags().length){ toast('Nothing to clear'); return; }
  if(!confirm('Clear ALL bags (every date) from the Bag Packing list?')) return;
  saveManualBags([]); cancelBagEdit(); renderBagPacking(); toast('Bag list cleared');
}

/* ---- selection helpers ---- */
function bagSelectDate(master,d){ document.querySelectorAll('.bpRowChk').forEach(c=>{ if(c.dataset.date===d) c.checked=master.checked; }); }
function bagSelectAll(on){ document.querySelectorAll('.bpRowChk').forEach(c=>c.checked=on); document.querySelectorAll('#bagListHost thead input[type=checkbox]').forEach(c=>c.checked=on); }

/* ---- Individual bag label: one bag per A4 landscape page ---- */
function printBagLabels(ids, type){
  type = type || document.getElementById('bp_labelType')?.value || 'standard';
  const noWord = (type==='pallet') ? 'Pallet No' : 'Bag No';
  if(!ids) ids=[...document.querySelectorAll('.bpRowChk:checked')].map(c=>c.dataset.id);
  if(!ids.length){ toast('Tick the bag(s) you want to print'); return; }
  const all=loadManualBags();
  const bags=ids.map(id=>all.find(b=>b.id===id)).filter(Boolean);
  if(!bags.length){ toast('Nothing to print'); return; }
  const logo=`<img src="${COMPANY_LOGO}" alt="">`;
  const pages=bags.map(b=>{
    const lines=[
      [noWord, b.bagNo],
      ...(b.dispatchNo?[['Dispatch No', b.dispatchNo]]:[]),
      ['Rope Size', b.ropeSize],
      ['Colour', b.colour||'—'],
      ['Length', (b.length===''||b.length==null)?'—':(b.length+' '+(b.lengthUnit||''))],
      ['No of Coils', (b.coils===''||b.coils==null)?'—':b.coils],
      [(type==='pallet'?'Net Weight':'Gross Weight'), (+b.qty||0).toFixed(3)+' Kg']
    ];
    const maxLen=Math.max(...lines.map(l=>(l[0]+' : '+l[1]).length));
    const lineFs=Math.max(18,Math.min(48,Math.floor(1050/maxLen)));
    const codeFs=Math.max(20,Math.min(54,Math.floor(1050/String(b.itemCode).length)));
    return `<div class="bag-label">
      <div class="bl-top">${type==='nocompany'?'':`<div class="bl-co">${logo}<span>POLYMER PRODUCTS CO LLC</span></div>`}<div class="bl-code" style="font-size:${codeFs}pt;">${bagEsc(b.itemCode)}</div></div>
      <div class="bl-lines">${lines.map(l=>`<div class="bl-line" style="font-size:${lineFs}pt;">${l[0]} : <b>${bagEsc(l[1])}</b></div>`).join('')}</div>
    </div>`;
  }).join('');
  const area=document.getElementById('printArea');
  area.innerHTML=pages;
  document.querySelectorAll('main .page').forEach(p=>p.classList.remove('printing'));
  const st=document.createElement('style');
  st.textContent='@page{size:A4 landscape;margin:6mm;}';
  document.head.appendChild(st);
  area.classList.add('show');
  window.print();
  setTimeout(()=>{ area.classList.remove('show'); st.remove(); }, 1500);
}

/* ---- per-day data for Print / PDF / Excel ---- */
function bagPackingData(dDate,dList){
  let date,list,sel=[];
  if(dDate){ date=dDate; list=(dList||[]).slice().sort(bagCmp); }   // from a date group in the list below
  else {
    date=document.getElementById('bp_printDate').value;
    if(!date) return null;
    sel=[...document.querySelectorAll('#bp_printCodes .bpCodeChk:checked')].map(c=>c.dataset.itemcode);
    list=loadManualBags().filter(b=>b.date===date).sort(bagCmp);
    if(sel.length) list=list.filter(b=>sel.includes(b.itemCode));
  }
  if(!list.length) return null;
  const header=['Sl.No','Item Code','Colour','Bag No','Dispatch No','Coils','Total Quantity (Kg)','Rope Size','Length'];
  const body=list.map((b,i)=>[i+1,b.itemCode,b.colour,b.bagNo,b.dispatchNo||'',bagCoils(b),(+b.qty||0).toFixed(3),b.ropeSize,bagLen(b)]);
  const tot=list.reduce((s,b)=>s+(+b.qty||0),0), n=list.length, avg=tot/n, tcoils=list.reduce((s,b)=>s+(parseInt(b.coils)||0),0);
  const sumHeader=['Item Code','No. of Bags','Total Coils','Total Quantity (Kg)','Avg Weight / Bag (Kg)','Avg Weight / Coil (Kg)'];
  const groups={}; list.forEach(b=>{ (groups[b.itemCode]=groups[b.itemCode]||{code:b.itemCode,n:0,q:0,c:0}); groups[b.itemCode].n++; groups[b.itemCode].q+=(+b.qty||0); groups[b.itemCode].c+=(parseInt(b.coils)||0); });
  const sumBody=Object.values(groups).sort((x,y)=>x.code.localeCompare(y.code)).map(g=>[g.code,g.n,g.c,g.q.toFixed(3),(g.q/g.n).toFixed(3),bagAvgCoil(g.q,g.c)]);
  const sumTotal=['Grand Total',n,tcoils,tot.toFixed(3),avg.toFixed(3),bagAvgCoil(tot,tcoils)];
  const dn=bagDispNos(list), sub0='Bag Packing List - '+date, sub=sub0+(dn?' | Dispatch No: '+dn:'');
  return {date,list,header,body,tot,n,avg,tcoils,sumHeader,sumBody,sumTotal,sub,sub0,dn,sel};
}
function printBagPacking(dDate,dList){
  const d=bagPackingData(dDate,dList);
  if(!d){ toast('No bags to print for the selected day'); return; }
  const rowsHtml=d.body.map(r=>`<tr><td>${r[0]}</td><td class="itemcode">${bagEsc(r[1])}</td><td>${bagEsc(r[2])}</td><td>${bagEsc(r[3])}</td><td>${bagEsc(r[4])}</td><td>${r[5]}</td><td>${r[6]}</td><td>${bagEsc(r[7])}</td><td>${bagEsc(r[8])}</td></tr>`).join('');
  const totalRow=`<tr style="font-weight:700;background:#eaf0f8;"><td colspan="5">Total quantity in kgs — ${d.n} bag(s)</td><td>${d.tcoils}</td><td>${d.tot.toFixed(3)}</td><td colspan="2"></td></tr>`;
  const t1=`<table><thead><tr>${d.header.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowsHtml}${totalRow}</tbody></table>`;
  const sumRows=d.sumBody.map((r,i)=>{ return `<tr><td>${bagEsc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td></tr>`; }).join('');
  const sumTot=`<tr style="font-weight:700;background:#eaf0f8;">${d.sumTotal.map(v=>`<td>${bagEsc(v)}</td>`).join('')}</tr>`;
  const t2=`<div style="break-inside:avoid;page-break-inside:avoid;"><div class="print-sub" style="margin-top:16px;">Item Code Wise Summary</div><table><thead><tr>${d.sumHeader.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${sumRows}${sumTot}</tbody></table></div>`;
  printGeneric('Bag Packing List', t1+t2, d.sub0.replace(/ - /g,' — '), d.dn);
}
/* ---- Item Code Wise Summary only (avg weight per coil) — selected date + ticked item codes ---- */
function bagItemSummaryData(){
  const d=bagPackingData();
  if(!d) return null;
  d.subS='Item Code Wise Summary - '+d.date+(d.dn?' | Dispatch No: '+d.dn:'');
  return d;
}
function printBagItemSummary(){
  const d=bagItemSummaryData();
  if(!d){ toast('No bags for the selected day'); return; }
  const rows=d.sumBody.map(r=>`<tr><td class="itemcode">${bagEsc(r[0])}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td><b>${r[5]}</b></td></tr>`).join('');
  const tot=`<tr style="font-weight:700;background:#eaf0f8;">${d.sumTotal.map(v=>`<td>${bagEsc(v)}</td>`).join('')}</tr>`;
  const t=`<table><thead><tr>${d.sumHeader.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}${tot}</tbody></table>`;
  printGeneric('Item Code Wise Summary', t, 'Bag Packing — '+d.date, d.dn);
}
function exportBagItemSummaryPDF(){
  const d=bagItemSummaryData();
  if(!d){ toast('No bags for the selected day'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const y0=pdfHead(doc,d.subS,'Date: '+d.date);
  pdfTable(doc,y0,[d.sumHeader],[...d.sumBody,d.sumTotal],{totalRows:1,fontSize:9.5});
  pdfFoot(doc);
  doc.save('Item_Summary_'+d.date+'.pdf');
  toast('PDF exported');
}
function exportBagItemSummaryExcel(){
  const d=bagItemSummaryData();
  if(!d){ toast('No bags for the selected day'); return; }
  const ws=buildHeaderedSheet(d.subS, d.sumHeader, [...d.sumBody,d.sumTotal]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'ItemSummary');
  XLSX.writeFile(wb, 'Item_Summary_'+d.date+'.xlsx');
  toast('Excel exported');
}
function exportBagPackingExcel(dDate,dList){
  const d=bagPackingData(dDate,dList);
  if(!d){ toast('No bags to export for the selected day'); return; }
  const rows=[...d.body,['','Total quantity in kgs — '+d.n+' bag(s)','','','',d.tcoils,d.tot.toFixed(3),'','']];
  const ws=buildHeaderedSheet(d.sub, d.header, rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BagPacking');
  const ws2=buildHeaderedSheet('Item Code Wise Summary - '+d.date, d.sumHeader, [...d.sumBody,d.sumTotal]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
  XLSX.writeFile(wb, 'Bag_Packing_'+d.date+'.xlsx');
  toast('Excel exported');
}
function exportBagPackingPDF(dDate,dList){
  const d=bagPackingData(dDate,dList);
  if(!d){ toast('No bags to export for the selected day'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const y0=pdfHead(doc,d.sub,'Date: '+d.date);
  const body=[...d.body,['','Total quantity in kgs - '+d.n+' bag(s)','','','',d.tcoils,d.tot.toFixed(3),'','']];
  pdfTable(doc,y0,[d.header],body,{totalRows:1,fontSize:9});
  let y=doc.lastAutoTable.finalY+10;
  if(y>doc.internal.pageSize.getHeight()-50){ doc.addPage(); y=16; }
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(15,61,62);
  doc.text('Item Code Wise Summary',doc.internal.pageSize.getWidth()/2,y,{align:'center'}); doc.setTextColor(0);
  pdfTable(doc,y+3,[d.sumHeader],[...d.sumBody,d.sumTotal],{totalRows:1,fontSize:9.5});
  pdfFoot(doc);
  doc.save('Bag_Packing_'+d.date+'.pdf');
  toast('PDF exported');
}

/* ============================================================
   HOME PAGE
============================================================ */
function renderHome(){
  const coils=loadCoils();
  const stock=coils.filter(c=>c.status==='stock');
  const disp=coils.filter(c=>c.status==='dispatched');
  const ret=coils.filter(c=>c.status==='returned');
  const nonmov=coils.filter(c=>c.status==='nonmovable');
  const sumW=a=>a.reduce((s,c)=>s+(c.weight||0),0);

  document.getElementById('homeStockQty').innerHTML = sumW(stock).toFixed(3)+' <small>kg</small>';
  document.getElementById('homeStockCoils').textContent = stock.length+' coils';
  document.getElementById('homeDispQty').innerHTML = sumW(disp).toFixed(3)+' <small>kg</small>';
  document.getElementById('homeDispCoils').textContent = disp.length+' coils';
  document.getElementById('homeRetQty').innerHTML = sumW(ret).toFixed(3)+' <small>kg</small>';
  document.getElementById('homeRetCoils').textContent = ret.length+' coils';
  document.getElementById('homeNonMovQty').innerHTML = sumW(nonmov).toFixed(3)+' <small>kg</small>';
  document.getElementById('homeNonMovCoils').textContent = nonmov.length+' coils';
  const balance = sumW(stock) + sumW(ret) + sumW(nonmov);
  document.getElementById('homeBalanceQty').innerHTML = balance.toFixed(3)+' <small>kg</small>';

  // Stock Summary — Item Code wise (coils currently in stock only)
  renderStockSummaryTable();

  // Balance sheet by resin/product — weight based, length is a fixed spec (not summed)
  const groups={};
  coils.forEach(c=>{
    const key=c.resin+'||'+c.product;
    groups[key]=groups[key]||{resin:c.resin,product:c.product,stockCoils:0,stockWt:0,dispWt:0,retWt:0,nonmovWt:0};
    if(c.status==='stock'){ groups[key].stockCoils++; groups[key].stockWt+=(c.weight||0); }
    if(c.status==='dispatched'){ groups[key].dispWt+=(c.weight||0); }
    if(c.status==='returned'){ groups[key].retWt+=(c.weight||0); }
    if(c.status==='nonmovable'){ groups[key].nonmovWt+=(c.weight||0); }
  });
  const tbody=document.querySelector('#balanceSheetTable tbody');
  const rows=Object.values(groups);
  tbody.innerHTML = rows.length? rows.map(g=>`<tr><td>${g.resin}</td><td>${g.product}</td><td>${g.stockCoils}</td><td>${g.stockWt.toFixed(3)}</td><td>${g.dispWt.toFixed(3)}</td><td>${g.retWt.toFixed(3)}</td><td>${g.nonmovWt.toFixed(3)}</td><td>${(g.stockWt+g.retWt+g.nonmovWt).toFixed(3)}</td></tr>`).join('')
    : '<tr><td colspan="8" class="empty">No data yet.</td></tr>';
  const bsGrandCoils=rows.reduce((s,g)=>s+g.stockCoils,0);
  const bsGrandStock=rows.reduce((s,g)=>s+g.stockWt,0);
  const bsGrandDisp=rows.reduce((s,g)=>s+g.dispWt,0);
  const bsGrandRet=rows.reduce((s,g)=>s+g.retWt,0);
  const bsGrandNonmov=rows.reduce((s,g)=>s+g.nonmovWt,0);
  const bsGrandBalance=bsGrandStock+bsGrandRet+bsGrandNonmov;
  document.querySelector('#balanceSheetTable tfoot').innerHTML = rows.length? `<tr><td colspan="2">Total quantity in kgs</td><td>${bsGrandCoils}</td><td>${bsGrandStock.toFixed(3)}</td><td>${bsGrandDisp.toFixed(3)}</td><td>${bsGrandRet.toFixed(3)}</td><td>${bsGrandNonmov.toFixed(3)}</td><td>${bsGrandBalance.toFixed(3)}</td></tr>` : '';

  // Recent stock
  const recentStock = stock.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  document.querySelector('#recentStockTable tbody').innerHTML = recentStock.length? recentStock.map(c=>`<tr><td>${c.serial}</td><td class="itemcode">${c.itemCode}</td><td>${c.colour}</td><td>${c.size}mm</td><td>${c.quantity} ${c.lengthUnit}</td><td>${c.date}</td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">No stock entries yet.</td></tr>';

  // Recent dispatches
  const dispatches=loadDispatches().slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
  document.querySelector('#recentDispatchTable tbody').innerHTML = dispatches.length? dispatches.map(d=>{
    const items=d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(c=>c&&c.status==='dispatched');
    return `<tr><td>${esc(dNo(d))}</td><td>${d.date}</td><td>${items.length}</td><td>${sumW(items).toFixed(3)} kg</td><td>${d.remarks||''}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No dispatches yet.</td></tr>';

  // Dispatch Details — Item Code & Serial Wise (date selectable)
  const dateInput = document.getElementById('home_dispatchDate');
  if(dateInput && !dateInput.dataset.initialized){
    dateInput.value = todayStr();
    dateInput.dataset.initialized = '1';
  }
  const mInput = document.getElementById('home_reportMonth');
  if(mInput && !mInput.value) mInput.value = todayStr().slice(0,7);
  renderHomeDispatchDetail();
}
function homeDispatchData(){
  const date = document.getElementById('home_dispatchDate')?.value || '';
  const coilMap = new Map(loadCoils().map(c=>[c.id,c]));          // id lookup in O(1) (was a slow find() per coil)
  const allDisp = loadDispatches();
  const dmap = {}; allDisp.forEach(d=>dmap[d.id]=d);
  const groups = {};
  allDisp.forEach(d=>{
    if(date && d.date!==date) return;
    const dn = dNo(d), rem = (d.remarks||'').trim();
    d.coilIds.forEach(id=>{
      const c = coilMap.get(id);
      if(!c || c.status!=='dispatched') return;
      const cu=customerOf(c, dmap[c.dispatchId]); const key=c.itemCode+'||'+cu;
      const g = groups[key] = groups[key] || {itemCode:c.itemCode, customer:cu, key, product:c.product, colour:c.colour, size:c.size, lengthQty:c.quantity, lengthUnit:c.lengthUnit, coils:0, totalWt:0, nos:[], rem:[]};
      g.coils++; g.totalWt += (c.weight||0);
      if(dn && !g.nos.includes(dn)) g.nos.push(dn);          // dispatch numbers that really contain this item code
      if(rem && !g.rem.includes(rem)) g.rem.push(rem);
    });
  });
  const rows = Object.values(groups).sort((a,b)=>a.itemCode.localeCompare(b.itemCode)||a.customer.localeCompare(b.customer));
  return {date, rows};
}
function getSelectedHomeDispatchCodes(){
  return [...document.querySelectorAll('#homeDispatchDetailTable .homeDispChk:checked')].map(c=>c.dataset.key);
}
/* rows for print / PDF / Excel: only ticked item codes, or everything if none ticked */
function homeDispatchSelectedData(){
  const {date, rows} = homeDispatchData();
  const sel = getSelectedHomeDispatchCodes();
  return {date, rows: sel.length ? rows.filter(r=>sel.includes(r.key)) : rows};
}
function renderHomeDispatchDetail(){
  const {date, rows} = homeDispatchData();
  const prevChecked = new Set(getSelectedHomeDispatchCodes());
  const tbody=document.querySelector('#homeDispatchDetailTable tbody');
  const tfoot=document.querySelector('#homeDispatchDetailTable tfoot');
  const selectAll=document.getElementById('homeDispSelectAll');
  if(!rows.length){
    tbody.innerHTML = '<tr><td colspan="11" class="empty">No dispatches found'+(date?(' for '+date):'')+'.</td></tr>';
    tfoot.innerHTML='';
    if(selectAll) selectAll.checked=false;
    return;
  }
  tbody.innerHTML = rows.map(g=>{
    const actions = date
      ? `<button class="btn outline sm" onclick="editDispatchGroup('${g.itemCode}','${date}','${encC(g.customer)}')">✎ Edit</button> <button class="btn danger sm" onclick="deleteDispatchGroup('${g.itemCode}','${date}','${encC(g.customer)}')">✕ Delete</button>`
      : `<span class="muted">select a date</span>`;
    return `<tr><td class="no-print"><input type="checkbox" class="homeDispChk" data-key="${esc(g.key)}" ${prevChecked.has(g.key)?'checked':''}></td><td class="itemcode">${g.itemCode}</td><td>${g.customer?esc(g.customer):'<span class="muted">—</span>'}</td><td>${g.product}</td><td>${g.colour}</td><td>${g.size}mm</td><td>${g.lengthQty} ${g.lengthUnit}</td><td>${g.coils}</td><td>${g.totalWt.toFixed(3)}</td><td>${(g.totalWt/g.coils).toFixed(3)}</td><td class="no-print">${actions}</td></tr>`;
  }).join('');
  if(selectAll) selectAll.checked = rows.every(g=>prevChecked.has(g.key));
  const grandCoils = rows.reduce((s,g)=>s+g.coils,0);
  const grandWt = rows.reduce((s,g)=>s+g.totalWt,0);
  tfoot.innerHTML = `<tr style="font-weight:700;background:#eaf0f8;"><td class="no-print"></td><td colspan="6">Grand Total</td><td>${grandCoils}</td><td>${grandWt.toFixed(3)}</td><td>${(grandWt/grandCoils).toFixed(3)}</td><td class="no-print"></td></tr>`;
}
function groupCoils(itemCode, date, custEnc){
  const dmap=dispatchMap(); const hasC=(custEnc!==undefined);
  const cust=hasC?decodeURIComponent(custEnc):'';
  return loadCoils().filter(c=>c.itemCode===itemCode && c.status==='dispatched' && c.dispatchDate===date && (!hasC || customerOf(c,dmap[c.dispatchId])===cust))
    .sort((a,b)=>String(a.serial).localeCompare(String(b.serial),undefined,{numeric:true}));
}
function deleteDispatchGroup(itemCode, date, custEnc){
  const cust=custEnc!==undefined?decodeURIComponent(custEnc):'';
  if(!confirm('Permanently delete ALL dispatched coils for item code '+itemCode+(cust?(' ('+cust+')'):'')+' on '+date+'? This cannot be undone.')) return;
  let coils = loadCoils();
  const matching = groupCoils(itemCode,date,custEnc);
  if(!matching.length){ toast('No matching coils found'); return; }
  const ids = matching.map(c=>c.id);
  coils = coils.filter(c=>!ids.includes(c.id));
  saveCoils(coils);
  reclaimSerialsForDeleted(matching);
  removeCoilsFromBags(ids);
  let dispatches = loadDispatches().map(d=>({...d, coilIds: d.coilIds.filter(id=>!ids.includes(id))})).filter(d=>d.coilIds.length>0);
  saveDispatches(dispatches);
  toast(ids.length+' coil(s) deleted permanently');
  refreshDispatchViews();
}
function refreshDispatchViews(){
  renderHome();
  if(document.getElementById('page-customerDispatch')?.classList.contains('active')) renderCustomerDispatch();
  if(document.getElementById('page-dispatchList')?.classList.contains('active')) renderDispatchList();
}
function homeDispatchNos(date, rows){   // only the dispatch numbers of the ticked item code rows
  const nos=[]; rows.forEach(r=>(r.nos||[]).forEach(n=>{ if(!nos.includes(n)) nos.push(n); }));
  return nos.join(', ');
}
function printHomeDispatchDetail(){
  const {date, rows} = homeDispatchSelectedData();
  if(!rows.length){ toast('No data to print'); return; }
  const grandCoils = rows.reduce((s,g)=>s+g.coils,0);
  const grandWt = rows.reduce((s,g)=>s+g.totalWt,0);
  const bodyHtml = rows.map(g=>`<tr><td class="itemcode">${g.itemCode}</td><td>${esc(g.customer||'')}</td><td>${g.product}</td><td>${g.colour}</td><td>${g.size}mm</td><td>${g.lengthQty} ${g.lengthUnit}</td><td>${g.coils}</td><td>${g.totalWt.toFixed(3)}</td><td>${(g.totalWt/g.coils).toFixed(3)}</td></tr>`).join('');
  // Grand Total is appended as the last row of tbody (not a tfoot) so it prints
  // only once, on the final page, instead of repeating on every printed page.
  const totalRow = `<tr style="font-weight:700;background:#eaf0f8;page-break-inside:avoid;"><td colspan="6">Grand Total</td><td>${grandCoils}</td><td>${grandWt.toFixed(3)}</td><td>${grandCoils? (grandWt/grandCoils).toFixed(3):'0.000'}</td></tr>`;
  const tableHTML = `<table><thead><tr><th>Item Code</th><th>Customer</th><th>Type</th><th>Colour</th><th>Size</th><th>Length</th><th>Coils</th><th>Total Quantity (Kg)</th><th>Average Coil Weight (Kg)</th></tr></thead><tbody>${bodyHtml}${totalRow}</tbody></table>`;
  printGeneric('Dispatch Details — Item Code Wise'+(date?(' — '+date):' — All Dates'), tableHTML, undefined, homeDispatchNos(date, rows));
}
function homeDispatchTableArrays(rows){
  const header=['Sl.No','Item Code','Customer','Type','Colour','Size','Length','Coils','Total Quantity (Kg)','Average Coil Weight (Kg)'];
  const body=rows.map((g,i)=>[i+1,g.itemCode,g.customer||'',g.product,g.colour,g.size+'mm',g.lengthQty+' '+g.lengthUnit,g.coils,+g.totalWt.toFixed(3),+(g.totalWt/g.coils).toFixed(3)]);
  const gc=rows.reduce((s,g)=>s+g.coils,0), gw=rows.reduce((s,g)=>s+g.totalWt,0);
  body.push(['','Grand Total','','','','','',gc,+gw.toFixed(3),+(gc?gw/gc:0).toFixed(3)]);
  return {header, body};
}
function exportHomeDispatchDetailExcel(){
  const {date, rows} = homeDispatchSelectedData();
  if(!rows.length){ toast('No data to export'); return; }
  const {header, body} = homeDispatchTableArrays(rows);
  const ws=buildHeaderedSheet('Dispatch Details — Item Code Wise'+(date?(' — '+date):' — All Dates'), header, body);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DispatchDetail');
  XLSX.writeFile(wb, 'Dispatch_Detail_'+(date||'AllDates')+'.xlsx');
  toast('Excel exported');
}
function exportHomeDispatchDetailPDF(){
  const {date, rows} = homeDispatchSelectedData();
  if(!rows.length){ toast('No data to export'); return; }
  const {header, body} = homeDispatchTableArrays(rows);
  const pdfBody = body.map(r=>r.map(v=>typeof v==='number'? (Number.isInteger(v)?String(v):v.toFixed(3)) : v));
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'landscape'});
  const dnos=homeDispatchNos(date, rows);
  const y0=pdfHead(doc,'Dispatch Details - Item Code Wise'+(date?(' - '+date):' - All Dates'),'Date: '+todayStr()+(dnos?('   |   Dispatch No: '+dnos):''));
  pdfTable(doc,y0,[header],pdfBody,{totalLast:true});
  pdfFoot(doc);
  doc.save('Dispatch_Detail_'+(date||'AllDates')+'.pdf');
  toast('PDF exported');
}


/* ---------- Month-wise dispatch report (Print + PDF) ---------- */
function homeMonthData(){
  const month = document.getElementById('home_reportMonth')?.value || todayStr().slice(0,7);
  const coils = loadCoils();
  const days = [];            // one row per dispatch: date, dispatch no, coils, qty
  const groups = {};          // item-code wise totals for the month
  loadDispatches().filter(d=>(d.date||'').slice(0,7)===month)
    .sort((a,b)=>a.date.localeCompare(b.date) || String(dNo(a)).localeCompare(String(dNo(b)),undefined,{numeric:true}))
    .forEach(d=>{
      const items = d.coilIds.map(id=>coils.find(x=>x.id===id)).filter(c=>c && c.status==='dispatched');
      if(!items.length) return;
      days.push({date:d.date, no:dNo(d), coils:items.length, wt:items.reduce((t,c)=>t+(c.weight||0),0)});
      items.forEach(c=>{
        const g = groups[c.itemCode] = groups[c.itemCode] || {product:c.product, colour:c.colour, size:c.size, lengthQty:c.quantity, lengthUnit:c.lengthUnit, coils:0, totalWt:0};
        g.coils++; g.totalWt += (c.weight||0);
      });
    });
  const rows = Object.keys(groups).sort().map(code=>({itemCode:code, ...groups[code]}));
  const nos = [...new Set(days.map(x=>x.no).filter(Boolean))].join(', ');
  const perDay = [];
  days.forEach(x=>{
    let r = perDay.find(q=>q.date===x.date);
    if(!r){ r={date:x.date, nos:[], coils:0, wt:0}; perDay.push(r); }
    if(x.no && !r.nos.includes(x.no)) r.nos.push(x.no);
    r.coils += x.coils; r.wt += x.wt;
  });
  const gc = rows.reduce((t,g)=>t+g.coils,0), gw = rows.reduce((t,g)=>t+g.totalWt,0);
  const MN=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const label = MN[(+month.slice(5,7))-1]+' '+month.slice(0,4);
  return {month, label, days, perDay, rows, nos, gc, gw};
}
function printHomeMonthReport(){
  const m = homeMonthData();
  if(!m.perDay.length){ toast('No dispatches found for '+m.label); return; }
  const rows = m.perDay.map((x,i)=>`<tr><td>${i+1}</td><td>${x.date}</td><td>${esc(x.nos.join(', '))}</td><td>${x.coils}</td><td>${x.wt.toFixed(3)}</td></tr>`).join('')
    + `<tr style="font-weight:700;background:#eaf0f8;page-break-inside:avoid;"><td colspan="3">Month Total</td><td>${m.gc}</td><td>${m.gw.toFixed(3)}</td></tr>`;
  const html = `<table><thead><tr><th>Sl.No</th><th>Date</th><th>Dispatch No.</th><th>No. of Coils</th><th>Total Quantity (Kg)</th></tr></thead><tbody>${rows}</tbody></table>`;
  printGeneric('Dispatch Details — Month Wise Report', html, 'Dispatch Details — Month Wise Report — '+m.label);
}
function exportHomeMonthReportPDF(){
  const m = homeMonthData();
  if(!m.perDay.length){ toast('No dispatches found for '+m.label); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'portrait'});
  const y0 = pdfHead(doc,'Dispatch Details - Month Wise Report - '+m.label,'Date: '+todayStr());
  const body = m.perDay.map((x,i)=>[i+1,x.date,dashPdfSan(x.nos.join(', ')),x.coils,x.wt.toFixed(3)]);
  body.push(['','Month Total','',m.gc,m.gw.toFixed(3)]);
  pdfTable(doc,y0,[['Sl.No','Date','Dispatch No.','No. of Coils','Total Quantity (Kg)']],body,{totalLast:true});
  pdfFoot(doc);
  doc.save('Dispatch_Month_Report_'+m.month+'.pdf');
  toast('PDF exported');
}

/* ============================================================
   EXPORT: EXCEL (SheetJS)
============================================================ */
function clearAllData(){
  const typed = prompt('This will PERMANENTLY delete ALL stock entries, dispatch records, and returned coils.\nCustom Colour / Construction / Tracer option lists will be kept.\n\nType CLEAR (in capitals) to confirm:');
  if(typed !== 'CLEAR'){ toast('Clear cancelled — no changes made'); return; }
  localStorage.removeItem(LS.coils);
  localStorage.removeItem(LS.dispatches);
  localStorage.removeItem(LS.counters);
  localStorage.removeItem(LS.bagPacking);
  localStorage.removeItem(LS.bagManual);
  cart = [];
  lockedDetails = null;
  sessionCoils = [];
  toast('All stock, dispatch and returned data cleared');
  renderHome();
  renderStockPage();
  renderDispatchPage();
  renderDispatchList();
  renderReturned();
  renderNonMovable();
  renderBagPacking();
}
function recodeOldStock(){
  const typed = prompt('This will regenerate Item Codes and Serial Numbers for ALL coils (Stock, Dispatched, and Returned), splitting stock into separate lots wherever the Length differs — even at the same Size.\n\nDispatch and return history stays linked correctly (coils keep their internal ID), but visible Item Codes and Serial Numbers WILL change.\n\nExport a backup first if you are not sure!\n\nType RECODE (in capitals) to confirm:');
  if(typed !== 'RECODE'){ toast('Re-code cancelled — no changes made'); return; }
  let coils = loadCoils();
  if(!coils.length){ toast('No coils to re-code'); return; }
  const groups = {};
  coils.forEach(c=>{
    const newCode = buildItemCode(c.resin, c.product, c.colour, c.size, c.construction, c.tracer, c.quantity, c.lengthUnit);
    (groups[newCode] = groups[newCode] || []).push(c);
  });
  const newCounters = {};
  const updated = [];
  Object.keys(groups).forEach(code=>{
    const list = groups[code].slice().sort((a,b)=>a.serial.localeCompare(b.serial, undefined, {numeric:true, sensitivity:'base'}));
    list.forEach((c,idx)=>{
      const n = idx+1;
      newCounters[code] = n;
      updated.push({...c, itemCode: code, serial: code+'-'+String(n).padStart(4,'0')});
    });
  });
  saveCoils(updated);
  saveCounters(newCounters);
  toast('Re-coded '+updated.length+' coil(s) into '+Object.keys(groups).length+' lot(s) by length');
  renderHome();
  renderStockPage();
  renderDispatchPage();
  renderDispatchList();
  renderReturned();
  renderNonMovable();
}
function buildAllDataSheet(){
  const coils=loadCoils(), dispatches=loadDispatches(), bags=loadManualBags();
  const dMap={}; dispatches.forEach(d=>dMap[d.id]=d);
  const num=v=>{ const n=parseFloat(v); return isNaN(n)?'':+n.toFixed(3); };
  const byDate=(a,b)=>String(a||'').localeCompare(String(b||''));
  const serialCmp=(a,b)=>String(a.serial||'').localeCompare(String(b.serial||''),undefined,{numeric:true});
  const rows=[], merges=[], boldRows=[];
  const W=17; // widest table = coil table columns
  const push=(r,bold)=>{ if(bold) boldRows.push(rows.length); rows.push(r); };
  const blank=()=>rows.push([]);
  const title=t=>{ blank(); push([t],true); };
  const COIL_H=['Serial','Item Code','Resin','Type','Colour','Size (mm)','Construction','Tracer','Length','Length Unit','Weight (Kg)','Stock Date','Status','Dispatch No','Dispatch Date','Customer','Return Date'];
  const coilRow=c=>{ const d=dMap[c.dispatchId]; return [c.serial||'',c.itemCode||'',c.resin||'',c.product||'',c.colour||'',c.size||'',c.construction||'',c.tracer||'',c.quantity===undefined?'':c.quantity,c.lengthUnit||'',num(c.weight),c.date||'',c.status||'',d?dNo(d):'',c.dispatchDate||(d?d.date:'')||'',customerOf(c,d),c.returnDate||'']; };
  const coilSection=(label,list)=>{
    const sorted=list.slice().sort((a,b)=>String(a.itemCode).localeCompare(String(b.itemCode))||serialCmp(a,b));
    const kg=sorted.reduce((t,c)=>t+(+c.weight||0),0);
    title(label+'  —  '+sorted.length+' coil(s), '+kg.toFixed(3)+' kg');
    push(COIL_H,true);
    if(!sorted.length){ push(['(none)']); return; }
    sorted.forEach(c=>push(coilRow(c)));
    const r=Array(W).fill(''); r[0]='TOTAL'; r[10]=+kg.toFixed(3); push(r,true);
  };
  push(['POLYMER PRODUCTS CO LLC — FULL DATABASE EXPORT'],true);
  push(['Exported on: '+todayStr()]);
  push(['Stock: '+coils.filter(c=>c.status==='stock').length+' | Dispatched: '+coils.filter(c=>c.status==='dispatched').length+' | Returned: '+coils.filter(c=>c.status==='returned').length+' | Non-movable: '+coils.filter(c=>c.status==='nonmovable').length+' | Dispatches: '+dispatches.length+' | Bags: '+bags.length]);

  coilSection('1. STOCK IN HAND', coils.filter(c=>c.status==='stock'));

  // 2. Dispatch list, each day
  const dispCoilTotal=dispatches.reduce((t,d)=>t+d.coilIds.filter(id=>{const c=coils.find(x=>x.id===id);return c&&c.status==='dispatched';}).length,0);
  title('2. DISPATCH LIST — EACH DAY  —  '+dispatches.length+' dispatch(es), '+dispCoilTotal+' coil(s)');
  if(!dispatches.length) push(['(none)']);
  const dispDates=[...new Set(dispatches.map(d=>d.date))].sort(byDate);
  let grandKg=0, grandN=0;
  dispDates.forEach(date=>{
    const dayDisp=dispatches.filter(d=>d.date===date);
    let dayN=0, dayKg=0;
    blank(); push(['DATE: '+date+'   |   Dispatch No: '+dayDisp.map(dNo).join(', ')],true);
    push(['Dispatch No','Dispatch Date','Remarks','Serial','Item Code','Resin','Type','Colour','Size (mm)','Construction','Tracer','Length','Length Unit','Weight (Kg)','Customer'],true);
    dayDisp.forEach(d=>{
      d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(c=>c&&c.status==='dispatched').sort(serialCmp).forEach(c=>{
        push([dNo(d),d.date,d.remarks||'',c.serial||'',c.itemCode||'',c.resin||'',c.product||'',c.colour||'',c.size||'',c.construction||'',c.tracer||'',c.quantity===undefined?'':c.quantity,c.lengthUnit||'',num(c.weight),customerOf(c,d)]);
        dayN++; dayKg+=(+c.weight||0);
      });
    });
    const r=Array(15).fill(''); r[0]='DAY TOTAL '+date; r[3]=dayN+' coil(s)'; r[13]=+dayKg.toFixed(3); push(r,true);
    // item-code summary for the day
    const g={}; dayDisp.forEach(d=>d.coilIds.forEach(id=>{ const c=coils.find(x=>x.id===id); if(!c||c.status!=='dispatched') return; (g[c.itemCode]=g[c.itemCode]||{n:0,kg:0}); g[c.itemCode].n++; g[c.itemCode].kg+=(+c.weight||0); }));
    push(['Item Code summary — '+date,'','','','No. of Coils','Total Kg','Avg Kg / Coil']);
    Object.keys(g).sort().forEach(k=>push([k,'','','',g[k].n,+g[k].kg.toFixed(3),+(g[k].kg/g[k].n).toFixed(3)]));
    grandKg+=dayKg; grandN+=dayN;
  });
  if(dispDates.length){ blank(); const r=Array(15).fill(''); r[0]='ALL DISPATCHES TOTAL'; r[3]=grandN+' coil(s)'; r[13]=+grandKg.toFixed(3); push(r,true); }

  coilSection('3. RETURNED COILS', coils.filter(c=>c.status==='returned'));
  coilSection('4. NON-MOVABLE COILS', coils.filter(c=>c.status==='nonmovable'));

  // 5. Bag packing, each day
  title('5. BAG PACKING — EACH DAY  —  '+bags.length+' bag(s)');
  if(!bags.length) push(['(none)']);
  const bagDatesAsc=[...new Set(bags.map(b=>b.date))].sort(byDate);
  let bagAllN=0, bagAllC=0, bagAllKg=0;
  bagDatesAsc.forEach(date=>{
    const list=bags.filter(b=>b.date===date).sort(bagCmp);
    blank(); push(['DATE: '+date+(bagDispNos(list)?'   |   Dispatch No: '+bagDispNos(list):'')],true);
    push(['Sl.No','Item Code','Colour','Bag No','Dispatch No','No of Coils','Total Quantity (Kg)','Rope Size','Length','Length Unit'],true);
    let tc=0, tk=0;
    list.forEach((b,i)=>{ push([i+1,b.itemCode||'',b.colour||'',b.bagNo,b.dispatchNo||'',b.coils===''||b.coils==null?'':+b.coils,num(b.qty),b.ropeSize||'',b.length===''||b.length==null?'':+b.length,b.lengthUnit||'']); tc+=(parseInt(b.coils)||0); tk+=(+b.qty||0); });
    const r=Array(10).fill(''); r[0]='DAY TOTAL'; r[3]=list.length+' bag(s)'; r[5]=tc; r[6]=+tk.toFixed(3); push(r,true);
    const g={}; list.forEach(b=>{ (g[b.itemCode]=g[b.itemCode]||{n:0,c:0,q:0}); g[b.itemCode].n++; g[b.itemCode].c+=(parseInt(b.coils)||0); g[b.itemCode].q+=(+b.qty||0); });
    push(['Item Code summary — '+date,'','No. of Bags','Total Coils','Total Kg','Avg Kg / Bag','Avg Kg / Coil']);
    Object.keys(g).sort().forEach(k=>push([k,'',g[k].n,g[k].c,+g[k].q.toFixed(3),+(g[k].q/g[k].n).toFixed(3),g[k].c>0?+(g[k].q/g[k].c).toFixed(3):'']));
    bagAllN+=list.length; bagAllC+=tc; bagAllKg+=tk;
  });
  if(bagDatesAsc.length){ blank(); const r=Array(10).fill(''); r[0]='ALL BAGS TOTAL'; r[3]=bagAllN+' bag(s)'; r[5]=bagAllC; r[6]=+bagAllKg.toFixed(3); push(r,true); }

  const ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[22,34,14,16,14,12,14,14,10,12,12,14,14,16,16,18,12].map(w=>({wch:w}));
  return ws;
}
function exportAllExcel(){
  const wb = XLSX.utils.book_new();
  const coils = loadCoils();
  const dispatches = loadDispatches();
  const bags = loadManualBags().slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||bagCmp(a,b));
  // Sheet 1: EVERYTHING on one page (stock, dispatch list each day, returned, non-movable, bag packing each day)
  XLSX.utils.book_append_sheet(wb, buildAllDataSheet(), 'All Data');
  // Separate raw sheets (kept so "Import" still works with this file)
  const stockSheet = XLSX.utils.json_to_sheet(coils.filter(c=>c.status==='stock'));
  const dispSheet = XLSX.utils.json_to_sheet(coils.filter(c=>c.status==='dispatched'));
  const retSheet = XLSX.utils.json_to_sheet(coils.filter(c=>c.status==='returned'));
  const nonmovSheet = XLSX.utils.json_to_sheet(coils.filter(c=>c.status==='nonmovable'));
  const dispatchLog = XLSX.utils.json_to_sheet(dispatches.map(d=>({id:d.id,dispatchNo:dNo(d),date:d.date,remarks:d.remarks,coilCount:d.coilIds.length})));
  const bagSheet = XLSX.utils.aoa_to_sheet([BAG_XL_HEADER, ...bags.map(b=>[b.date,b.itemCode,b.colour,b.bagNo,b.coils===''?'':+b.coils,+(+b.qty||0).toFixed(3),b.ropeSize,b.length===''?'':+b.length,b.lengthUnit||'',b.dispatchNo||''])]);
  XLSX.utils.book_append_sheet(wb, stockSheet, 'Stock');
  XLSX.utils.book_append_sheet(wb, dispSheet, 'Dispatched');
  XLSX.utils.book_append_sheet(wb, retSheet, 'Returned');
  XLSX.utils.book_append_sheet(wb, nonmovSheet, 'NonMovable');
  XLSX.utils.book_append_sheet(wb, dispatchLog, 'Dispatches');
  XLSX.utils.book_append_sheet(wb, bagSheet, 'BagPacking');
  XLSX.writeFile(wb, 'Polymer_Stock_Dispatch_'+todayStr()+'.xlsx');
  toast('Excel exported — full database (All Data sheet + raw sheets)');
}
// What the export file holds besides the coils: dispatches, bags, and the serial counters they imply.
function importAllDetails(wb, coils){
  const out={counters:{}, note:''};
  coils.forEach(c=>{ const n=parseInt(String(c.serial||'').split('-').pop(),10); if(c.itemCode && !isNaN(n)) out.counters[c.itemCode]=Math.max(out.counters[c.itemCode]||0,n); });
  if(wb.SheetNames.includes('Dispatches')){
    const rows=XLSX.utils.sheet_to_json(wb.Sheets['Dispatches']);
    out.dispatches=rows.map(r=>{
      const own=coils.filter(c=>c.dispatchId===r.id);
      return {id:r.id, dispatchNo:String(r.dispatchNo==null?'':r.dispatchNo), date:r.date, coilIds:own.map(c=>c.id), remarks:r.remarks==null?'':r.remarks, customer:(own[0]&&own[0].customer)||'', createdAt:new Date().toISOString()};
    });
    out.note+=' It also replaces dispatches with '+out.dispatches.length+' from the file.';
  }
  if(wb.SheetNames.includes('BagPacking')){
    const rows=xlReadRows(wb,'BagPacking',['itemcode','bagno'])||[];
    out.bags=rows.map((r,i)=>{
      const coilsN=xlNum(xlPick(r,['noofcoils'])), lenN=xlNum(xlPick(r,['length']));
      return {id:'MB'+Date.now()+'_'+i, date:xlDate(xlPick(r,['date']))||todayStr(), itemCode:String(xlPick(r,['itemcode'])).trim(), colour:String(xlPick(r,['colour'])).trim(), bagNo:String(xlPick(r,['bagno'])).trim(),
        coils:isNaN(coilsN)?'':Math.round(coilsN), qty:xlNum(xlPick(r,['totalquantitykg']))||0, ropeSize:String(xlPick(r,['ropesize'])).trim(), length:isNaN(lenN)?'':lenN, lengthUnit:String(xlPick(r,['lengthunit'])).trim()||'Yards', dispatchNo:String(xlPick(r,['dispatchno'])).trim()};
    });
    out.note+=' It also replaces bag packing with '+out.bags.length+' bag(s) from the file.';
  }
  return out;
}
function importAllExcel(evt){
  const file=evt.target.files[0];
  if(!file) return;
  if(window.PPC) PPC.keepFiles([file],'stock');
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const data=new Uint8Array(e.target.result);
      const wb=XLSX.read(data,{type:'array'});
      let allCoils=[];
      ['Stock','Dispatched','Returned','NonMovable'].forEach(sheetName=>{
        if(wb.SheetNames.includes(sheetName)){
          const rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
          allCoils=allCoils.concat(rows);
        }
      });
      if(!allCoils.length){ toast('No recognizable data found in file'); return; }
      const restored=importAllDetails(wb, allCoils);
      if(!confirm('Import will REPLACE current coil data with '+allCoils.length+' rows from the file.'+restored.note+' Continue?')) return;
      // normalize quantity to number
      allCoils = allCoils.map(c=>({...c, quantity: parseFloat(c.quantity)||0}));
      saveCoils(allCoils);
      if(restored.dispatches) saveDispatches(restored.dispatches);
      if(restored.bags) saveManualBags(restored.bags);
      saveCounters(restored.counters);
      toast('Imported '+allCoils.length+' coil records');
      renderHome();
    }catch(err){
      alert('Import failed: '+err.message);
    }
  };
  reader.readAsArrayBuffer(file);
  evt.target.value='';
}
function currentFilteredList(scope){
  if(scope==='stock'){
    if(stockMode==='selection'){
      const ids=[...document.querySelectorAll('#stockTableHost .stockRowChk:checked')].map(c=>c.dataset.id);
      let coils=loadCoils();
      return ids.length? coils.filter(c=>ids.includes(c.id)) : coils.filter(c=>c.status==='stock');
    }
    const checked=[...document.querySelectorAll('#stockTableHost .stockRowChk:checked')].map(c=>c.dataset.id);
    let coils=loadCoils();
    if(checked.length) return coils.filter(c=>checked.includes(c.id));
    let filtered=coils.filter(c=>c.status==='stock');
    if(stockMode==='date'){ const d=document.getElementById('stockDateFilter')?.value; if(d) filtered=filtered.filter(c=>c.date===d); }
    if(stockMode==='itemcode'){ const code=document.getElementById('stockItemCodeFilter')?.value; filtered = code? filtered.filter(c=>c.itemCode===code):[]; }
    return filtered;
  }
  return [];
}
function exportFilteredExcel(scope){
  const list=currentFilteredList(scope);
  if(!list.length){ toast('No rows to export'); return; }
  const header=['Sl.No','Type','Rope Size','Construction','Length','Quantity in Kgs'];
  const body=list.map((c,i)=>[i+1, c.product, c.size+'mm', c.construction, c.quantity+' '+c.lengthUnit, +(c.weight||0)]);
  const ws=buildHeaderedSheet(uniqueItemCodeLabel(list), header, body);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'StockExport');
  XLSX.writeFile(wb, 'Stock_Export_'+todayStr()+'.xlsx');
  toast('Excel exported ('+list.length+' rows)');
}
function computeDispatchSummaryRows(dispatches, coils){
  const groups={};
  dispatches.forEach(d=>{
    d.coilIds.forEach(id=>{
      const c=coils.find(x=>x.id===id);
      if(!c||c.status!=='dispatched') return;
      groups[c.itemCode] = groups[c.itemCode] || {...c, coils:0, totalWt:0};
      groups[c.itemCode].coils++;
      groups[c.itemCode].totalWt += (c.weight||0);
    });
  });
  return Object.values(groups).sort((a,b)=>a.itemCode.localeCompare(b.itemCode));
}
function dispatchEntryLabel(dispatches){
  const ids=dispatches.map(d=>dNo(d));
  if(!ids.length) return 'Dispatch Entry Number: —';
  return ids.length===1 ? ('Dispatch Entry Number: '+ids[0]) : ('Dispatch Entry Numbers: '+ids.join(', '));
}
function exportDispatchListExcel(){
  const dispatches=loadDispatches();
  const coils=loadCoils();
  const filterDate=document.getElementById('dl_dateFilter')?.value;
  let filtered = filterDate? dispatches.filter(d=>d.date===filterDate) : dispatches;
  if(!filtered.length){ toast('No dispatch rows to export'); return; }
  const rows=computeDispatchSummaryRows(filtered, coils);
  if(!rows.length){ toast('No dispatch rows to export'); return; }
  const header=['Sl.No','Item Code','Type','Rope Size','Construction','Length','Total quantity in kgs','Average weight in kgs'];
  const body=rows.map((g,i)=>[i+1, g.itemCode, g.product, g.size+'mm', g.construction, g.quantity+' '+g.lengthUnit, +g.totalWt.toFixed(3), +(g.totalWt/g.coils).toFixed(3)]);
  const ws=buildHeaderedSheet(dispatchEntryLabel(filtered), header, body);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DispatchList');
  XLSX.writeFile(wb, 'Dispatch_List_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function exportReturnedExcel(){
  const coils=loadCoils().filter(c=>c.status==='returned');
  if(!coils.length){ toast('No returned coils'); return; }
  const ws=XLSX.utils.json_to_sheet(coils);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Returned');
  XLSX.writeFile(wb, 'Returned_Coils_'+todayStr()+'.xlsx');
  toast('Excel exported');
}

/* ============================================================
   EXPORT: PDF (jsPDF + autotable)
============================================================ */
/* ---- Shared PDF layout: everything centred + fitted to the page, following the centred company heading ---- */
function pdfHead(doc, sub, dateLabel){
  const PW=doc.internal.pageSize.getWidth(), cx=PW/2;
  const t='POLYMER PRODUCTS CO LLC', ls=12;
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.setTextColor(15,61,62);
  const tw=doc.getTextWidth(t);
  try{ doc.addImage(COMPANY_LOGO,'JPEG',cx-tw/2-ls-3,5.5,ls,ls); }catch(e){}
  doc.text(t,cx,13.5,{align:'center'});
  doc.setDrawColor(210,105,30); doc.setLineWidth(.6); doc.line(10,19.5,PW-10,19.5);
  let y=26;
  if(sub){ doc.setFontSize(11); doc.text(dashPdfSan(sub),cx,y,{align:'center'}); y+=5.5; }
  doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(dashPdfSan(dateLabel),cx,y,{align:'center'}); doc.setTextColor(0);
  return y+5;
}
function pdfTable(doc, startY, head, body, o){
  o=o||{};
  const n=head[0].length;
  const fs=o.fontSize || (n>=12?7: n>=9?8: n>=7?8.5: 9.5);
  doc.autoTable(Object.assign({
    startY:startY, head:head, body:body, theme:'grid',
    margin:{left:10,right:10,bottom:14}, tableWidth:'auto',
    styles:{fontSize:fs,halign:'center',valign:'middle',overflow:'linebreak',cellPadding:1.8,lineColor:[198,210,224],lineWidth:.15},
    headStyles:{fillColor:[15,61,62],textColor:255,halign:'center',valign:'middle'},
    alternateRowStyles:{fillColor:[247,250,253]},
    didParseCell:d=>{ const tl=o.totalRows||(o.totalLast?1:0); if(tl && d.section==='body' && d.row.index>=body.length-tl){ d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[234,240,248]; } }
  }, o.extra||{}));
}
function pdfFoot(doc){
  const n=doc.internal.getNumberOfPages(), PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight();
  for(let p=1;p<=n;p++){ doc.setPage(p); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(120); doc.text('Page '+p+' of '+n,PW/2,PH-5,{align:'center'}); doc.setTextColor(0); }
}
function exportFilteredPDF(scope){
  const list=currentFilteredList(scope);
  if(!list.length){ toast('No rows to export'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'landscape'});
  const y0=pdfHead(doc,'Stock Report','Generated: '+new Date().toLocaleString());
  pdfTable(doc,y0,
    [['Serial','Item Code','Material Type','Product','Colour','Size','Construction','Tracer','Unit','Qty','Weight (Kg)','Date']],
    list.map(c=>[c.serial,c.itemCode,c.resin,c.product,c.colour,c.size+'mm',c.construction,c.tracer,c.lengthUnit,c.quantity,(c.weight||0),c.date]));
  pdfFoot(doc);
  doc.save('Stock_Report_'+todayStr()+'.pdf');
  toast('PDF exported');
}
function exportHomePDF(){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const y0=pdfHead(doc,'Overall Stock & Dispatch Balance Sheet','Generated: '+new Date().toLocaleString());
  const rows=[...document.querySelectorAll('#balanceSheetTable tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent));
  pdfTable(doc,y0,[['Material Type','Product','Coils in Stock','Stock Wt (Kg)','Dispatched Wt (Kg)','Returned Wt (Kg)','Balance Wt (Kg)']],rows);
  pdfFoot(doc);
  doc.save('Balance_Sheet_'+todayStr()+'.pdf');
  toast('PDF exported');
}

/* ============================================================
   PRINT (browser print of on-screen printable area)
============================================================ */
const COMPANY_LOGO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAFgAWADASIAAhEBAxEB/8QAHgABAAEEAwEBAAAAAAAAAAAAAAgCAwcJAQUGBAr/xABaEAACAAUCAgMICgwKBwkBAAAAAwEEBQYHCBMRIwIJFBUhMTNDUVNzFyRBYWNxdZOz0xIWGSU0NzhXg5GVsRgyNURUdHaBo6UmRVaUocPjIig2UmWEtMHR8//EABsBAQADAQEBAQAAAAAAAAAAAAADBAUBBgIH/8QAMxEAAgIBAgUDAgIKAwAAAAAAAAMBBAUREwYhIzEzFBVBAlEkUyU0NUNhcYGRobESFvD/2gAMAwEAAhEDEQA/ANqYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAVgoABWCgAFYBQAVgoABWC3uwOQCsFAAKwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgHxunUIU17npUpPjWiOfYH1R6XmLcSIefuskwThpjaHRnuvOvph35Skthsq+NxEqZ6wzWll/psl8M2TGWVBvCMaLR+6L1fHvb0C/Vwlt3Vn/ACRbxtx7w4Q8xqeVfXW4NX3W7k13a8dtdx6Z9CfIrXRr0w1Mb2YLCfM09zeEI1qg9k4fpk7MCz7G2fGyCL1ZttLpD3T31jOF81zSrcuB7rNuB/ipSou5LvUuJeKb0XLhFPizMtVHU+m6C1qfSUHG7AbsCKAWu/5jkx5kDNuO8by3C4K0ntXkpVXNdH4oEdbj1w1SfmIy1jWQvhHxLpp+7Fv6GHfLaqbnGHbzmPp+VpNIs7sCEitWefdrtHscyiVf1RxdomuK6qbM9nvOyZRqt7+aO2tn9ZL7c4qp4noOJs8Ps4d/wlUOjwhw4mHccaj8a5H5FMq3ZJp0PwSf5MTLsHw4ceJUaqU9zap3E3o3EyXgcbsDzN8ZCs3HNBbdN83FJUOlIhzXzjdqECKImeUFw9Lx6JzDh7hr9yl1uOLLcmm0vGdn1K7HJbsxmmu7Ijj+ow5KdZvrEutjXWlhCgzcp5HslHnJv/nGmnB33c4gi3jbBxLv2fRNT6utH1Q2dU1QyPhejolN3g5TadOU5zfniR+F+s8wRkyZVQ7shOWbVXR2uFQ5snGPrjrsJbRGu2N7UmkVnVU6pyNSkVTtLnEzco5W6lqnbu7A7Iy5iY5SSlYKCsAAAAAAAAAAAAAAAAAAAAAAAAAFBWUAHl73va17Ctifu+7qrKU+l0xO+97W+KNVmbtWWb9Zd+ew/p+pU5KW092ztKjsum/hnO9xJJPrBsBais+1S07axlMIbaMXffJO9s7L/TOM7abNMdg6b7KTblvSKnVVyvvlVW+Om3mzj21Manenm0qt6xHrTl1XuM8erlLizBBV23B450q6HtNP1xNqh23RLap6qVQKXKU6VQnZSmVTtKVD+47zbgWYx8xQtZB1ydWyWVK0gu7fROqqNHpdXkGyNUkUzko5Wy5TU7u7A7fiCnEtgciBGpnqybByFLTd04YQm0rl8d2RX4HN/UmD9OWsrKWl+8F4N1LSNTbRJRvZ1Omo7r6d/fDxyTbDCHAwHqp0sY71H2e1FwJVT61Jq3qdVlQ5yTcqZDf/AAlzmoquXsxqoy/QLroF00KUuSgVNM7TJxO8ibS3ippGXOeqx66gyw8TcW1Bztls+pW78z5yFeM6tkrAds3Jjyq5Dh3A6LtiClN3kw+InfpSw/YVOtKVyXI1WUrc1U07yptLt5KviJnY1WM608/seYdkbWTb6SoePxdpIqt0uhd+YJydi58d6Mpvc5vriTdp43siz1QTbNuycl8IpJ7GEIQhwhAudLoQjHvxMptxrjVoYKrTjWY1k+WCoRVwglJ0lw2Ta1yS2xcFvSdRV5nJ3j0MOHuFxceXCHvFWHSara6HfBFDJ2im26jBlVxw+NJqEY73ZGt5LjxOPNQl+4Vq6bCy9JTU5KLhswe3vuUSA1B1PKVOtJMxiRDm1GM3ztpO8Y5zlWcf0fAirp1DTCZSqok+Cmp5M41/wJqIbL+i3meQuYnZta47pNPdZX1UYtxLiv2S56tom5ScT97VJbzZx3mga3LetXUJ1lWS21y4KrOUiyqY7x38zlPgU/DHQKRZ2bKNKVWqIqSaUmc2XbPkTa5gNWM5LG1JpOK0ITRJNOylSvJe800ZhOGT0ebTRx2W9X0H+U8Nh7Qtp0w1KqjTLCk61VleNqtVTCbfxJAppslJq2ES6VK9EpJ9hdPPNtudOrZPTHRVagUWuyrpGtUWTnJV6ucpqd3dgRJzv1Z+EMpys1VLAkoWRX285T6eqHY2x99JNHjEt7XvEibjqk6qk5tQadLNy3qg6vS9U2RkeQnKtZz28lLm7qXf1N0TaHhbNdg54s6UvewKsqclXQhByu9vSkfQuPsy7h6yc12nM2ffNFTUZR3iu94o1V1y2809W1m5Vcor5yo2TU3eN8jOI9C74Y1ujmU/ZpW8JuRSXTHuHMv2tmyxKdf1pTEWylSTx2vRGQjz+1s8i0VgA6AAAAAAAAAAAAAAAAAAAAAAUFZQADjagcnG7AagcIxLXD3TqLguSiWtSnVy4anJ06nySt503Nu2kqgQ7y71p+CrJY6lWLJ1K+JtPlZPkyfzxaq1HXPDBzdiCbXGPmH/AGeHCMYfrNctp9YLlPLMs37WLdpFPm97ZTT1KjOOPkvvUbqRoMsyeueduOkyEO8166DtJ/XFJbjEt12pPN2+IVo5QqZNhVw3TQbUpzanXqmiTlEw5rWt4QId5j1B3Tliqex1iSXbCUnG7DnJ8dNwIl0vUHju+7wlZLJuTK6qVe3ZbVpyU7XtGzjAuOcS25bcrXMdTkpWkziv5WU7e3iZ1P2yNWxqZu7kc3O14lGGlaBbJvDE81at8Od3aqSt5VQU38Ed7xDCh3JqL6tvJTaJWUuq9kzruMFNj7TnPU+hcbkO/Dwnk79xxZOTbemrXvi3pSq0ucVstTNKIamXmZ0t81HpkY5NFO2ox/gjVdh7UJRlTtlXGlNQ2edSptu1OJM2Q78DUpqM0R27iC5I3HhnLCqbNIdvJpTXO7ZK/E5J22Ls+6rbKlVSNZyy6tqj4pM3JpnHfPFp+DU+N6m3l/Ez7XEVSn0mm1WEOHunDG9Ho+6QVjqI1TVmQ36bQZtStrjuylH3iO2Ybq1FZH3aVWsz3JKJdyHU/kyaXfM7JUqYiXTzbBWjiegTR1Ha7sMYHkpmQjVU3FdUOSqi05+7FUfhm+RIL2NjbUV1i+RE3hfL5ykWTJO8ds7SUo9DJmStI+h7AVxTcncWR78jdFaS3ejQG8lEPj9MbKbdoFDtylStFt6mSlPp0mraSpKtqCoe8XHWquFjaq82/c2UPTe6yTHVL01YuoGME4spVuoTSUK5W1Dm73pvjIw1egZM0m3ZGqUWL5u33u4brY8Et9cT7j0YRgdRXKBSbkpbaZWZNU1KPVsuU1XeiZqchOvW56lTLYn1nXR5TwuKM82RliQV3MnlStV2edT2+OSZL3odKHnNemqe1sW6fZpNbpuTE0moObB6aK3nTavUHmsfa28ibapGjX7J1ze8SmbTvO+uLvtEvVvJMpGcuUujkVGzcuR4ec1a3lr61r2TWahMPw8p1vpdwTNNtydSj5477GnW8UWdml0rMGO5ykemqFJdvQT+hcQThbcRqemTbU82Wnh8mYmsjMlqTVn5AoqarSpzyUfJfEfJi7NuM8y0bu7je8JOuS3Dm7Tucr41GQ+JndRE/wAS2Y9w7hiyMH2kux8fUx0nSUt3obrt2LTIQBHLdQVgA6AAAAAAAAAAAAAAAAAAAAAAUFZQAU9KHGHh8BG3VNrMx1pko2xPM7q3LNJ3ZKkqbzo++3v96BmfI83dFMsOvzlkyEJu4ESbm01LPKu9yBrW016G8m52yLUMxar0VFKu2b/c+b8dUXfUl7E1auu9c7QROMf0OydWvWJXPC4rgqr6TZ6Hclro7VNlPUp8uTZwn1cWnPFa1T1ZoX25VVUOLZuuc5PzPiSUFFoFKt2lppVEkUycpJq2UqSrxR23DhDhAnuZxzejU6SiJKfudRSrcotBkFSFFpcnJysuraSlKdpSoHYslJdy+D0JavzbR9oMvfkk2II0Z+0LYRz5KzU9PW5KUS4HeJq9ORsujH4b0xAVU5qZ6tvIqkTu9V7Jnneukpz6lxuLhGEYcTweYrWx1eNh1WiZNk5N1vuT7c7V4FGpj8s1fQfGqiFyk/TG9J53CepTGWcbCVftsVVSlJTxqEo50N6Tj5mmEcxarK7dVUhYWGpec+yc3Y7WlXNd6khP9rdnYNmrlqto3FWHW+52wlrXbO8knRoVrGELwsn7YsfTHaq/Dk1Nc1H24n3i47HKp9ZXM8o7IW807ZqeI+TGujWfq7ftizBVZtrn87uet3O/TO90ktaeMbIsiV2rftyTk+932KVDdaexOO/D3TIbca49BQwVSnzWIoT6GH6jz9zWHat4SXYbmt6TqKvM5J6T7OEY8IwKOHvlbemC/NZDe8EM8saQZ6gNZdOIJ6cS+U50JSDucr1J2GB9U88iaXYOWYPVUd3YTPtV4fXGash54sLHNdp9uXBGbhNVPwbKeMFHj88ad6JkymNuG34KlbgUreS6EPwrve6aiXQ+Nq0eRfjpou3scZ8S+XcrdVHgvgQu1ra9aJgmWdYGO3Iq19TatlnCPJp3e90xNXNRudcfY2rWO7Zgmbrcl7STNtfuulPU+c+7RBoRnalPLzrqIlIT9WnXdsptKm+dwj6Z3vk1bGppfi7htY7L+5L0V3PDabdAt8ag6zDNGpWq1LufU3ds7nub7cqP1KTZJYOIMdYyo6qJYtoUiiSqeHGEpJwTuHtUy6UL6CUq21q8EC90ulGEO9Ap28k223X4NZaY+T5mycu5XByE/MmIsu6V8FZrlnJvuwac6adD+UFJ2ZxX6YzRxLTiop7ldpJeUGpPMeinOukWvNyzp3uqpVaiyfPbtfhkp670yST+jXXpbedkqsjIME0O+kq2lJ47Saj6kyhmjO1Ux7e9Ks5FrKqKamnmtb5UiBrZ0i2vQLopWYMTVxNp1acnN6cpSnbPF/p0m+pqsmrZt9/iTF9yVX3dTZ2mMOBe8JgLSXki6cgY1TG9I9rqtN9pPqG1whN++Z88EDAcr07No0KltVxW6o5KygrIy2AAAAAAAAAAAAAAAAAAAAAACgAFlSeBeON2ABa4e8OHA87c1+WpY0h2+565J09Pnc4wLdWt2w6bBiLZolSqzYeVb7UT+uJKqo5xm2svUp+VhJ3eON6HnNd03q3zq6fc+SrcnKKe3glXY0uUmHxnn7g1M5mq6mJnb+nFKbDhCMqnskYfMmh7Q0wHcZVU/BPXIWWbIxvINnbnraVcFfgiua5pEW7L1yXqsuhVu2xIzcnQEu3oq9F64tYZwdb2X2wrlYyJJzro850pKc1zfniZ9n2Fa9i0VVEtelok5X4LyomFUv5kCJt8T+XpKPC2lppx1bmP5qwanRE1ZFTTs1Fs0nx5rvznpkzPojvv2aMCVWcm7VU3juK50ZP4F3wJt28lwPiqFOkqnKNkanLpm5VyuDlMVx3SGrlmqbpPOD1iKaq6dlJFXSrr6xpn2Qlbcuafk7dvThsNpzm7SpuPnSS3g6HuRNcerrq58aJXM5MxletIsFyue+VqE5BMk31PoSKWNtfWpnCjm24q+ZO7KdJO2UqqvtxPz3jjWnBryfXx/wDk7Ddnk03k73vnJqeT1wuVOy8/FdttmvSpc4x/ePWqan7plmyVvvoNr/DSclvfT7xCnhfIuHqkmz3M1NwXRlIyNl+Yo9OhRu+qbnJrZ/8A6kEdRHWJXlmCoew/peotSUupu7F3QSn25N+p9CeVxfovztq36ctkjLmYpR1Jm4cd2FR7pP8A1Q5KTYfgPShh3TtS4JsW3lMqrU8+rTXNnHk0/TTwnm6rSJSvyiKmBur0vihY8qFTyDeD03VUob6aVvbyJT13nPYYjzrd+Cqz7HeVJGbhS0t2IdJvhk/+iTn8EPOY3ythmz8qUdiLhTBM0qHJn08pyfiiUPcZuzpb7GHksT/wZ6ynyaest65aJclMTVKLPJqEo7vqcpveid30uEYd/j/ca35+vXhp4uZlMtPJUpUJXehGCZZu8pvrjItD121tCVQrNkSk22PlZV+1+8NxLe6SpT4uq+G33Jt9Hpw6H8UtOb0VK7/K4EL6jr0qsU8KbZCpVvw05unj0ZYzrnyebblFqqZRLYcHSsq/skeHxnIxLv3pK7i+hHRT3M6Z01KWhZa20u2UydWuREIwV0e9wlfjMVYy0+37mqspyHlOecmntbvpQ3xzYGUMO6QLdtGaXcV8PTW6tDnJVGHJSSQSlCFQ2uX0PPwDbSUdFIRibWTbv2+x11tW5SbWpaaLRpFMnJohtqUr3DvYQ7xbLplzOp6xKIRGgKwDhMAAAAAAAAAAAAAAAAAAAAACgrKAD5HuQpW87xZFjN2rFFImm2rjlPbKrB2w6a8bs+p8522rC5MmbNPsiy6HONlKzyXOlU7278CfdgPTXSbFlFXFdilT9fjHe4t/mnxGglSkxvNPMZK3buO9JUMQ2RpfyXlmeVdGWa3OSim8G8GeOaSKs/THia1pbgi101BvpahzomXIeDvQ4QDYeeJE7INdygt1OHatTnJ1ErblEkkql0UuTSqHilrSeeu3E1g3rLMTcNryU1xVwg2Kobqz3Jcjx4lWHuL80UOjsQkyZpfurG80298QVWbgtXOanjzlfEe1wFqhl7uYqzr56KpSteJTNM8sSg6SuiyHHpeAjJqO0zIuPoNvWxkKlK2nnNWqHjzUS5VzouPNXMc3DfiscSbi7o7XEhTqz6xOz8KNmbIxymUuK7+EEuhF3tST+MwjlLU1qEnMTKx1Yrt6oPd2J1RTzpzYPf6NOrtpVoLlcp5zl1Ve5Wx7ZKU90N1Mn67zu75MrHVqM71z+ht08lGTV0u5gSyNL2rrWrU1X9lq6pukW9Nt30zVQT7nwMmS5xz1X2miyZZMbgpVRu2fTHei2ozcVKj8Sk94mEpCEKUlENpR9Meh0ePfiQWs3abyTyj+BdipE9zCydH2l9StiGA7Dh62goMcZM6tvTBkKVd2KzI2lPuhyZuiN2dr9D4n/gSx73vlsqpyNxM6qbJLsqjuaer7046p9C9ddf8AiS6pyr20l2+6bp6f/mSZM7SDrusjUVKJtu5tmhX1BMN2TY7kzfqT2uc86z2PrypVkJtBVSlaormxb5UiLrI0SUuz6jK5twzWlWxNtm4PdSt7Zgp3wBtQ9WZXtW/L9zJ9amvuzJsUvK+7dsOhNuG4J1UrKJ4x4xj4whvdmTctalbjda2PkTknRPRK5Pzxi+37wunOFz23jrJuTJNU3s7KWzTdneNhuPcb2xjejrotvSaVKVDg1nDmtj5yi5Ptncw4bc4gf0f1Uwjj/RFaFNSqdviqOq03w5yl8pBlmm4Cw/TlQSnHNBdFMPGtkktb+vgZI4wgcR6UPOU23HO56m/UwVKl4lGL63p2xBX5TZmLGpiI+62TT2Rv+DwMFZA0XVCj7tcxNcToTaIcqVmvG/PExoJ4nOydTdcn5IreBx1zyqIUYo1QXjYdU+0jNkjONil2z2tqecr4yYdHrVPrsiupUubVNSru+pqm96JjvMWDLXy9R2onE9lqaU+1KgrwpiRlx7ki99Nd7ssPICHOornc2PkU/DJLO0q7G6nuZabdvCu2bfiJ7Q6PDviMIxOootdka9TU1alzKpqUereS1XgidvDwGZJ6v6Ww6NYLgAOEwAAAAAAAAAAAAAAAAAAAAAKCst7UAC21Jd4Q8wONqAOaQcgHzzbYIlmu2tyKlceHnGh0vwZAtbvE1s3P1u77bueq0SewFN7dNnHSaotruy6MYfoTx1w9bLme6ndy8V4dpsq5/JTvRdUncf0OyaicJbki3jZ9cFyUO1qNNVy4KpK06Qk07rnObwUqBrH1X66LpzjXYYI01InHSlTd2J1QlFc6o+p+BPLSuDesB1iVNUxk6eqVDt9zt/76w7IlP/syeemfRbizTfS1OoslCrXK9PCcrc2nnR9T6EuJTQwvWb1WkU9fkYAxloAu+0cNpjWbqbOXfH272BviE/Anr8M6k65jiejYOYJebStLthLXeOlPjJq7PRh0Y8e/CJi/LmAbOy3IcaknstTTDkVBMOckqzkfW/rZg5DEuQ31eO7nvKTXqTXpFVUok6mblHq4qcpvhO2iQJmrE1F6fJ509bD5yrUre392U5yW/oT1VF10VyUTFFz46S6bT41so7ZhD6Yg9v8AyT4TxEtP7R6RMvow4e5wLXS9+EIkRKjr54pbCmYzju+BLW1L/onimZe1MZkhCRtGhzlOlG+NdSlbSfn4iMe396Su4mqxHQjdJH5izvYOMpVnbJmUqFZR4qUV4VEcLftDKeqW5+7dzOdKW+hveb5JXqD3ONNG3S7cu4ssVyNQdDndgWyPDj8M33SVNPo8lR6emn0tSpSWRCClLVDxZNvKp+HuZqsdbzTt630lfY176w9AEy+lKybgaE4itUdPGbp+947Z8sn3y7oq6wSXrDZXDGoGb7n3BJ+05SqzfJ3o+hd75sW6auMOESGmrnq+bPzjvXvjnZt69fHRjw5NR9cS1cim8r0mR/uen+mpFKOh2Jlqf0XrW5HNU2HHiXIx6MI+A094/wBVeqbRfWk46zTas5XbfkuSlNQj4r+pznu+ElzjjrQNNt+zUrSapM163KhOu2IKqEnyYO9cniVLeJtK8XOC5DiZwPnlXdGYWlyY7qmq47p9BQJSnpd7hExdmfDFu5fofcqpJgqdTDjKTe130xMpfxjiHR4eCIS3ZK9uoq6rab2MdYcxj7FlnJtaFWbUYIbvbzU7RkD+LDvl846UIe6O59JTCFbSjkrKCsEwAAAAAAAAAAAAAAAALe7AAuAtsZDowLTZxCvLq/WdiJnsD6QfNCbl297iXd2ByY07guAt7sBuwALhbb4BuwOQDyVVxljm4Jnt1ZsihVB3ppuSS3959dIs61qEqCaNbtNk1eZMntHoizxhDwkkNb9wXdqA2oFve98ubsCMHION3o+cbvR840Gpaijj4YHmatj2z68zfrVr06cj8MnePTcYDeR/5jsalf6kJf3g8lTcZY7pjd+SsihSrfg5JMP/AKPTJlJdC+CUqV6o+v7Po+ctRb0STWZ7hVdCO0FWyXSzvw85d3ej5yPSSfkcg43YHJw6eXu6w7QvuluoV525Ta5KO8amflIOVH9Zg/7nxpTTckpdUvjJEpNSbd5KUzbtnj6kkwCRdpqvFIPnQhKVKShMNtKuUfWW92A6LIM8BGDkHG7AuAFAON2A3YAFwFBxuwALgLe70fOW0u3hoD6AAAAAAAAAACgAHjcmZItXE1k1S/rtnYSlKpid9zfSHsOlGP2P95rq63m8apTsfWhZ6JhyZWpzjnPgryuzDwFrG1PXW4SRObswRmz71kmdsp1makbErbrNt/e2ZNNP/DHfpjEkpiXVfkJX2xpsfJFcVO87tbZOcdvEj+qtw1Y+Qr2uC8btkk1BttJTCTlWp5MHO9024KV0Uq5KIKPY5LLowjfSVFFRSt8/P2q5NUGCJpT31TIVmNe7e529JpcTK0ldZVkyu3bSsV5Ttxt2Nqb+xylWpydmcV65Jsortq25dNMbSrmoknUJV6uamaTBqY/rMdY+0p4DxVc7bxsXHNNpNVd4Wph4r4jJt5ypeV1U8yba2TLq/Ar4jUV1i+bMxWRqLmqTZmTbkolPTJId2Wn1JyUm3VvgNKvWh97U/Pw/9NQd4SSl+Q6oteI2R6Gsk3Rk3TfbV1XpVXVGrO3kOmm+Fu1HhxJGQh34RIn9Wj+SjbPrp36Ylh7hh5L6dm23+ZKke7xIadZ9fl32JgmlVWy7oqVDm3V1CWvp7tl0YEy4fxSDXW7fk6Uv5eQS4aIdkVQHeIxV1Xuf8tZByDcNkX1e9XuGn9ze2obUZztbkxJ/ZfnZ6mYxuidkZhqZpVIe5LVeS7xrA6obv5xuD5Ch+82gZihxxNd8fNSJj6E1s6hSMtH0xH2/2RJnpGib+EVqSnKm2Rkc0345z3bKVKrznbp6X7e9cH+0WYPnqkePwD+UZYn9pE/TH6EkSUtBMPa6j0GYyScLpGzrqVEq3zQ79veuD/aLMHz1SCb21zuapCa5mBzXclKd6pG+jsUr/R1fqHYpX+jqMT/tCp/cx/7+haipoYK0t07ItG060NGT5mptuXsb3Tjag7enFGne7NSGoRN21WRTmi9VKTOOSlSq8433VeEIUueh8EfnRq/4y6h8sf8AOLnC+1YY131QQ2+RlBWQtbO0r/SrMDVO8S7eqRZm8m60qQps7PXhmCUUnxzXOqSdk3s2nJo+1ilchX4In9x2LKbIOVz5dLVeqKs8TpidNmBFM0qYS6xjUZjKpysLmuScvGi7vCblarznw/TeONvOHMpWrmrH1LyJaLtyQqieO0zwq+CNWPWeYTs/GeU6TdNpyMpTlXMmLpyUTyud5ySPVF1eediG5aVOPa1MlV+SS5ulUt46MkiNDqm6N2pNgABZc6CVcTx0Rryg0CNuubPvsB4OqdWpk/s1+se0qPts93z/ALzAHVk6rLiv5tWxXk66Jur1ZPtynTdQduudAi31hmd5jOOcm25b73Ootsu7mSak+WeYasir3/pjzHSq5VJGcpNVoDkzrpR3lkH6DT4dT7Rtt8xntd1j9D+7A5PJ49vWk5Ismk3xb7t6UrMmmcSerjx9w/PnRszpJoGOM3VCdp2JbwqlOe6VmkUecelqm7TUxgk1A6YNU2fJXPlnyE/lO46vT6lWESc5KVGpOnEuS42/6g/xJ3t8gTv0MTRNpw/KCsT+0kl9Mex4YQl9N28Z9udJP0NQ8Bh7UdqEtXTrjqbvi4JhTprZ2abKeWm3nusg35a2MLRql7XbVUydKpid5zmt8Box1PaiLw1T5P7qQROQpSXdjoNJV5IycJiJyTtZ7QStdsndp1Iatc+5PVSrYybdSahX5zZk6fSak6TSn5k3B6fsYVvFmOqfRbtvWsXRXG86o1GoTjXRa6Pm4mCur+0aS+B7Xhf16ySW3rWVd/vfycj0BMzjwgczuQS12xUjlB1Kp7l4rKCsxS0AAAAAACgrKACnowIf9Y7p7recMRKqlpSXa6/bbu2oSqPjkkwOj0uMS25UCWnbmk6Hr+DmkN5H59dPmonIul6+23FbMvx3vadSpM35Y2MY+62vCFfSuXvu16/bs/Hx0Ep7WmH98DNmZ9DunzOD21a5rQhT603/AFrSm9kdxIn3n1OEv0em2ZsHMTYJ8jKVenbv+Mn6k9YzI4TN9a5ykobTkdiX9ma19L9+QVL0DMVBU30VQf2OP+MZqp9SkalKqnqbMpmkthymqbuwj/eaTMmdXFqXxzKtqibdlLnkEq3Wtos3uuV+hieKwDqmzDpqudXcWuTkaVvffKiVDxLSF3DCLCZbjW6iLf5pv2NKfWk/lQTXyag284nybRMtY/ot/W+72nWZPfh3/FGofrRPyoJv5NQOEE7OR0klt+ImJoAzhh2ytMtv0K7cmWrRKqlz96Um6ulLVc4kr/Cj05/ntsr9sI//AE064i0F52zjZMpf9iooLqVOt2U9rnNk9t9yq1Tx/mNt/tg0buHxDntl1rmRJa42n/wo9Ovg9m+yv28kh11nWZMW5CwNTqRY2Rrars5CuodGVp1RTNt/UR1+5Vap4fzK2/2kY6znouzRp1tJV45HRR009052JPZJzeGMxGJRcVsu1OOa4zp1RX48rg+QofvNouZvxWXh8jTv0Jq66or8eVwfIUP3m0XM/wCKy8Pkad+hM/if9s/2/wBk1TwmgzC9cpdt5utSuVpyZSn0yvJfONb5HnG6eGufS1+emhfFtO//AA0cWna0/fl+U+zaY9KZqtVLsSWt8lvExIdUPqKj34XVZP8AvbvqT0HEVPHv2fWN05FVO78GwT+HTpT/AD10L/FPd4yzviTMvdD2M73kq53M7032SPHaNX/3IfUX/tTYn+9v+pJl6FNHda0vUutvuy5JSq1W4Io3lSEOSnZPG5GnjkK6DdS0lrvklTVv5Im/6q79x+citu2cg1B7uUpNY3nfPH6M67/I0/8A1R5+cy5k9syDVpLe2t6sPR/jG5wXEaN1IsgbmKH1i+j2SpEhJOyzBTVSiExV3HnfN6ktV7rI9JdPp7XyOR5yoOSr8FlKQ/ed88kjpTep2RU6bLVP2dHp7WqDtuNB8V3vXF53U0bKuRnyMW+dtB/6xUmpg96dWycj1RFXUxne6tYuY0ztsW7OxVs9io9KUnecbVNDWAJ3T7hGQty4f5aqbe6VSV6F0TVtnjS/m/RrcchdUvcjnU9zvalw0l2zwNhXV6av6pqDtufs7ID0/bfb6obzYfzxHpjRz3VxyvR+E6rk7qk0IwI065s7y+CcHVSqyT9qtVhPcymq+HJIObtKZ0omlDrF8++y/nJ1q0V+9b9p+0k7Xln+WPO8PY6btuPtBLaboo6rQHg6ezjnyn1atIc6lW+7unUmu8sSU617AUYytKzfb8j4j72VfZV4YeRM99XbgiOH8GStVqcvtVu7PvpObvkfQmf8v43pWWsdV+wq0lLU1mTiiMGw8UaNvOTGXhsdoObXRIK9U5n3ulRargm4J7nUv27R4N91HljZDw4x48T8+Fs1i6tLuoJU9zlVW06xsOT6ZBvox7d9JyDZtKvKgP3pSsSaZxPxEPFGO2W+sT2YdqO+DpdQn4k72+QJ36GJohwBOIpuc7Knp16Uqkq8hzmt8jzje9qC/Eve3yDO/QxPz7WxbVVvC6KfatFQnuhU5zsUnu8k2OC4hyWxJDcJS69tYs9ne8W2RZs85Vl0Z2yqKXfhj/TGderd0XcOyZ9ydS+b46g09qfB8Oa+4U6q4lyMqRvS1t6boFS3pyk1BPjtk3m6Zc+2Dn3HcpcVj7MoxKdmbpXHnSkfMS53XF0ITS8U/JEnrN1aZoUnlF0A/Pe/M1isAAAAAAAAAAoABaa7lF0ivrssXOt+YbmqHhF/Oc7eqSVO2nzafMk+0qh7NqQShS5DYcl0GF2MYQ85+fvHOonUXpkrrqTRq5WKG1LuE5SasrdT8y4lraHXCXVJyqpe+cTSVSb5V1PqPZIf843HcL20x0eZV9X9zaX3mwNJ/WZ0GzqFqQmvtYSlTZ2TQ+pKV5J5lu/Ot+vGs0tslj/FsnQ5tyfwqoTnbNr6Eh1alo5Z1QZUiqTTN1uv16b352ccnxJu8OYl2Lb6u5yggc3e8RtZ6rx1Udpap0J/d2Uzjux8fQkFutE/KgqHyag2x4HxZI4UxVb+OqY6Du5cpstd6Z3nNUPWkJenU1NQijaU6mo2fhiLh16X5xrvg66OkT56tH8k62fXP+mJW8PgSKXVo/km2z65/wBMSx9yJ5jLT+kW6fctq8Ra90g11uyf+7pSvl5BOqHggQa63BO9p1pXJ/18glwc/pJOpx3iI09UV+PK4PkKH7zaLmf8Vt4fI059Cau+qK/HdX/kGBs/zR+Ke8fkad+hiavEU65eP6f7IqvhNDenv8oyxP7SSX0x+hmHg4H5wbOu+YsPIFKvKSl1ObRal21Km+V2SbP3X7MHDh7GdofPvNbiPEW8m1UoKtVuz3Ns3GPmHGPmNTX3YTMX5q7V+ecXU9cVlODVb2K7Wcry20955+eGMjHdZoerUbT67/I09/VHn50av+Meb+WP+cb7sRZZpObMQyeRqZJOk1VmU32pd5I0DXNOdjvyqz3lU1h7/wDGNfhJM7jUyU7h+jS0/wDwvSv6oj9x3fR8BqKp3W5ZbplMlaWjGdqtVJp2d3ed9cXXdcJmKKm7GM7QU3yLW731xh/VwxkJdOhPFtXYlL1oVSt6T0yzcjVIp7XOziUyam+mIYdVB3U/hIO7H4nuO/eMFZs1E5h1Q3PKOvOedNtQ7Zk6TT08lP6E2PdWvpNreG6NOZSyLS4Slw15OxKSjY86Tk/NE9C5Xs2E2HTzkh8ztTM2tvN8vg/B1VqyJzarlYTGmU1W75dxoxp1ZfJ11VcihM21M321qpryxKnrHc/Ry/m1tq0Wf3qBaftJKvTP8sSq6t7SzbtJxE3ImQLWk6hULrbvyiqhJ72ygkxv1J4fx2+6OckTY3mkapTrWtSUnKqkUUq0EqSnZT97v+sPurWqD+g2h+zom1/2GsS/mxtr9kJHsM4k/Nna37HSZc53Ezz9IWvSt+5oMzbmG4843s2/btpVOk6pOJ2Xdz07O8bD+qgz5Cp0Kq4KuCc9uUz25Td3yqCT2eNL2M8nYwuC1aZY9Ip1QnJSLZOblJNKnJcaXcZ3rdOnvNNOuPi6UqttVLZnE+l9MayXp4gxzUqjTQq6SiTe/n78SV9/IM79CaJdOH5QVif2kkvpjdxkC76XkHTBcF4W+9TpSs2s+dRH40mkfTWl7tQVibKN7/SSS+mIeFp9PTtRJJb8sG2PW1opoeou3G3VaKEyl9U1PId/TPgXGrHDuX8p6TMqOnZOXnJSapruxViku5O8foFh4IELtc2iGl59o7b+sVCpS+qanehFP+sfjM/B5za/BXfFJM1Jn7AeebI1CWTKXxZk6tkGcqblWR50o7zGV+j0uMDQDgLO2S9JmT2zyZebUlLux12ku5W6bt8MZmsjOFiSl9WNU0zcnOK5qodLmpd6KJm53E+2t3Uc1SdS3eMklZb3YFwxS0AAAAAAAAAUHG1AuFABjLJGB8P5glYy+RrAo9a5XCDnI4uV+mI93B1WGlivtU+lyNeoSk+Sp9R3fp94mfxiW4xj5i1VyNtHhachUSQutrqpdLVFZv1KQuO41+hqNTjCH+BskmMfYfx1iSmdxcc2hTaHKcObCVTwa097DocfcKu8ctZG3YjrNI4TBZ2oRMRZe0y4RzXNSk9k2xZSsTUnDZS7ealsPmTMW3AbUCqlzU84JTw+MsV2Tia0pWyMf0ONIosk3dSjea2Co+fnd89yAdmdecgHmL3x7Z2R7dmrUvqhSdcpM5DnSk2ndgenONqAidOcAwniDSlgnB1dm7qxnZEKRUZ1PY3M7W50Ww/TRMrVygyFdo83RKoiDpScTsuV6WB20FwiPsOicl7WzrIIvt6uDR45zn+xXzXeN+/E79cXPucOjv8ANN/m879cSb4x8xzxj5i37jkPzZObUEXvucGjv803+bzv1xz9zg0d/mm/zed+uJQcPegOHvQHuOQ+WyR7MHiLDxvZ+MbSlLBsylxkqJIq2UysHNdtQMQVHq8tJVSmmz07izdc9281vdec+uJI7Rc+wIU23J5qYSbUEYPub2jz800P2xOfXF37m/o8/NL/AJvO/XEm+95/+A73n/4E3uNz82SPZUYpx7pvwhixyZ2xcZ25SJtKdntaZOG988ZKm6dLzko2SdDipydlh9pxtwgVXOc7vJKRoltAulKRrMLj9iqTdNb297am3u3fnmkhqfTJKmyKpGRl1JlUq2UqUrxR2XgBI2050aOkAArIwfN4TBGTtF2m7KdebdN84xlJyqv8dNpa5Lm/HsxM+g+1OajxcgY2tfCePLPx03FdBorFW05DkOkGTbm8p3h908XjLRnp0xNXVXfY2MZOTqyYcEzjXOm3K+Le8Bn0H1D2x8gHHT6MGQ4DagXCIGCcp6P9PuX6p9sV84yk5yqx7zZxTnSjm/Hsx752uJdOOIMCtn5jFlstonRqfj1QqT3qb/c5sTL0fB3in7CHA+5ttnpTPIHKvAXAD4AAAAAAAAAAAABQCsAFAKwAAAAAAAAAAAAAUFXCHmOQAAAAUArABQCsAFBWAAAAAAAACgrAAKCsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH//2Q==';
document.getElementById('brandLogo').src = COMPANY_LOGO;

/* ============================================================
   DELIVERY NOTE (Home dispatch details + Bag packing) — Print (A4 landscape) + Excel
   Columns: Sl.No, Item Code, Size, Type, Colour, Length, No of Coils, Total Quantity (Kg)
============================================================ */
const DN_HEADER=['Sl.No','Item Code','Size','Type','Colour','Length','No of Coils','Total Quantity (Kg)'];
function deliveryNoteSignatures(){
  const box=(t)=>`<div style="flex:1;text-align:center;"><div style="border-top:1.5px solid #000;margin:0 18px;padding-top:4px;font-size:12px;font-weight:700;">${t}</div></div>`;
  return `<div style="display:flex;gap:8px;margin-top:60px;break-inside:avoid;page-break-inside:avoid;">${box('Checked By')}${box('Driver / Transporter')}${box('Received By (Sign &amp; Stamp)')}</div>`;
}
function deliveryNoteSub(meta){
  return `DELIVERY NOTE<div style="font-size:12px;font-weight:400;margin-top:4px;">${meta}</div>`;
}
/* rows: [{itemCode,size,type,colour,length,coils,qty}] */
/* rows with a bagNo property (bag packing) get an extra "Bag No" column after Length */
function dnIsBag(rows){ return rows.length && rows[0].bagNo!==undefined; }
function dnHeader(rows,label){ if(!dnIsBag(rows)) return DN_HEADER; const h=[...DN_HEADER]; h.splice(6,0,label||'Bag No'); return h; }
function dnUnit(label){ return label==='Pallet No' ? 'pallet(s)' : 'bag(s)'; }
function dnBody(rows){ const bag=dnIsBag(rows); return rows.map((r,i)=>{ const a=[i+1,r.itemCode,r.size,r.type,r.colour,r.length]; if(bag) a.push(r.bagNo); a.push(r.coils,(+r.qty||0).toFixed(3)); return a; }); }
function dnTotals(rows){ return {coils:rows.reduce((s,r)=>s+(parseInt(r.coils)||0),0), qty:rows.reduce((s,r)=>s+(+r.qty||0),0)}; }
function dnSummary(rows,label){   // item code wise summary (bottom of every delivery note)
  const bag=dnIsBag(rows), g={};
  rows.forEach(r=>{ const k=r.itemCode||''; const o=g[k]=g[k]||{code:k,n:0,c:0,q:0}; o.n++; o.c+=(parseInt(r.coils)||0); o.q+=(+r.qty||0); });
  const list=Object.values(g).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  const t=dnTotals(rows), unit=(label==='Pallet No'?'Pallets':'Bags');
  const AVG='Avg Weight / Coil (Kg)', ac=(q,c)=>c>0?(q/c).toFixed(3):'—';
  const header=bag?['Item Code','No. of '+unit,'Total Coils','Total Quantity (Kg)',AVG]:['Item Code','Total Coils','Total Quantity (Kg)',AVG];
  const body=list.map(o=>bag?[o.code,o.n,o.c,o.q.toFixed(3),ac(o.q,o.c)]:[o.code,o.c,o.q.toFixed(3),ac(o.q,o.c)]);
  const total=bag?['Grand Total',rows.length,t.coils,t.qty.toFixed(3),ac(t.qty,t.coils)]:['Grand Total',t.coils,t.qty.toFixed(3),ac(t.qty,t.coils)];
  return {header,body,total};
}
function dnPrint(rows, meta, label){
  const t=dnTotals(rows), hdr=dnHeader(rows,label), bag=dnIsBag(rows);
  const body=dnBody(rows).map(r=>`<tr>${r.map((v,i)=>i===1?`<td class="itemcode">${esc(v)}</td>`:(bag&&i===6)?`<td><b>${esc(v)}</b></td>`:`<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const total=`<tr style="font-weight:700;background:#eaf0f8;page-break-inside:avoid;"><td colspan="${bag?7:6}">Total${bag?' — '+rows.length+' '+dnUnit(label):''}</td><td>${t.coils}</td><td>${t.qty.toFixed(3)}</td></tr>`;
  const table=`<table><thead><tr>${hdr.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${body}${total}</tbody></table>`;
  const sm=dnSummary(rows,label);
  const smRows=sm.body.map(r=>`<tr>${r.map((v,i)=>i===0?`<td class="itemcode">${esc(v)}</td>`:`<td>${esc(v)}</td>`).join('')}</tr>`).join('');
  const smTotal=`<tr style="font-weight:700;background:#eaf0f8;">${sm.total.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`;
  const summary=`<div style="break-inside:avoid;page-break-inside:avoid;margin-top:16px;"><div class="print-sub">Item Code Wise Summary</div><table style="width:80%;"><thead><tr>${sm.header.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${smRows}${smTotal}</tbody></table></div>`;
  const pageSt=document.createElement('style'); pageSt.setAttribute('data-keep-page','1');
  pageSt.textContent='@page{size:A4 landscape;margin:10mm;}'; document.head.appendChild(pageSt);
  printGeneric('Delivery Note', table+summary+deliveryNoteSignatures(), deliveryNoteSub(meta));
  setTimeout(()=>pageSt.remove(), 1600);
}
function dnExcel(rows, metaText, fileName, label){
  const t=dnTotals(rows), hdr=dnHeader(rows,label), bag=dnIsBag(rows);
  const totalRow=new Array(hdr.length).fill(''); totalRow[bag?6:5]=bag?('Total — '+rows.length+' '+dnUnit(label)):'Total'; totalRow[hdr.length-2]=t.coils; totalRow[hdr.length-1]=+t.qty.toFixed(3);
  const ws=buildHeaderedSheet('DELIVERY NOTE — '+metaText, hdr, [...dnBody(rows),totalRow]);
  ws['!cols']=(bag?[7,26,10,16,14,14,10,13,20]:[7,26,10,16,14,14,13,20]).map(w=>({wch:w}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Delivery Note');
  const sm=dnSummary(rows,label);
  const ws2=buildHeaderedSheet('Item Code Wise Summary — '+metaText, sm.header, [...sm.body,sm.total]);
  ws2['!cols']=sm.header.map((h,i)=>({wch:i===0?26:20}));
  XLSX.utils.book_append_sheet(wb, ws2, 'Summary');
  XLSX.writeFile(wb, fileName); toast('Delivery Note Excel exported');
}
function dnPDF(rows, metaText, fileName, label){
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({orientation:'landscape'});
  const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight();
  const t=dnTotals(rows), hdr=dnHeader(rows,label), bag=dnIsBag(rows);
  const y0=pdfHead(doc,'DELIVERY NOTE',metaText);
  const body=dnBody(rows).map(r=>r.map(v=>dashPdfSan(v)));
  body.push([{content:'Total'+(bag?' - '+rows.length+' '+dnUnit(label):''),colSpan:bag?7:6,styles:{halign:'right'}},String(t.coils),t.qty.toFixed(3)]);
  pdfTable(doc,y0,[hdr],body,{totalRows:1,fontSize:9});
  // item code wise summary at the bottom
  const sm=dnSummary(rows,label);
  let y=doc.lastAutoTable.finalY+10;
  if(y>PH-55){ doc.addPage(); y=16; }
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(15,61,62);
  doc.text('Item Code Wise Summary',PW/2,y,{align:'center'}); doc.setTextColor(0);
  const sw=bag?210:170;
  pdfTable(doc,y+3,[sm.header],[...sm.body.map(r=>r.map(v=>dashPdfSan(v))),sm.total],{totalRows:1,fontSize:9.5,extra:{tableWidth:sw,margin:{left:(PW-sw)/2,right:(PW-sw)/2,bottom:14}}});
  // signature lines
  let sy=doc.lastAutoTable.finalY+26;
  if(sy>PH-16){ doc.addPage(); sy=40; }
  const labels=['Checked By','Driver / Transporter','Received By (Sign & Stamp)'], w=(PW-20)/3;
  labels.forEach((l,i)=>{ const cx=10+w*i+w/2; doc.setDrawColor(0); doc.setLineWidth(.4); doc.line(cx-w/2+10,sy,cx+w/2-10,sy); doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(0); doc.text(l,cx,sy+5,{align:'center'}); });
  pdfFoot(doc);
  doc.save(fileName); toast('Delivery Note PDF exported');
}

/* ---- Home page ---- */
function homeDNData(){
  const date=document.getElementById('home_dispatchDate')?.value||'';
  if(!date){ toast('Select a date first for the Delivery Note'); return null; }
  const {rows}=homeDispatchSelectedData();
  if(!rows.length){ toast('No dispatch data for this date'); return null; }
  const nos=homeDispatchNos(date, rows);
  const to=[...new Set([...rows.flatMap(g=>g.rem||[]), ...rows.map(g=>g.customer)].filter(Boolean))].join(' / ');
  const out=rows.map(g=>({itemCode:g.itemCode,size:g.size+'mm',type:g.product,colour:g.colour,length:g.lengthQty+' '+g.lengthUnit,coils:g.coils,qty:g.totalWt}));
  return {date,nos,to,rows:out};
}
function homeDNMeta(d,html){ const b=x=>html?`<b>${esc(x)}</b>`:x; return 'Date: '+b(d.date)+(d.nos?(html?' &nbsp;|&nbsp; ':' | ')+'Dispatch No.: '+b(d.nos):'')+(d.to?(html?' &nbsp;|&nbsp; ':' | ')+'To: '+b(d.to):''); }
function printHomeDeliveryNote(){ const d=homeDNData(); if(!d) return; dnPrint(d.rows, homeDNMeta(d,true)); }
function exportHomeDeliveryNoteExcel(){ const d=homeDNData(); if(!d) return; dnExcel(d.rows, homeDNMeta(d,false), 'Delivery_Note_'+d.date+'.xlsx'); }
function exportHomeDeliveryNotePDF(){ const d=homeDNData(); if(!d) return; dnPDF(d.rows, homeDNMeta(d,false), 'Delivery_Note_'+d.date+'.pdf'); }

/* ---- Bag packing ---- */
function bagDNRows(list){   // one row per bag, with Bag No and coils per bag
  const coils=loadCoils();
  return list.slice().sort(bagCmp).map(b=>{
    const info=coils.find(c=>c.itemCode===b.itemCode)||{};
    return {itemCode:b.itemCode, size:b.ropeSize||(info.size?info.size+'mm':''), type:info.product||'', colour:b.colour||info.colour||'',
      length:bagLen(b)==='—'?'':bagLen(b), bagNo:b.bagNo, coils:(b.coils===''||b.coils==null)?'':b.coils, qty:+b.qty||0};
  });
}
function printBagPackingDate(date){ printBagPacking(date,bagDNListByDate(date)); }
function exportBagPackingPDFDate(date){ exportBagPackingPDF(date,bagDNListByDate(date)); }
function exportBagPackingExcelDate(date){ exportBagPackingExcel(date,bagDNListByDate(date)); }
function bagSummaryHTML(list){
  const g={}; list.forEach(b=>{ const o=g[b.itemCode]=g[b.itemCode]||{code:b.itemCode,n:0,c:0,q:0}; o.n++; o.c+=(parseInt(b.coils)||0); o.q+=(+b.qty||0); });
  const arr=Object.values(g).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  const tn=list.length, tc=list.reduce((s,b)=>s+(parseInt(b.coils)||0),0), tq=list.reduce((s,b)=>s+(+b.qty||0),0);
  const rows=arr.map(o=>`<tr><td class="itemcode">${bagEsc(o.code)}</td><td>${o.n}</td><td>${o.c}</td><td>${o.q.toFixed(3)}</td><td>${(o.q/o.n).toFixed(3)}</td><td>${bagAvgCoil(o.q,o.c)}</td></tr>`).join('');
  return `<div style="font-weight:700;font-size:13px;color:var(--navy);margin:-4px 0 4px;">Item Code Wise Summary</div><div class="table-wrap" style="margin-bottom:18px;max-width:760px;"><table><thead><tr><th>Item Code</th><th>No. of Bags</th><th>Total Coils</th><th>Total Quantity (Kg)</th><th>Avg Weight / Bag (Kg)</th><th>Avg Weight / Coil (Kg)</th></tr></thead><tbody>${rows}<tr style="font-weight:700;background:#eaf0f8;"><td>Grand Total</td><td>${tn}</td><td>${tc}</td><td>${tq.toFixed(3)}</td><td>${tn?(tq/tn).toFixed(3):'0.000'}</td><td>${bagAvgCoil(tq,tc)}</td></tr></tbody></table></div>`;
}
function bagDNListByDate(date){   // ticked bags of that date, else all
  const ticked=new Set([...document.querySelectorAll('.bpRowChk:checked')].filter(c=>c.dataset.date===date).map(c=>c.dataset.id));
  let list=loadManualBags().filter(b=>b.date===date).sort(bagCmp);
  if(ticked.size) list=list.filter(b=>ticked.has(b.id));
  return list;
}
function bagDNRun(date,list,mode,label){
  label = label==='Pallet No' ? 'Pallet No' : 'Bag No';
  if(!list.length){ toast('No bags to print'); return; }
  const rows=bagDNRows(list), n=list.length, u=dnUnit(label), title=(label==='Pallet No'?'Pallet Packing':'Bag Packing'), dn=bagDispNos(list);
  if(mode==='print') dnPrint(rows,title+' — Date: <b>'+bagEsc(date)+'</b> &nbsp;|&nbsp; '+n+' '+u+(dn?' &nbsp;|&nbsp; Dispatch No.: <b>'+bagEsc(dn)+'</b>':''), label);
  else if(mode==='pdf') dnPDF(rows,title+' - Date: '+date+' | '+n+' '+u+(dn?' | Dispatch No.: '+dn:''),'Delivery_Note_'+(label==='Pallet No'?'PalletNoWise_':'BagNoWise_')+date+'.pdf', label);
  else dnExcel(rows,title+' — Date: '+date+' | '+n+' '+u+(dn?' | Dispatch No.: '+dn:''),'Delivery_Note_'+(label==='Pallet No'?'PalletNoWise_':'BagNoWise_')+date+'.xlsx', label);
}
function printBagDeliveryNote(date,label){ bagDNRun(date,bagDNListByDate(date),'print',label); }
function exportBagDeliveryNoteExcel(date,label){ bagDNRun(date,bagDNListByDate(date),'excel',label); }
function exportBagDeliveryNotePDF(date,label){ bagDNRun(date,bagDNListByDate(date),'pdf',label); }
function exportBagDeliveryNoteSelectedPDF(label){ const d=bagPackingData(); if(!d){ toast('No bags to export for the selected day'); return; } bagDNRun(d.date,d.list,'pdf',label); }
function printBagDeliveryNoteSelected(label){ const d=bagPackingData(); if(!d){ toast('No bags to print for the selected day'); return; } bagDNRun(d.date,d.list,'print',label); }
function exportBagDeliveryNoteSelectedExcel(label){ const d=bagPackingData(); if(!d){ toast('No bags to export for the selected day'); return; } bagDNRun(d.date,d.list,'excel',label); }


/* ============================================================
   CUSTOMER NAME / CODE  +  CUSTOMER WISE DISPATCH
============================================================ */
function customerOf(c,d){ const v=(c&&c.customer!==undefined&&c.customer!==null)?c.customer:(d&&d.customer); return (v==null?'':String(v)).trim(); }
function encC(v){ return encodeURIComponent(v||'').replace(/'/g,'%27'); }
function dispatchMap(){ const m={}; loadDispatches().forEach(d=>m[d.id]=d); return m; }
function allCustomers(){
  const set=new Set();
  loadCoils().forEach(c=>{ if(c.customer) set.add(String(c.customer).trim()); });
  loadDispatches().forEach(d=>{ if(d.customer) set.add(String(d.customer).trim()); });
  return [...set].filter(Boolean).sort((a,b)=>a.localeCompare(b));
}
function refreshCustomerList(){
  const dl=document.getElementById('customerList');
  if(dl) dl.innerHTML=allCustomers().map(n=>'<option value="'+esc(n)+'"></option>').join('');
}

/* --- Edit a day / item code group: pick coils, move them to a customer (and/or another date) --- */
function editDispatchGroup(itemCode, date, custEnc){
  const matching=groupCoils(itemCode,date,custEnc);
  if(!matching.length){ toast('No matching coils found'); return; }
  const cur=custEnc!==undefined?decodeURIComponent(custEnc):'';
  const old=document.getElementById('editDispModal'); if(old) old.remove();
  const m=document.createElement('div');
  m.id='editDispModal'; m.className='no-print';
  m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;';
  m.innerHTML=`<div style="background:#fff;border-radius:10px;padding:18px 20px;width:380px;max-width:94vw;max-height:92vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.3);">
    <h3 style="margin:0 0 2px;">Edit / Segregate — ${esc(itemCode)}</h3>
    <div class="muted" style="margin-bottom:10px;">${esc(date)} • current customer: <b>${esc(cur||'(none)')}</b></div>
    <div class="field" style="margin-bottom:8px;"><label>Move selected coils to Customer Name / Code</label>
      <input type="text" id="ed_cust" list="customerList" value="${esc(cur)}" placeholder="e.g. ABC Trading / C-101" style="width:100%;box-sizing:border-box;"></div>
    <div class="field" style="margin-bottom:8px;"><label>Dispatch Date</label><input type="date" id="ed_date" value="${esc(date)}"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin:6px 0 4px;">
      <strong style="font-size:13px;">Select coils (<span id="ed_cnt">${matching.length}</span> of ${matching.length})</strong>
      <span><button class="btn outline sm" id="ed_all">All</button> <button class="btn outline sm" id="ed_none">None</button></span></div>
    <div style="max-height:200px;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:4px 8px;">
      ${matching.map(c=>`<label style="display:flex;align-items:center;gap:6px;font-size:12.5px;padding:2px 0;"><input type="checkbox" class="edCoil" value="${c.id}" checked> ${esc(c.serial)} <span class="muted">${(+c.weight||0).toFixed(3)} kg</span></label>`).join('')}
    </div>
    <datalist id="customerList"></datalist>
    <p class="muted" style="font-size:12px;margin:8px 0 0;">Only the ticked coils move. The rest stay with the current customer, so one item code can be split between two or more customers on the same day.</p>
    <div class="row" style="margin-top:12px;justify-content:flex-end;gap:8px;">
      <button class="btn outline sm" id="ed_cancel">Cancel</button>
      <button class="btn amber sm" id="ed_save">Save</button></div></div>`;
  document.body.appendChild(m);
  refreshCustomerList();
  const upd=()=>{ document.getElementById('ed_cnt').textContent=m.querySelectorAll('.edCoil:checked').length; };
  m.querySelectorAll('.edCoil').forEach(x=>x.onchange=upd);
  document.getElementById('ed_all').onclick=()=>{ m.querySelectorAll('.edCoil').forEach(x=>x.checked=true); upd(); };
  document.getElementById('ed_none').onclick=()=>{ m.querySelectorAll('.edCoil').forEach(x=>x.checked=false); upd(); };
  document.getElementById('ed_cancel').onclick=()=>m.remove();
  document.getElementById('ed_save').onclick=()=>{
    const ids=[...m.querySelectorAll('.edCoil:checked')].map(x=>x.value);
    const nd=document.getElementById('ed_date').value, nc=document.getElementById('ed_cust').value.trim();
    if(!ids.length){ alert('Select at least one coil.'); return; }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(nd)){ alert('Please select a valid date.'); return; }
    m.remove();
    applyEditDispatchGroup(ids,date,nd,nc,cur);
  };
}
function applyEditDispatchGroup(ids,date,newDate,newCust,curCust){
  let coils=loadCoils();
  if(newDate===date){
    if(newCust===curCust){ toast('No change made'); return; }
    coils=coils.map(c=>ids.includes(c.id)?{...c,customer:newCust}:c);
    saveCoils(coils); toast(ids.length+' coil(s) moved to '+(newCust||'(no customer)')); refreshDispatchViews(); return;
  }
  const newDispatchId='D'+Date.now();
  coils=coils.map(c=>ids.includes(c.id)?{...c,dispatchDate:newDate,dispatchId:newDispatchId,customer:newCust}:c);
  saveCoils(coils);
  removeCoilsFromBags(ids);
  let dispatches=loadDispatches().map(d=>({...d,coilIds:d.coilIds.filter(id=>!ids.includes(id))})).filter(d=>d.coilIds.length>0);
  dispatches.push({id:newDispatchId,date:newDate,coilIds:ids,remarks:'Date edited from '+date,customer:newCust,createdAt:new Date().toISOString()});
  saveDispatches(dispatches);
  toast(ids.length+' coil(s) updated'+(newCust?(' — customer: '+newCust):''));
  refreshDispatchViews();
}

/* --- Customer wise dispatch page --- */
function customerWiseData(){
  const cust=document.getElementById('cw_customer')?.value||'';
  const from=document.getElementById('cw_from')?.value||'', to=document.getElementById('cw_to')?.value||'';
  const coils=loadCoils(), NO='(No Customer)';
  const map={};
  loadDispatches().filter(d=>(!from||d.date>=from)&&(!to||d.date<=to)).forEach(d=>{
    d.coilIds.forEach(id=>{
      const c=coils.find(x=>x.id===id); if(!c||c.status!=='dispatched') return;
      const cu=customerOf(c,d)||NO;
      if(cust && cu!==cust) return;
      const cg=map[cu]=map[cu]||{name:cu,items:{},days:{},coils:0,wt:0};
      const dk=d.date+'||'+c.itemCode;
      const dg=cg.days[dk]=cg.days[dk]||{date:d.date,itemCode:c.itemCode,product:c.product,colour:c.colour,size:c.size,coils:0,wt:0,nos:new Set()};
      dg.coils++; dg.wt+=(+c.weight||0); if(dNo(d)) dg.nos.add(String(dNo(d)));
      const g=cg.items[c.itemCode]=cg.items[c.itemCode]||{itemCode:c.itemCode,product:c.product,colour:c.colour,size:c.size,coils:0,wt:0};
      g.coils++; g.wt+=(+c.weight||0); cg.coils++; cg.wt+=(+c.weight||0);
    });
  });
  const groups=Object.values(map).sort((a,b)=>a.name===NO?1:b.name===NO?-1:a.name.localeCompare(b.name)).map(cg=>({...cg,list:Object.values(cg.items).sort((a,b)=>a.itemCode.localeCompare(b.itemCode)),
    dayList:Object.values(cg.days).map(x=>({...x,nos:[...x.nos].join(', ')})).sort((a,b)=>a.date.localeCompare(b.date)||a.itemCode.localeCompare(b.itemCode))}));
  const period=(from||to)?((from||'start')+' to '+(to||'today')):'All Dates';
  return {groups, gc:groups.reduce((t,g)=>t+g.coils,0), gw:groups.reduce((t,g)=>t+g.wt,0), cust, period};
}
function renderCustomerDispatch(){
  const sel=document.getElementById('cw_customer'); if(!sel) return;
  const keep=sel.value;
  const names=allCustomers();
  sel.innerHTML='<option value="">All Customers</option>'+names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join('')+'<option value="(No Customer)">(No Customer)</option>';
  sel.value=[...sel.options].some(o=>o.value===keep)?keep:'';
  const d=customerWiseData(), host=document.getElementById('cw_host');
  if(!d.groups.length){ host.innerHTML='<div class="empty">No dispatches found'+(d.cust?(' for '+esc(d.cust)):'')+' ('+esc(d.period)+').</div>'; return; }
  host.innerHTML=d.groups.map(g=>`<div class="group-block"><div class="group-head" onclick="this.nextElementSibling.classList.toggle('collapsed')"><span>👤 ${esc(g.name)}</span><span class="meta">${g.coils} coil(s) • ${g.wt.toFixed(3)} kg</span></div>
    <div class="group-body"><table><thead><tr><th>Sl.No</th><th>Item Code</th><th>Type</th><th>Colour</th><th>Size</th><th>No. of Coils</th><th>Total Quantity (Kg)</th></tr></thead><tbody>
    ${g.list.map((x,i)=>`<tr><td>${i+1}</td><td class="itemcode">${esc(x.itemCode)}</td><td>${esc(x.product)}</td><td>${esc(x.colour)}</td><td>${esc(x.size)}mm</td><td>${x.coils}</td><td>${x.wt.toFixed(3)}</td></tr>`).join('')}
    <tr style="font-weight:700;background:#eaf0f8;"><td colspan="5">Total — ${esc(g.name)}</td><td>${g.coils}</td><td>${g.wt.toFixed(3)}</td></tr></tbody></table></div></div>`).join('')
    +(d.groups.length>1?`<div style="font-weight:700;padding:10px 4px;">Grand Total: ${d.gc} coil(s) • ${d.gw.toFixed(3)} kg</div>`:'');
}
function printCustomerDispatch(){
  const d=customerWiseData();
  if(!d.groups.length){ toast('No data to print'); return; }
  const html=d.groups.map(g=>`<div class="print-sub" style="text-align:left;margin-top:14px;">Customer: ${esc(g.name)}</div>
    <table><thead><tr><th>Sl.No</th><th>Date</th><th>Dispatch No.</th><th>Item Code</th><th>Type</th><th>Colour</th><th>Size</th><th>No. of Coils</th><th>Total Quantity (Kg)</th></tr></thead><tbody>
    ${g.dayList.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.date)}</td><td>${esc(x.nos)}</td><td class="itemcode">${esc(x.itemCode)}</td><td>${esc(x.product)}</td><td>${esc(x.colour)}</td><td>${esc(x.size)}mm</td><td>${x.coils}</td><td>${x.wt.toFixed(3)}</td></tr>`).join('')}
    <tr style="font-weight:700;background:#eaf0f8;page-break-inside:avoid;"><td colspan="7">Total — ${esc(g.name)}</td><td>${g.coils}</td><td>${g.wt.toFixed(3)}</td></tr></tbody></table>`).join('')
    +(d.groups.length>1?`<div style="font-weight:700;margin-top:14px;">Grand Total: ${d.gc} coil(s) &nbsp;|&nbsp; ${d.gw.toFixed(3)} kg</div>`:'');
  printGeneric('Customer Wise Dispatch List', html, 'Customer Wise Dispatch List (Date Wise) — '+d.period);
}
function exportCustomerDispatchPDF(){
  const d=customerWiseData();
  if(!d.groups.length){ toast('No data to export'); return; }
  const { jsPDF } = window.jspdf; const doc=new jsPDF({orientation:'landscape'});
  const PH=doc.internal.pageSize.getHeight();
  let y=pdfHead(doc,'Customer Wise Dispatch List (Date Wise) - '+d.period,'Date: '+todayStr());
  d.groups.forEach(g=>{
    if(y>PH-45){ doc.addPage(); y=16; }
    doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(15,61,62); doc.text('Customer: '+dashPdfSan(g.name),14,y+3); doc.setTextColor(0); y+=6;
    const body=g.dayList.map((x,i)=>[i+1,x.date,dashPdfSan(x.nos),dashPdfSan(x.itemCode),dashPdfSan(x.product),dashPdfSan(x.colour),dashPdfSan(x.size)+'mm',x.coils,x.wt.toFixed(3)]);
    body.push(['','Total','','','','','',g.coils,g.wt.toFixed(3)]);
    pdfTable(doc,y,[['Sl.No','Date','Dispatch No.','Item Code','Type','Colour','Size','No. of Coils','Total Quantity (Kg)']],body,{totalLast:true});
    y=doc.lastAutoTable.finalY+8;
  });
  if(d.groups.length>1){ if(y>PH-20){ doc.addPage(); y=16; } doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text('Grand Total: '+d.gc+' coil(s)  |  '+d.gw.toFixed(3)+' kg',14,y); }
  pdfFoot(doc);
  doc.save('Customer_Wise_Dispatch_'+todayStr()+'.pdf'); toast('PDF exported');
}
function exportCustomerDispatchExcel(){
  const d=customerWiseData();
  if(!d.groups.length){ toast('No data to export'); return; }
  const out=[];
  d.groups.forEach(g=>{ g.list.forEach(x=>out.push([g.name,x.itemCode,x.product,x.colour,x.size,x.coils,+x.wt.toFixed(3)])); });
  out.push(['Grand Total','','','','',d.gc,+d.gw.toFixed(3)]);
  xlSave(out,['Customer','Item Code','Type','Colour','Size (mm)','No. of Coils','Total Quantity (Kg)'],'Customer Wise','Customer_Wise_Dispatch_'+todayStr()+'.xlsx',[24,32,12,14,10,12,18]);
  toast('Excel exported');
}

/* ============================================================
   EXCEL IMPORT / EXPORT — Dispatch List page + Bag Packing page
============================================================ */
function xlKey(k){ return String(k==null?'':k).toLowerCase().replace(/[^a-z0-9]/g,''); }
function xlPick(row, aliases){ for(const a of aliases){ if(row[a]!==undefined && row[a]!=='') return row[a]; } return ''; }
/* read first sheet; locate header row by required keys; return array of {normalizedHeader: value} */
function xlReadRows(wb, sheetName, required){
  const ws=wb.Sheets[sheetName||wb.SheetNames[0]]; if(!ws) return [];
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:'',cellDates:true});
  let hi=-1;
  for(let i=0;i<Math.min(aoa.length,15);i++){ const ks=aoa[i].map(xlKey); if(required.every(r=>ks.includes(r))){ hi=i; break; } }
  if(hi<0) return null;
  const keys=aoa[hi].map(xlKey);
  return aoa.slice(hi+1).filter(r=>r.some(v=>v!=='')).map(r=>{ const o={}; keys.forEach((k,i)=>{ if(k && o[k]===undefined) o[k]=r[i]; }); return o; });
}
function xlDate(v){
  if(v instanceof Date && !isNaN(v)){ const d=new Date(v.getTime()+12*3600*1000); return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0'); }
  if(typeof v==='number' && v>20000 && v<80000){ const c=XLSX.SSF.parse_date_code(v); if(c) return c.y+'-'+String(c.m).padStart(2,'0')+'-'+String(c.d).padStart(2,'0'); }
  const t=String(v||'').trim(); if(!t) return '';
  let m=t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/); if(m) return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  m=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/); if(m) return m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return '';
}
function xlNum(v){ const n=parseFloat(String(v==null?'':v).replace(/[^0-9.\-]/g,'')); return isNaN(n)?NaN:n; }
function xlSave(rows, header, sheet, file, widths){
  const ws=XLSX.utils.aoa_to_sheet([header,...rows]);
  ws['!cols']=(widths||header.map(()=>16)).map(w=>({wch:w}));
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, sheet); XLSX.writeFile(wb, file);
}

/* ---------------- BAG PACKING ---------------- */
const BAG_XL_HEADER=['Date','Item Code','Colour','Bag No','No of Coils','Total Quantity (Kg)','Rope Size','Length','Length Unit','Dispatch No'];
function exportBagImportExcel(){
  const fd=document.getElementById('bp_filterDate')?.value||'';
  const list=loadManualBags().filter(b=>!fd||b.date===fd).sort((a,b)=>String(a.date).localeCompare(b.date)||bagCmp(a,b));
  if(!list.length){ toast('No bags to export'); return; }
  xlSave(list.map(b=>[b.date,b.itemCode,b.colour,b.bagNo,b.coils===''?'':+b.coils,+(+b.qty||0).toFixed(3),b.ropeSize,b.length===''?'':+b.length,b.lengthUnit||'',b.dispatchNo||'']),
    BAG_XL_HEADER,'BagPacking','Bag_Packing_'+(fd||todayStr())+'.xlsx',[12,26,14,9,12,18,11,10,12,16]);
  toast('Excel exported ('+list.length+' bags)');
}
function downloadBagTemplate(){
  xlSave([[todayStr(),'PE-RP-WHT-8MM-MED-NT-220YARDS','White','1',5,25.5,'8 mm',220,'Yards','DN-001']],BAG_XL_HEADER,'BagPacking','Bag_Packing_Template.xlsx',[12,32,14,9,12,18,11,10,12,16]);
}
function importBagExcel(evt){
  const file=evt.target.files[0]; if(!file) return;
  if(window.PPC) PPC.keepFiles([file],'stock');
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});
      const rows=xlReadRows(wb,null,['itemcode','bagno']);
      if(!rows){ alert('Could not find the columns "Item Code" and "Bag No" in the first sheet. Use the Export or Template file format.'); return; }
      const bags=loadManualBags(); let added=0, dup=0, bad=0;
      const exists=new Set(bags.map(b=>[b.date,b.itemCode,String(b.bagNo)].join('|')));
      const newColours=new Set();
      rows.forEach(r=>{
        const date=xlDate(xlPick(r,['date','bagdate']))||todayStr();
        const itemCode=String(xlPick(r,['itemcode'])).trim();
        const bagNo=String(xlPick(r,['bagno','bagnumber'])).trim();
        const qty=xlNum(xlPick(r,['totalquantitykg','totalquantity','quantity','qty','weight','weightkg']));
        if(!itemCode||!bagNo||isNaN(qty)){ bad++; return; }
        const key=[date,itemCode,bagNo].join('|'); if(exists.has(key)){ dup++; return; } exists.add(key);
        const coilsN=xlNum(xlPick(r,['noofcoils','coils','nooofcoils']));
        let rope=String(xlPick(r,['ropesize','size'])).trim(); const m=rope.match(/^(\d+(\.\d+)?)\s*(mm)?$/i); if(m) rope=m[1]+' mm';
        const lenN=xlNum(xlPick(r,['length','lengthqty']));
        let unit=String(xlPick(r,['lengthunit','unit'])).trim(); unit=/^m/i.test(unit)?'Meters':'Yards';
        const colour=String(xlPick(r,['colour','color'])).trim();
        const dispatchNo=String(xlPick(r,['dispatchno','dispatchnumber'])).trim();
        if(colour && !colours.some(c=>c.toLowerCase()===colour.toLowerCase())) newColours.add(colour);
        bags.push({id:'MB'+Date.now()+Math.floor(Math.random()*100000)+added, date,itemCode,colour,bagNo,coils:isNaN(coilsN)?'':Math.round(coilsN),qty,ropeSize:rope,length:isNaN(lenN)?'':lenN,lengthUnit:unit,dispatchNo});
        added++;
      });
      if(!added){ alert('Nothing imported. '+dup+' duplicate row(s) skipped, '+bad+' invalid row(s) skipped.\nRequired per row: Item Code, Bag No, Total Quantity.'); return; }
      if(!confirm('Import '+added+' bag(s) from the file?\n('+dup+' duplicate(s) skipped, '+bad+' invalid row(s) skipped)\nExisting bags are kept — new bags are added.')) return;
      if(newColours.size){ newColours.forEach(c=>colours.push(c)); saveList(LS.colours, colours); }
      saveManualBags(bags); renderBagPacking();
      toast('Imported '+added+' bag(s)');
    }catch(err){ alert('Import failed: '+err.message); }
  };
  reader.readAsArrayBuffer(file); evt.target.value='';
}

/* ---------------- DISPATCH LIST ---------------- */
const DISP_XL_HEADER=['Dispatch No','Dispatch Date','Remarks','Serial','Item Code','Resin','Type','Colour','Size (mm)','Construction','Tracer','Length','Length Unit','Weight (Kg)','Customer'];
function exportDispatchImportExcel(){
  const fd=document.getElementById('dl_dateFilter')?.value||'';
  const coils=loadCoils(); const out=[];
  loadDispatches().filter(d=>!fd||d.date===fd).sort((a,b)=>String(a.date).localeCompare(b.date)).forEach(d=>{
    d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(c=>c&&c.status==='dispatched').sort((a,b)=>String(a.serial).localeCompare(String(b.serial),undefined,{numeric:true})).forEach(c=>{
      out.push([dNo(d),d.date,d.remarks||'',c.serial,c.itemCode,c.resin||'',c.product||'',c.colour||'',c.size,c.construction||'',c.tracer||'',c.quantity,c.lengthUnit||'',+(+c.weight||0).toFixed(3),customerOf(c,d)]);
    });
  });
  if(!out.length){ toast('No dispatch rows to export'); return; }
  xlSave(out,DISP_XL_HEADER,'Dispatches','Dispatch_Data_'+(fd||todayStr())+'.xlsx',[13,13,22,30,32,10,12,14,10,13,14,9,11,12,20]);
  toast('Excel exported ('+out.length+' coils)');
}
function downloadDispatchTemplate(){
  xlSave([['DN-001',todayStr(),'Customer / vehicle','PE-RP-WHT-8MM-MED-NT-220YARDS-0001','PE-RP-WHT-8MM-MED-NT-220YARDS','PE','RP','White',8,'Medium','Without Tracer',220,'Yards',25.5,'Customer A']],
    DISP_XL_HEADER,'Dispatches','Dispatch_Template.xlsx',[13,13,22,36,32,10,12,14,10,13,14,9,11,12,20]);
}
function memSerial(list, itemCode){   // lowest unused serial number for this item code, using the in-memory list
  const used=new Set(); list.forEach(c=>{ if(c.itemCode!==itemCode||!c.serial) return; const n=parseInt(String(c.serial).split('-').pop(),10); if(!isNaN(n)) used.add(n); });
  let n=1; while(used.has(n)) n++; return itemCode+'-'+String(n).padStart(4,'0');
}
function importDispatchExcel(evt){
  const file=evt.target.files[0]; if(!file) return;
  if(window.PPC) PPC.keepFiles([file],'stock');
  const reader=new FileReader();
  reader.onload=function(e){
    try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:true});
      const rows=xlReadRows(wb,null,['dispatchno','itemcode']);
      if(!rows){ alert('Could not find the columns "Dispatch No" and "Item Code" in the first sheet. Use the Export or Template file format.'); return; }
      importDispatchRows(rows);
    }catch(err){ alert('Import failed: '+err.message); }
  };
  reader.readAsArrayBuffer(file); evt.target.value='';
}
function clearAllDispatches(){
  const dispatches=loadDispatches(), coils=loadCoils();
  if(!dispatches.length){ toast('Dispatch list is already empty'); return; }
  const ids=new Set(); dispatches.forEach(d=>d.coilIds.forEach(id=>ids.add(id)));
  const del=coils.filter(c=>ids.has(c.id) && c.status==='dispatched');
  if(!confirm('CLEAR ALL dispatch data?\n\n• '+dispatches.length+' dispatch(es)\n• '+del.length+' dispatched coil(s) will be permanently deleted\n\nThis cannot be undone. Export Excel / PDF first if you need a backup.')) return;
  const t=prompt('Type CLEAR to confirm deleting all dispatch data:');
  if(t===null || t.trim().toUpperCase()!=='CLEAR'){ toast('Clear cancelled'); return; }
  const delIds=del.map(c=>c.id);
  saveCoils(coils.filter(c=>!delIds.includes(c.id)));
  reclaimSerialsForDeleted(del);
  removeCoilsFromBags(delIds);
  saveDispatches([]);
  toast('All dispatch data cleared ('+dispatches.length+' dispatches, '+del.length+' coils)');
  refreshDispatchViews();
}
function importDispatchRows(rows){
    try{
      let coils=loadCoils(), dispatches=loadDispatches();
      let nNew=0, nUpd=0, nSame=0, bad=0, newDisp=0, ctr=0;
      const plan=[];
      rows.forEach(r=>{
        const no=String(xlPick(r,['dispatchno','dispatchnumber','dnno'])).trim();
        const itemCode=String(xlPick(r,['itemcode'])).trim();
        const date=xlDate(xlPick(r,['dispatchdate','date']))||todayStr();
        if(!no||!itemCode){ bad++; return; }
        plan.push({no,date,remarks:String(xlPick(r,['remarks','to'])).trim(),serial:String(xlPick(r,['serial','serialno'])).trim(),itemCode,
          resin:String(xlPick(r,['resin'])).trim(),product:String(xlPick(r,['type','product'])).trim(),colour:String(xlPick(r,['colour','color'])).trim(),
          size:xlNum(xlPick(r,['sizemm','size','ropesize'])),construction:String(xlPick(r,['construction'])).trim(),tracer:String(xlPick(r,['tracer'])).trim(),
          length:xlNum(xlPick(r,['length','quantity'])),unit:String(xlPick(r,['lengthunit','unit'])).trim()||'Yards',
          weight:xlNum(xlPick(r,['weightkg','weight','totalweight'])),customer:String(xlPick(r,['customer','customername','customercode'])).trim()});
      });
      if(!plan.length){ alert('Nothing to import. '+bad+' row(s) were missing Dispatch No or Item Code.'); return; }
      // apply on copies; commit only after confirmation
      const dByNo=new Map(dispatches.map(d=>[dNo(d),d]));
      const touched=new Set();
      plan.forEach(x=>{
        let coil = x.serial ? coils.find(c=>c.serial===x.serial) : null;
        if(coil){
          // existing coil (even if already dispatched): keep it and (re)attach it to the dispatch in the file
          const cur = coil.dispatchId ? dispatches.find(dd=>dd.id===coil.dispatchId) : null;
          if(coil.status==='dispatched' && cur && dNo(cur)===x.no){ if(x.customer) coil.customer=x.customer; nSame++; touched.add(x.no); return; }   // already in this dispatch - nothing to change
          if(cur){ cur.coilIds=cur.coilIds.filter(id=>id!==coil.id); }                                      // move out of its old dispatch
          nUpd++;
        } else {
          if(isNaN(x.weight)){ bad++; return; }
          const serial = x.serial || memSerial(coils, x.itemCode);
          coil={id:'c'+Date.now()+Math.random().toString(16).slice(2)+(ctr++), serial, itemCode:x.itemCode, resin:x.resin, product:x.product, colour:x.colour,
            size:isNaN(x.size)?'':x.size, construction:x.construction, tracer:x.tracer, lengthUnit:x.unit, quantity:isNaN(x.length)?0:x.length,
            weight:x.weight, date:x.date, status:'stock', dispatchId:null, dispatchDate:null, returnDate:null};
          coils.push(coil); nNew++;
        }
        let d=dByNo.get(x.no);
        if(!d){ d={id:'D'+Date.now()+'_'+(ctr++), dispatchNo:x.no, date:x.date, coilIds:[], remarks:x.remarks, createdAt:new Date().toISOString()}; dispatches.push(d); dByNo.set(x.no,d); newDisp++; }
        if(x.customer){ coil.customer=x.customer; if(!d.customer) d.customer=x.customer; }
        coil.status='dispatched'; coil.dispatchId=d.id; coil.dispatchDate=d.date; coil.returnDate=null;
        d.coilIds.push(coil.id); touched.add(x.no);
      });
      dispatches=dispatches.filter(dd=>dd.coilIds.length>0);   // drop dispatches left empty after moving coils
      const total=plan.length-bad;
      if(total<=0){ alert('Nothing imported. '+bad+' row(s) invalid.'); return; }
      if(!confirm('Import '+total+' coil(s) into '+touched.size+' dispatch(es)?\n• New dispatches created: '+newDisp+'\n• New coil records created: '+nNew+'\n• Existing coils linked / updated: '+nUpd+'\n• Already in the same dispatch (no change): '+nSame+'\n• Invalid rows: '+bad+'\nNo rows are skipped; existing data is kept.')) return;
      saveCoils(coils); saveDispatches(dispatches);
      refreshDispatchViews();
      toast('Imported '+total+' coil(s) into '+touched.size+' dispatch(es)');
    }catch(err){ alert('Import failed: '+err.message); }
}

/* ---------------- DISPATCH LIST — PDF export / import ---------------- */
const DISP_PDF_COLS=[['dispatchno','Dispatch No',18],['dispatchdate','Dispatch Date',20],['remarks','Remarks',24],['serial','Serial',46],['itemcode','Item Code',42],['resin','Resin',9],['type','Type',11],['colour','Colour',15],['size','Size',9],['construction','Construction',18],['tracer','Tracer',20],['length','Length',10],['lengthunit','Unit',10],['weight','Weight',12]];
function exportDispatchListPDF(){
  const fd=document.getElementById('dl_dateFilter')?.value||'';
  const coils=loadCoils(); const body=[], payload=[]; let tw=0;
  loadDispatches().filter(d=>!fd||d.date===fd).sort((a,b)=>String(a.date).localeCompare(b.date)).forEach(d=>{
    d.coilIds.map(id=>coils.find(c=>c.id===id)).filter(c=>c&&c.status==='dispatched').sort((a,b)=>String(a.serial).localeCompare(String(b.serial),undefined,{numeric:true})).forEach(c=>{
      const w=+(+c.weight||0).toFixed(3); tw+=w;
      payload.push({dispatchno:String(dNo(d)),dispatchdate:d.date,remarks:d.remarks||'',serial:c.serial,itemcode:c.itemCode,resin:c.resin||'',type:c.product||'',colour:c.colour||'',size:c.size,construction:c.construction||'',tracer:c.tracer||'',length:c.quantity,lengthunit:c.lengthUnit||'',weight:w,customer:customerOf(c,d)});
      body.push([dNo(d),d.date,d.remarks||'',c.serial,c.itemCode,c.resin||'',c.product||'',c.colour||'',c.size,c.construction||'',c.tracer||'',c.quantity,c.lengthUnit||'',w.toFixed(3)].map(v=>dashPdfSan(v)));
    });
  });
  if(!body.length){ toast('No dispatch rows to export'); return; }
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({orientation:'landscape'});
  try{ doc.setProperties({title:'Dispatch Data', subject:'PPDATA1:'+btoa(unescape(encodeURIComponent(JSON.stringify(payload))))}); }catch(e){}
  const y0=pdfHead(doc,'Dispatch List - Coil Wise'+(fd?(' - '+fd):' - All Dates'),'Date: '+todayStr());
  const colStyles={}; DISP_PDF_COLS.forEach((c,i)=>colStyles[i]={cellWidth:c[2]});
  doc.autoTable({startY:y0, head:[DISP_PDF_COLS.map(c=>c[1])], body, theme:'grid', margin:{left:10,right:10,bottom:14}, tableWidth:'wrap',
    styles:{fontSize:6,halign:'left',valign:'middle',overflow:'linebreak',cellPadding:1,lineColor:[198,210,224],lineWidth:.15},
    headStyles:{fillColor:[15,61,62],textColor:255,halign:'left'}, columnStyles:colStyles, rowPageBreak:'avoid',
    alternateRowStyles:{fillColor:[247,250,253]}});
  doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
  let y=doc.lastAutoTable.finalY+6; if(y>doc.internal.pageSize.getHeight()-16){ doc.addPage(); y=16; }
  doc.text('Total coils: '+body.length+'   |   Total quantity in kgs: '+tw.toFixed(3),10,y);
  pdfFoot(doc);
  doc.save('Dispatch_Data_'+(fd||todayStr())+'.pdf');
  toast('PDF exported ('+body.length+' coils)');
}
async function importDispatchPDF(evt){
  const file=evt.target.files[0]; evt.target.value=''; if(!file) return;
  if(window.PPC) PPC.keepFiles([file],'stock');
  if(typeof pdfjsLib==='undefined'){ alert('PDF reader library could not be loaded. Please check your internet connection and reload the page.'); return; }
  try{
    const WURL='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    if(!window._pdfWorkerSet){
      try{ const r=await fetch(WURL); if(!r.ok) throw new Error('worker '+r.status); pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(new Blob([await r.text()],{type:'text/javascript'})); }
      catch(e){ pdfjsLib.GlobalWorkerOptions.workerSrc=WURL; }
      window._pdfWorkerSet=true;
    }
    const pdf=await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
    // 1) exact data embedded by "Export PDF" (preferred)
    try{
      const md=await pdf.getMetadata(); const subj=String((md&&md.info&&md.info.Subject)||'');
      if(subj.indexOf('PPDATA1:')===0){
        const rows=JSON.parse(decodeURIComponent(escape(atob(subj.slice(8)))));
        if(Array.isArray(rows) && rows.length){ importDispatchRows(rows); return; }
      }
    }catch(e){ console.warn('PDF embedded data not usable, reading table text instead', e); }
    // 2) fallback: read the printed table text
    const out=[];
    for(let pn=1;pn<=pdf.numPages;pn++){
      const page=await pdf.getPage(pn);
      const tc=await page.getTextContent();
      const k=(72/25.4)*(page.view[2]/(297*72/25.4));      // mm -> pt, scaled to actual page width
      const bounds=[]; let x=10; DISP_PDF_COLS.forEach(c=>{ bounds.push([x*k,(x+c[2])*k]); x+=c[2]; });
      const items=tc.items.filter(it=>String(it.str).trim()!=='').map(it=>({t:String(it.str).trim(),cx:it.transform[4]+(it.width||0)/2,y:it.transform[5]}));
      items.sort((a,b)=>b.y-a.y);
      const lines=[]; items.forEach(it=>{ const L=lines.find(l=>Math.abs(l.y-it.y)<2.5); if(L) L.items.push(it); else lines.push({y:it.y,items:[it]}); });
      let prev=null;
      lines.forEach(L=>{
        if(L.y < 13*k) return;                               // page footer area
        const cell={}; DISP_PDF_COLS.forEach(c=>cell[c[0]]='');
        L.items.sort((a,b)=>a.cx-b.cx).forEach(it=>{
          let ci=bounds.findIndex(b=>it.cx>=b[0]-0.5 && it.cx<b[1]+0.5);
          if(ci<0) ci = it.cx<bounds[0][0] ? 0 : DISP_PDF_COLS.length-1;
          const key=DISP_PDF_COLS[ci][0]; cell[key]=(cell[key]?cell[key]+' ':'')+it.t;
        });
        const isRow = cell.dispatchno && /^\d{4}-\d{2}-\d{2}$/.test(cell.dispatchdate) && cell.itemcode && cell.serial && !isNaN(parseFloat(cell.weight));
        if(isRow){ out.push(cell); prev=cell; }
        else if(prev && cell.remarks && DISP_PDF_COLS.every(c=>c[0]==='remarks' || !cell[c[0]])){ prev.remarks+=' '+cell.remarks; }   // wrapped remarks line
      });
    }
    if(!out.length){ alert('No dispatch rows were found in this PDF. Please re-export the PDF with the latest version of this page (Export PDF) and import that file.'); return; }
    importDispatchRows(out);
  }catch(err){ alert('PDF import failed: '+err.message); }
}

function printGeneric(title, tableHTML, subheading, extraMeta){
  const area=document.getElementById('printArea');
  const logo = `<img class="print-logo" src="${COMPANY_LOGO}" alt="">`;
  if(subheading!==undefined){
    area.innerHTML = `<div class="print-head">${logo}<h2>POLYMER PRODUCTS CO LLC</h2></div><div class="print-sub">${subheading||''}</div><div class="print-meta">Date: ${todayStr()}${extraMeta?(' &nbsp;|&nbsp; Dispatch No: '+esc(extraMeta)):''}</div>${tableHTML}`;
  } else {
    area.innerHTML = `<div class="print-head">${logo}<h2>POLYMER PRODUCTS CO LLC — ${title}</h2></div><div class="print-meta">Printed: ${new Date().toLocaleString()}${extraMeta?(' &nbsp;|&nbsp; Dispatch No: '+esc(extraMeta)):''}</div>${tableHTML}`;
  }
  document.querySelectorAll('main .page').forEach(p=>p.classList.remove('printing'));
  // Fit fonts to the page: pick font size + orientation from the widest table's column count
  let maxCols=0;
  area.querySelectorAll('table').forEach(t=>{ const r=t.querySelector('tr'); if(r) maxCols=Math.max(maxCols,r.children.length); });
  const fs = maxCols>=13?8: maxCols>=11?8.5: maxCols>=9?9.5: maxCols>=7?10.5: 12;
  area.style.setProperty('--pfs', fs+'px');
  let pageSt=null;
  if(!document.querySelector('style[data-keep-page]')){
    pageSt=document.createElement('style');
    pageSt.textContent='@page{size:A4 '+(maxCols>=7?'landscape':'portrait')+';margin:10mm;}';
    document.head.appendChild(pageSt);
  }
  area.classList.add('show');
  window.print();
  setTimeout(()=>{ area.classList.remove('show'); if(pageSt) pageSt.remove(); }, 1500);
}
/* Helper: 4-row headered AOA for Excel exports (Company / Subheading / Date / Column headers) */
function buildHeaderedSheet(subheading, colHeaders, bodyRows){
  const aoa=[['POLYMER PRODUCTS CO LLC'],[subheading],['Date: '+todayStr()],colHeaders,...bodyRows];
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  const lastCol=colHeaders.length-1;
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:lastCol}},
    {s:{r:1,c:0},e:{r:1,c:lastCol}},
    {s:{r:2,c:0},e:{r:2,c:lastCol}}
  ];
  ws['!cols']=colHeaders.map(()=>({wch:16}));
  return ws;
}
function uniqueItemCodeLabel(list){
  const codes=[...new Set(list.map(c=>c.itemCode))];
  if(!codes.length) return '';
  return codes.length===1 ? ('Item Code: '+codes[0]) : ('Item Codes: '+codes.join(', '));
}
function printFiltered(scope){
  const list=currentFilteredList(scope);
  if(!list.length){ toast('No rows to print'); return; }
  const rowsHtml=list.map((c,i)=>`<tr><td>${i+1}</td><td>${c.product}</td><td>${c.size}mm</td><td>${c.quantity} ${c.lengthUnit}</td><td>${(c.weight||0)}</td></tr>`).join('');
  const totalWt=list.reduce((s,c)=>s+(c.weight||0),0);
  const avgWt=list.length? totalWt/list.length : 0;
  // Total row is appended as the last row of tbody (not a separate tfoot) so it
  // prints only once, on the final page, instead of repeating on every printed page.
  // Average coil weight is shown as part of the same bottom line, right next to the total weight.
  const totalRow=`<tr style="font-weight:700;background:#eaf0f8;"><td colspan="4">Total quantity in kgs (Average Coil Weight: ${avgWt.toFixed(3)} kg)</td><td>${totalWt.toFixed(3)}</td></tr>`;
  const tableHTML=`<table><thead><tr><th>Sl.No</th><th>Type</th><th>Rope Size</th><th>Length</th><th>Quantity in Kgs</th></tr></thead><tbody>${rowsHtml}${totalRow}</tbody></table>`;
  printGeneric('Stock Register', tableHTML, uniqueItemCodeLabel(list));
}
function printHome(){
  printGeneric('Overall Balance Sheet', document.querySelector('.panel:has(#balanceSheetTable)')?.querySelector('table').outerHTML || document.getElementById('balanceSheetTable').outerHTML);
}
function printStockSummary(){
  const selectedCodes=getSelectedStockSummaryCodes();
  let rows=computeStockSummaryRows();
  if(selectedCodes.length) rows=rows.filter(g=>selectedCodes.includes(g.itemCode));
  if(!rows.length){ toast('No data to print'); return; }
  const rowsHtml=rows.map((g,i)=>`<tr><td>${i+1}</td><td class="itemcode">${g.itemCode}</td><td>${g.product}</td><td>${g.size}mm</td><td>${g.quantity} ${g.lengthUnit}</td><td>${g.coils}</td><td>${g.totalWt.toFixed(3)}</td><td>${(g.totalWt/g.coils).toFixed(3)}</td></tr>`).join('');
  const grandWt=rows.reduce((s,g)=>s+g.totalWt,0);
  const grandCoils=rows.reduce((s,g)=>s+g.coils,0);
  // Total row is appended as the last row of tbody (not a separate tfoot) so it
  // prints only once, on the final page, instead of repeating on every printed page.
  const totalRow=`<tr style="font-weight:700;background:#eaf0f8;"><td colspan="5">Total quantity in kgs</td><td>${grandCoils}</td><td>${grandWt.toFixed(3)}</td><td>${grandCoils? (grandWt/grandCoils).toFixed(3):'0.000'}</td></tr>`;
  const tableHTML=`<table><thead><tr><th>Sl.No</th><th>Item Code</th><th>Type</th><th>Rope Size</th><th>Length</th><th>Coils</th><th>Total quantity in kgs</th><th>Average Coil Weight (Kg)</th></tr></thead><tbody>${rowsHtml}${totalRow}</tbody></table>`;
  printGeneric('Stock Summary', tableHTML, 'Stock Summary');
}
function exportTableToExcel(tableId, sheetName, fileName){
  const rows=[...document.querySelectorAll('#'+tableId+' tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent));
  if(!rows.length || rows[0].length===1){ toast('No data to export'); return; }
  const header=[...document.querySelectorAll('#'+tableId+' thead th')].map(th=>th.textContent);
  const ws=XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, fileName+'_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function computeStockSummaryRows(){
  const coils=loadCoils().filter(c=>c.status==='stock');
  const groups={};
  coils.forEach(c=>{
    groups[c.itemCode] = groups[c.itemCode] || {...c, coils:0, totalWt:0};
    groups[c.itemCode].coils++;
    groups[c.itemCode].totalWt += (c.weight||0);
  });
  return Object.values(groups).sort((a,b)=>a.itemCode.localeCompare(b.itemCode));
}
function renderStockSummaryTable(){
  let rows=computeStockSummaryRows();
  const prevChecked=new Set([...document.querySelectorAll('#stockSummaryTable .stockSummaryChk:checked')].map(c=>c.dataset.itemcode));
  document.querySelector('#stockSummaryTable tbody').innerHTML = rows.length? rows.map(g=>
    `<tr><td class="no-print"><input type="checkbox" class="stockSummaryChk" data-itemcode="${g.itemCode}" ${prevChecked.has(g.itemCode)?'checked':''}></td><td class="itemcode">${g.itemCode}</td><td>${g.product}</td><td>${g.colour}</td><td>${g.size}mm</td><td>${g.construction}</td><td>${g.tracer}</td><td>${g.quantity} ${g.lengthUnit}</td><td>${g.coils}</td><td>${g.totalWt.toFixed(3)}</td><td>${(g.totalWt/g.coils).toFixed(3)}</td></tr>`
  ).join('') : '<tr><td colspan="11" class="empty">No stock available.</td></tr>';
  const selectAll=document.getElementById('stockSummarySelectAll');
  if(selectAll) selectAll.checked = rows.length>0 && rows.every(g=>prevChecked.has(g.itemCode));
  const grandCoils=rows.reduce((s,g)=>s+g.coils,0);
  const grandWt=rows.reduce((s,g)=>s+g.totalWt,0);
  document.querySelector('#stockSummaryTable tfoot').innerHTML = rows.length? `<tr><td class="no-print"></td><td colspan="7">Total quantity in kgs</td><td>${grandCoils}</td><td>${grandWt.toFixed(3)}</td><td>${grandCoils? (grandWt/grandCoils).toFixed(3):'0.000'}</td></tr>` : '';
}
function getSelectedStockSummaryCodes(){
  return [...document.querySelectorAll('#stockSummaryTable .stockSummaryChk:checked')].map(c=>c.dataset.itemcode);
}
function exportBalanceSheetExcel(){
  const rows=[...document.querySelectorAll('#balanceSheetTable tbody tr')].map(tr=>[...tr.children].map(td=>td.textContent));
  if(!rows.length || rows[0].length===1){ toast('No data to export'); return; }
  const header=[...document.querySelectorAll('#balanceSheetTable thead th')].map(th=>th.textContent);
  const ws=XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'BalanceSheet');
  XLSX.writeFile(wb, 'Balance_Sheet_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function exportStockSummaryExcel(){
  const selectedCodes=getSelectedStockSummaryCodes();
  let rows=computeStockSummaryRows();
  if(selectedCodes.length) rows=rows.filter(g=>selectedCodes.includes(g.itemCode));
  if(!rows.length){ toast('No data to export'); return; }
  const header=['Sl.No','Item Code','Type','Rope Size','Construction','Length','No. of Coils','Total quantity in kgs','Average weight in kgs'];
  const body=rows.map((g,i)=>[i+1, g.itemCode, g.product, g.size+'mm', g.construction, g.quantity+' '+g.lengthUnit, g.coils, +g.totalWt.toFixed(3), +(g.totalWt/g.coils).toFixed(3)]);
  const grandWt=rows.reduce((s,g)=>s+g.totalWt,0);
  const grandCoils=rows.reduce((s,g)=>s+g.coils,0);
  body.push(['','Total quantity in kgs','','','','', grandCoils, +grandWt.toFixed(3), +(grandCoils? (grandWt/grandCoils).toFixed(3):0)]);
  const ws=buildHeaderedSheet('Stock Summary', header, body);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'StockSummary');
  XLSX.writeFile(wb, 'Stock_Summary_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function exportStockSummaryPDF(){
  const selectedCodes=getSelectedStockSummaryCodes();
  let rows=computeStockSummaryRows();
  if(selectedCodes.length) rows=rows.filter(g=>selectedCodes.includes(g.itemCode));
  if(!rows.length){ toast('No data to export'); return; }
  const header=['Sl.No','Item Code','Type','Rope Size','Construction','Length','No. of Coils','Total quantity in kgs','Average weight in kgs'];
  const body=rows.map((g,i)=>[i+1, g.itemCode, g.product, g.size+'mm', g.construction, g.quantity+' '+g.lengthUnit, g.coils, g.totalWt.toFixed(3), (g.totalWt/g.coils).toFixed(3)]);
  const grandWt=rows.reduce((s,g)=>s+g.totalWt,0);
  const grandCoils=rows.reduce((s,g)=>s+g.coils,0);
  body.push(['','Total quantity in kgs','','','','', grandCoils, grandWt.toFixed(3), grandCoils? (grandWt/grandCoils).toFixed(3):'0.000']);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:'landscape'});
  const y0=pdfHead(doc,'Stock Summary','Date: '+todayStr());
  pdfTable(doc,y0,[header],body,{totalLast:true});
  pdfFoot(doc);
  doc.save('Stock_Summary_'+todayStr()+'.pdf');
  toast('PDF exported');
}
function printDispatchListCoilWise(){
  const dispatches=loadDispatches();
  const coils=loadCoils();
  const filterDate=document.getElementById('dl_dateFilter')?.value;
  let filtered = filterDate? dispatches.filter(d=>d.date===filterDate) : dispatches;
  if(!filtered.length){ toast('No dispatches to print'); return; }
  filtered = filtered.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt));
  let list=[];
  filtered.forEach(d=>{
    d.coilIds.forEach(id=>{
      const c=coils.find(x=>x.id===id);
      if(c && c.status==='dispatched') list.push({...c, dispatchId:d.id, dispatchNo:dNo(d), dispatchDate:d.date});
    });
  });
  const selectedCodes=getDLSelectedItemCodes();
  if(selectedCodes.length) list=list.filter(c=>selectedCodes.includes(c.itemCode));
  if(!list.length){ toast('No coils to print'); return; }
  const rowsHtml=list.map((c,i)=>`<tr><td>${i+1}</td><td>${c.serial}</td><td class="itemcode">${c.itemCode}</td><td>${c.size}mm</td><td>${c.quantity} ${c.lengthUnit}</td><td>${(c.weight||0)}</td><td>${esc(c.dispatchNo)}</td><td>${c.dispatchDate}</td></tr>`).join('');
  const totalWt=list.reduce((s,c)=>s+(c.weight||0),0);
  const avgWt=list.length? totalWt/list.length : 0;
  // Total row is appended as the last row of tbody (not a separate tfoot) so it
  // prints only once, on the final page, instead of repeating on every printed page.
  const totalRow=`<tr style="font-weight:700;background:#eaf0f8;"><td colspan="5">Total quantity in kgs (Average coil weight in kgs: ${avgWt.toFixed(3)})</td><td>${totalWt.toFixed(3)}</td><td></td><td></td></tr>`;
  const tableHTML=`<table><thead><tr><th>Sl.No</th><th>Serial</th><th>Item Code</th><th>Size</th><th>Length</th><th>Weight (Kg)</th><th>Dispatch No.</th><th>Dispatch Date</th></tr></thead><tbody>${rowsHtml}${totalRow}</tbody></table>`;
  const subheading = 'Dispatch List — Coil Wise' + (filterDate? (' — '+filterDate) : ' — All Dates') + (selectedCodes.length? (' — Item Code: '+selectedCodes.join(', ')) : '');
  printGeneric('Dispatch List — Coil Wise', tableHTML, subheading);
}
function printDispatchListItemCodeWise(){
  const dispatches=loadDispatches();
  const coils=loadCoils();
  const filterDate=document.getElementById('dl_dateFilter')?.value;
  let filtered = filterDate? dispatches.filter(d=>d.date===filterDate) : dispatches;
  if(!filtered.length){ toast('No dispatches to print'); return; }
  const rows=computeDispatchSummaryRows(filtered, coils);
  if(!rows.length){ toast('No dispatches to print'); return; }
  const rowsHtml=rows.map((g,i)=>`<tr><td>${i+1}</td><td class="itemcode">${g.itemCode}</td><td>${g.product}</td><td>${g.size}mm</td><td>${g.construction}</td><td>${g.quantity} ${g.lengthUnit}</td><td>${g.totalWt.toFixed(3)}</td><td>${(g.totalWt/g.coils).toFixed(3)}</td></tr>`).join('');
  const grandWt=rows.reduce((s,g)=>s+g.totalWt,0);
  const grandCoils=rows.reduce((s,g)=>s+g.coils,0);
  // Total row is appended as the last row of tbody (not a separate tfoot) so it
  // prints only once, on the final page, instead of repeating on every printed page.
  const totalRow=`<tr style="font-weight:700;background:#eaf0f8;"><td colspan="6">Total quantity in kgs</td><td>${grandWt.toFixed(3)}</td><td>${grandCoils? (grandWt/grandCoils).toFixed(3):'0.000'}</td></tr>`;
  const tableHTML=`<table><thead><tr><th>Sl.No</th><th>Item Code</th><th>Type</th><th>Rope Size</th><th>Construction</th><th>Length</th><th>Total quantity in kgs</th><th>Average weight in kgs</th></tr></thead><tbody>${rowsHtml}${totalRow}</tbody></table>`;
  printGeneric('Dispatch List — Item Code Wise', tableHTML, dispatchEntryLabel(filtered));
}

/* ============================================================
   PER-DISPATCH-NUMBER  PRINT / EXCEL / PDF
   Each dispatch (even several on the same day) has its own manually typed
   Dispatch No., and can be printed / exported on its own.
============================================================ */
function getDispatchData(id){
  const d=loadDispatches().find(x=>x.id===id);
  if(!d) return null;
  const coils=loadCoils();
  const items=d.coilIds.map(cid=>coils.find(c=>c.id===cid)).filter(c=>c && c.status==='dispatched');
  if(!items.length) return null;
  const groups={};
  items.forEach(c=>{
    groups[c.itemCode]=groups[c.itemCode]||{...c, coils:0, totalWt:0};
    groups[c.itemCode].coils++; groups[c.itemCode].totalWt+=(c.weight||0);
  });
  const summary=Object.values(groups).sort((a,b)=>a.itemCode.localeCompare(b.itemCode));
  const totalWt=items.reduce((s,c)=>s+(c.weight||0),0);
  return {d, no:dNo(d), items, summary, totalWt, avgWt: totalWt/items.length};
}
function safeFileName(t){ return String(t).replace(/[^A-Za-z0-9_\-]+/g,'_').replace(/^_+|_+$/g,'') || 'Dispatch'; }
function singleDispatchRows(x){
  const coilHeader=['Sl.No','Serial','Item Code','Type','Rope Size','Construction','Length','Weight (Kg)'];
  const coilBody=x.items.map((c,i)=>[i+1,c.serial,c.itemCode,c.product,c.size+'mm',c.construction,c.quantity+' '+c.lengthUnit,+(c.weight||0)]);
  const sumHeader=['Sl.No','Item Code','Type','Rope Size','Construction','Length','Coils','Total quantity in kgs','Average weight in kgs'];
  const sumBody=x.summary.map((g,i)=>[i+1,g.itemCode,g.product,g.size+'mm',g.construction,g.quantity+' '+g.lengthUnit,g.coils,+g.totalWt.toFixed(3),+(g.totalWt/g.coils).toFixed(3)]);
  return {coilHeader,coilBody,sumHeader,sumBody};
}
function singleDispatchSub(x){
  return 'Dispatch No: '+x.no;
}
function singleDispatchMeta(x){
  return 'Dispatch Date: '+x.d.date+(x.d.remarks?('   |   To / Remarks: '+x.d.remarks):'');
}
function printSingleDispatch(id){
  const x=getDispatchData(id);
  if(!x){ toast('No coils in this dispatch'); return; }
  const coilRows=x.items.map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.serial)}</td><td class="itemcode">${esc(c.itemCode)}</td><td>${esc(c.product)}</td><td>${c.size}mm</td><td>${esc(c.construction)}</td><td>${c.quantity} ${esc(c.lengthUnit)}</td><td>${(c.weight||0)}</td></tr>`).join('');
  const coilTotal=`<tr style="font-weight:700;background:#eaf0f8;"><td colspan="7">Total quantity in kgs — ${x.items.length} coil(s) (Average coil weight: ${x.avgWt.toFixed(3)})</td><td>${x.totalWt.toFixed(3)}</td></tr>`;
  const t1=`<table><thead><tr><th>Sl.No</th><th>Serial</th><th>Item Code</th><th>Type</th><th>Rope Size</th><th>Construction</th><th>Length</th><th>Weight (Kg)</th></tr></thead><tbody>${coilRows}${coilTotal}</tbody></table>`;
  const sumRows=x.summary.map((g,i)=>`<tr><td>${i+1}</td><td class="itemcode">${esc(g.itemCode)}</td><td>${esc(g.product)}</td><td>${g.size}mm</td><td>${esc(g.construction)}</td><td>${g.quantity} ${esc(g.lengthUnit)}</td><td>${g.coils}</td><td>${g.totalWt.toFixed(3)}</td><td>${(g.totalWt/g.coils).toFixed(3)}</td></tr>`).join('');
  const sumTotal=`<tr style="font-weight:700;background:#eaf0f8;"><td colspan="6">Total</td><td>${x.items.length}</td><td>${x.totalWt.toFixed(3)}</td><td>${x.avgWt.toFixed(3)}</td></tr>`;
  const t2=`<h3 style="margin:14px 0 6px;font-size:13px;">Item Code Wise Summary</h3><table><thead><tr><th>Sl.No</th><th>Item Code</th><th>Type</th><th>Rope Size</th><th>Construction</th><th>Length</th><th>Coils</th><th>Total quantity in kgs</th><th>Average weight in kgs</th></tr></thead><tbody>${sumRows}${sumTotal}</tbody></table>`;
  printGeneric('Dispatch', t1+t2, esc(singleDispatchSub(x))+'<div style="font-size:12px;font-weight:400;margin-top:2px;">'+esc(singleDispatchMeta(x))+'</div>');
}
function buildSingleDispatchWorkbook(x){
  const r=singleDispatchRows(x);
  const wb=XLSX.utils.book_new();
  // Sheet 1: coil wise
  const aoa1=[['POLYMER PRODUCTS CO LLC'],[singleDispatchSub(x)],[singleDispatchMeta(x)],r.coilHeader,...r.coilBody,
    ['Total quantity in kgs','','','','','','',+x.totalWt.toFixed(3)]];
  const ws1=XLSX.utils.aoa_to_sheet(aoa1);
  const lc1=r.coilHeader.length-1;
  ws1['!merges']=[0,1,2].map(i=>({s:{r:i,c:0},e:{r:i,c:lc1}})).concat([{s:{r:aoa1.length-1,c:0},e:{r:aoa1.length-1,c:lc1-1}}]);
  ws1['!cols']=r.coilHeader.map(()=>({wch:16}));
  XLSX.utils.book_append_sheet(wb, ws1, 'Coil Wise');
  // Sheet 2: item code summary
  const aoa2=[['POLYMER PRODUCTS CO LLC'],[singleDispatchSub(x)],[singleDispatchMeta(x)],r.sumHeader,...r.sumBody,
    ['Total','','','','','',x.items.length,+x.totalWt.toFixed(3),+x.avgWt.toFixed(3)]];
  const ws2=XLSX.utils.aoa_to_sheet(aoa2);
  const lc2=r.sumHeader.length-1;
  ws2['!merges']=[0,1,2].map(i=>({s:{r:i,c:0},e:{r:i,c:lc2}}));
  ws2['!cols']=r.sumHeader.map(()=>({wch:16}));
  XLSX.utils.book_append_sheet(wb, ws2, 'Item Code Summary');
  return wb;
}
function exportSingleDispatchExcel(id, silent){
  const x=getDispatchData(id);
  if(!x){ if(!silent) toast('No coils in this dispatch'); return false; }
  XLSX.writeFile(buildSingleDispatchWorkbook(x), 'Dispatch_'+safeFileName(x.no)+'_'+x.d.date+'.xlsx');
  if(!silent) toast('Excel exported — Dispatch No. '+x.no);
  return true;
}
function buildSingleDispatchPDF(x){
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({orientation:'landscape'});
  const y0=pdfHead(doc, singleDispatchSub(x), singleDispatchMeta(x));
  const r=singleDispatchRows(x);
  pdfTable(doc,y0,[r.coilHeader],[...r.coilBody,[{content:'Total quantity in kgs — '+x.items.length+' coil(s)',colSpan:7},x.totalWt.toFixed(3)]],{totalLast:true});
  let y=doc.lastAutoTable.finalY+8;
  if(y>doc.internal.pageSize.getHeight()-40){ doc.addPage(); y=20; }
  doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(15,61,62);
  doc.text('Item Code Wise Summary',doc.internal.pageSize.getWidth()/2,y,{align:'center'}); doc.setTextColor(0);
  pdfTable(doc,y+3,[r.sumHeader],[...r.sumBody,['Total','','','','','',x.items.length,x.totalWt.toFixed(3),x.avgWt.toFixed(3)]],{totalLast:true});
  pdfFoot(doc);
  return doc;
}
function exportSingleDispatchPDF(id, silent){
  const x=getDispatchData(id);
  if(!x){ if(!silent) toast('No coils in this dispatch'); return false; }
  buildSingleDispatchPDF(x).save('Dispatch_'+safeFileName(x.no)+'_'+x.d.date+'.pdf');
  if(!silent) toast('PDF exported — Dispatch No. '+x.no);
  return true;
}
/* One separate file per Dispatch No. for everything currently shown (respects the date filter) */
function exportEachDispatchSeparately(kind){
  const filterDate=document.getElementById('dl_dateFilter')?.value;
  let list=loadDispatches().filter(d=>!filterDate || d.date===filterDate).filter(d=>getDispatchData(d.id));
  if(!list.length){ toast('No dispatches to export'); return; }
  list=list.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt));
  list.forEach((d,i)=>setTimeout(()=>{ kind==='pdf'? exportSingleDispatchPDF(d.id,true) : exportSingleDispatchExcel(d.id,true); }, i*600));
  toast('Exporting '+list.length+' '+(kind==='pdf'?'PDF':'Excel')+' file(s) — one per Dispatch No. (allow multiple downloads if your browser asks)');
}
function printReturned(){
  const html=document.querySelector('#page-returned table').outerHTML;
  printGeneric('Returned Coils Register', html);
}

/* ============================================================
   DASHBOARD — Overall / Monthly Wise / Daily Wise (stock in vs dispatch)
   Inline-SVG charts, Print, Excel. Reads the same data as every other page.
   Definitions (same as the Home page):
     Stock In    = every coil, by its entry date
     Dispatched  = coils whose status is "dispatched", by dispatch date (returned coils are not counted)
     Balance     = In Stock + Returned + Non-Movable  (= Stock In − Dispatched)
============================================================ */
const DASH_COL = {stock:'#1B7A79', disp:'#D2691E', ret:'#6b4fa0', nonmov:'#6b7280', bal:'#0F3D3E'};
const DASH_MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dashState = {view:'overall', year:'all', from:'', to:'', inited:false};

/* ---------- helpers ---------- */
function dashEsc(s){ return String(s==null?'':s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])); }
function dashKg(n){ return (+n||0).toLocaleString('en-US',{minimumFractionDigits:3,maximumFractionDigits:3}); }
function dashInt(n){ return Math.round(+n||0).toLocaleString('en-US'); }
function dashR3(n){ return Math.round((+n||0)*1000)/1000; }
function dashAxisFmt(v){
  const a=Math.abs(v), sg=v<0?'-':'';
  if(a>=10000) return sg+Math.round(a/1000)+'k';
  if(a>=1000) return sg+(+(a/1000).toFixed(2))+'k';
  return String(+v.toFixed(2));
}
function dashYmd(v){ const s=v?String(v).slice(0,10):''; return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:''; }
function dashLocalYmd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function dashAddDays(ymd,n){ const p=ymd.split('-').map(Number); return new Date(Date.UTC(p[0],p[1]-1,p[2]+n)).toISOString().slice(0,10); }
function dashDaysBetween(a,b){ const p=a.split('-').map(Number), q=b.split('-').map(Number); return Math.round((Date.UTC(q[0],q[1]-1,q[2])-Date.UTC(p[0],p[1]-1,p[2]))/86400000); }
function dashMonthLabel(ym){ const p=ym.split('-'); return DASH_MON[+p[1]-1]+' '+p[0]; }
function dashMonthEnd(ym){ const p=ym.split('-').map(Number); return ym+'-'+String(new Date(p[0],p[1],0).getDate()).padStart(2,'0'); }
function dashWidth(){ const el=document.getElementById('dashBody'); return Math.max(560,((el&&el.clientWidth)||1000)-40); }

/* ---------- data ---------- */
function dashCollect(){
  const coils=loadCoils(), dispatches=loadDispatches();
  const dmap={}; dispatches.forEach(d=>{ dmap[d.id]=d.date; });
  const ins=[], outs=[]; let undated=0;
  coils.forEach(c=>{
    const w=+c.weight||0; let bad=false;
    const din=dashYmd(c.date);
    if(din) ins.push({d:din,w}); else bad=true;
    if(c.status==='dispatched'){
      const dout=dashYmd(c.dispatchDate||dmap[c.dispatchId]);
      if(dout) outs.push({d:dout,w}); else bad=true;
    }
    if(bad) undated++;
  });
  const all=ins.concat(outs).map(x=>x.d).sort();
  return {coils, ins, outs, undated, minDate:all[0]||'', maxDate:all[all.length-1]||''};
}
function dashBucket(list,keyFn){
  const o={};
  list.forEach(x=>{ const k=keyFn(x.d); const b=o[k]||(o[k]={c:0,kg:0}); b.c++; b.kg+=x.w; });
  return o;
}
function dashMonthlyRows(data){
  const a=dashBucket(data.ins,d=>d.slice(0,7)), b=dashBucket(data.outs,d=>d.slice(0,7));
  const keys=Object.keys(a).concat(Object.keys(b)).sort();
  if(!keys.length) return [];
  const last=keys[keys.length-1], rows=[]; let cum=0, cumC=0;
  let y=+keys[0].slice(0,4), m=+keys[0].slice(5,7);
  for(;;){
    const k=y+'-'+String(m).padStart(2,'0');
    const i=a[k]||{c:0,kg:0}, o=b[k]||{c:0,kg:0};
    const opening=cum; cum=dashR3(cum+i.kg-o.kg); cumC+=i.c-o.c;
    rows.push({key:k,label:dashMonthLabel(k),inC:i.c,inKg:i.kg,outC:o.c,outKg:o.kg,opening,closing:cum,closingC:cumC,active:(i.c+o.c)>0});
    if(k>=last) break;
    m++; if(m>12){ m=1; y++; }
  }
  return rows;
}
function dashDailyRows(data,from,to){
  const a=dashBucket(data.ins,d=>d), b=dashBucket(data.outs,d=>d);
  let cum=0, cumC=0;
  Object.keys(a).forEach(k=>{ if(k<from){ cum+=a[k].kg; cumC+=a[k].c; } });
  Object.keys(b).forEach(k=>{ if(k<from){ cum-=b[k].kg; cumC-=b[k].c; } });
  cum=dashR3(cum);
  const n=dashDaysBetween(from,to), rows=[];
  for(let i=0;i<=n;i++){
    const k=dashAddDays(from,i), x=a[k]||{c:0,kg:0}, o=b[k]||{c:0,kg:0};
    const opening=cum; cum=dashR3(cum+x.kg-o.kg); cumC+=x.c-o.c;
    rows.push({key:k,inC:x.c,inKg:x.kg,outC:o.c,outKg:o.kg,opening,closing:cum,closingC:cumC,active:(x.c+o.c)>0});
  }
  return rows;
}

/* ---------- SVG charts ---------- */
function dashNiceStep(rough){ const p=Math.pow(10,Math.floor(Math.log10(rough))); const f=rough/p; return (f<=1?1:f<=2?2:f<=5?5:10)*p; }
function dashAxis1(hi){
  if(!(hi>0)) return {step:1,n:4};
  const s=dashNiceStep(hi/5);
  return {step:s,n:Math.max(2,Math.ceil(hi/s-1e-9))};
}
/* Right-hand axis with the SAME number of intervals as the left axis, so gridlines line up. */
function dashAxis2(lo,hi,n){
  lo=Math.min(lo,0); hi=Math.max(hi,0);
  if(lo===0&&hi===0) return {step:1,a:0};
  for(let e=-3;e<=12;e++){
    for(const mm of [1,2,2.5,5]){
      const s=mm*Math.pow(10,e), a=Math.ceil(-lo/s-1e-9), b=Math.ceil(hi/s-1e-9);
      if(a+b<=n) return {step:s,a};
    }
  }
  return {step:((hi-lo)/n)||1,a:0};
}
function dashColumnChart(o){
  const n=o.labels.length;
  if(!n) return '<div class="empty">No data for this selection.</div>';
  const W=o.width, hasLine=!!o.line, k=o.series.length;
  const maxBar0=Math.max(0,...o.series.flatMap(s=>s.values));
  // exact value labels (full kg figure, rotated) need extra head-room above the tallest bar
  const topPad=o.valueLabels?Math.max(46,34+dashKg(maxBar0).length*6.2):46;
  const H=(o.height||360)+(topPad-46);
  const m={t:topPad,r:hasLine?72:18,l:68,b:36};
  const iw=W-m.l-m.r, gw=iw/n;
  const maxLab=Math.max(...o.labels.map(s=>String(s).length));
  const rotate=gw<maxLab*6.4+8;
  if(rotate) m.b=Math.min(92,26+maxLab*4.7);
  const ih=H-m.t-m.b;
  const every=rotate?Math.max(1,Math.ceil(16/gw)):1;
  const maxBar=Math.max(0,...o.series.flatMap(s=>s.values));
  const A1=dashAxis1(maxBar), n1=A1.n, s1=A1.step;
  const A2=hasLine?dashAxis2(Math.min(...o.line.values),Math.max(...o.line.values),n1):null;
  const yB=v=>m.t+ih-(v/(n1*s1))*ih;
  const yL=v=>m.t+ih-((v+A2.a*A2.step)/(n1*A2.step))*ih;
  let g='';
  for(let j=0;j<=n1;j++){
    const y=+(m.t+ih-(j/n1)*ih).toFixed(1);
    g+=`<line x1="${m.l}" x2="${W-m.r}" y1="${y}" y2="${y}" stroke="${j===0?'#8fa3a1':'#e3eae8'}"/>`;
    g+=`<text x="${m.l-8}" y="${y+4}" text-anchor="end" font-size="11" fill="#5c6f6d">${dashAxisFmt(j*s1)}</text>`;
    if(hasLine) g+=`<text x="${W-m.r+8}" y="${y+4}" font-size="11" fill="${o.line.color}">${dashAxisFmt((j-A2.a)*A2.step)}</text>`;
  }
  g+=`<text x="${m.l-8}" y="${m.t-14}" text-anchor="end" font-size="11" font-weight="700" fill="#5c6f6d">kg</text>`;
  if(hasLine) g+=`<text x="${W-m.r+8}" y="${m.t-14}" font-size="11" font-weight="700" fill="${o.line.color}">kg</text>`;
  const bw=Math.max(1,Math.min(34,(gw*0.8)/k));
  o.series.forEach((s,si)=>{
    s.values.forEach((v,i)=>{
      if(!(v>0)) return;
      const x=m.l+gw*i+gw/2-(k*bw)/2+si*bw, y=yB(v);
      g+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(0.8,bw-(bw>4?1:0)).toFixed(1)}" height="${(m.t+ih-y).toFixed(1)}" fill="${s.color}" rx="${bw>6?1.5:0}"/>`;
      if(o.valueLabels && bw>=9) g+=`<text transform="translate(${(x+bw/2+3.5).toFixed(1)},${(y-4).toFixed(1)}) rotate(-90)" text-anchor="start" font-size="10" font-weight="700" fill="${s.color}">${dashKg(v)}</text>`;
    });
  });
  if(hasLine){
    const pts=o.line.values.map((v,i)=>[m.l+gw*i+gw/2,yL(v)]);
    g+=`<polyline fill="none" stroke="${o.line.color}" stroke-width="2.2" stroke-linejoin="round" points="${pts.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}"/>`;
    if(n<=45) pts.forEach(p=>{ g+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="#fff" stroke="${o.line.color}" stroke-width="2"/>`; });
  }
  o.labels.forEach((lb,i)=>{
    if(i%every!==0) return;
    const x=(m.l+gw*i+gw/2).toFixed(1), y=m.t+ih+16;
    g+= rotate
      ? `<text transform="translate(${x},${y-2}) rotate(-45)" text-anchor="end" font-size="11" fill="#1c2b2a">${dashEsc(lb)}</text>`
      : `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="#1c2b2a">${dashEsc(lb)}</text>`;
  });
  let lx=m.l;
  const items=o.series.map(s=>({name:s.name,color:s.color,line:false}));
  if(hasLine) items.push({name:o.line.name,color:o.line.color,line:true});
  items.forEach(it=>{
    g+= it.line
      ? `<line x1="${lx}" x2="${lx+14}" y1="14" y2="14" stroke="${it.color}" stroke-width="2.5"/><circle cx="${lx+7}" cy="14" r="3" fill="#fff" stroke="${it.color}" stroke-width="2"/>`
      : `<rect x="${lx}" y="8" width="12" height="12" rx="2" fill="${it.color}"/>`;
    g+=`<text x="${lx+20}" y="18" font-size="12" fill="#1c2b2a">${dashEsc(it.name)}</text>`;
    lx+=20+it.name.length*6.6+26;
  });
  o.labels.forEach((lb,i)=>{
    let tip=lb+'\n'+o.series.map(s=>s.name+': '+dashKg(s.values[i])+' kg').join('\n');
    if(hasLine) tip+='\n'+o.line.tip+': '+dashKg(o.line.values[i])+' kg';
    g+=`<rect x="${(m.l+gw*i).toFixed(1)}" y="${m.t}" width="${gw.toFixed(1)}" height="${ih}" fill="transparent"><title>${dashEsc(tip)}</title></rect>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${dashEsc(o.aria||'Chart')}" font-family="'Segoe UI',Arial,sans-serif" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}
function dashDonut(o){
  const W=380,H=340,cx=190,cy=122,R=104,r=66;
  const total=o.slices.reduce((s,x)=>s+x.kg,0);
  let g='';
  if(total<=0){
    g+=`<circle cx="${cx}" cy="${cy}" r="${(R+r)/2}" fill="none" stroke="#e3eae8" stroke-width="${R-r}"/><text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="13" fill="#5c6f6d">No stock yet</text>`;
  } else {
    let a0=-Math.PI/2;
    o.slices.forEach(s=>{
      if(!(s.kg>0)) return;
      const frac=s.kg/total, tip=dashEsc(s.name+': '+dashKg(s.kg)+' kg, '+dashInt(s.c)+' coils ('+(frac*100).toFixed(1)+'%)');
      if(frac>=0.9999){
        g+=`<circle cx="${cx}" cy="${cy}" r="${(R+r)/2}" fill="none" stroke="${s.color}" stroke-width="${R-r}"><title>${tip}</title></circle>`;
        return;
      }
      const a1=a0+frac*2*Math.PI, large=frac>0.5?1:0;
      const P=(rad,a)=>[(cx+rad*Math.cos(a)).toFixed(2),(cy+rad*Math.sin(a)).toFixed(2)];
      const p0=P(R,a0),p1=P(R,a1),p2=P(r,a1),p3=P(r,a0);
      g+=`<path d="M${p0[0]},${p0[1]} A${R},${R} 0 ${large} 1 ${p1[0]},${p1[1]} L${p2[0]},${p2[1]} A${r},${r} 0 ${large} 0 ${p3[0]},${p3[1]} Z" fill="${s.color}" stroke="#fff" stroke-width="1.5"><title>${tip}</title></path>`;
      a0=a1;
    });
    g+=`<text x="${cx}" y="${cy}" text-anchor="middle" font-size="20" font-weight="800" fill="#0F3D3E">${dashInt(total)}</text><text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="11" fill="#5c6f6d">kg received</text>`;
  }
  let ly=268;
  o.slices.forEach(s=>{
    const pct=total>0?(s.kg/total*100):0;
    g+=`<circle cx="16" cy="${ly-4}" r="5" fill="${s.color}"/><text x="28" y="${ly}" font-size="12" fill="#1c2b2a">${dashEsc(s.name)}</text><text x="${W-6}" y="${ly}" text-anchor="end" font-size="12" fill="#5c6f6d">${dashKg(s.kg)} kg (${pct.toFixed(1)}%)</text>`;
    ly+=22;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight by status" font-family="'Segoe UI',Arial,sans-serif" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}
function dashHBars(o){
  const rows=o.rows, n=rows.length;
  if(!n) return '<div class="empty">No stock or dispatch recorded yet.</div>';
  const W=o.width;
  const labW=Math.min(240,Math.max(...rows.map(r=>r.label.length))*6.5+14);
  const m={t:52,r:80,b:10,l:labW};
  const rowH=32, ih=n*rowH, H=m.t+ih+m.b, iw=W-m.l-m.r;
  const maxV=Math.max(0,...rows.map(r=>Math.max(r.a,r.b)));
  const ax=dashAxis1(maxV), tot=ax.n*ax.step;
  const X=v=>m.l+(v/tot)*iw;
  let g='';
  for(let j=0;j<=ax.n;j++){
    const xx=(m.l+(j/ax.n)*iw).toFixed(1);
    g+=`<line x1="${xx}" x2="${xx}" y1="${m.t-6}" y2="${m.t+ih}" stroke="${j===0?'#8fa3a1':'#e3eae8'}"/><text x="${xx}" y="${m.t-12}" text-anchor="middle" font-size="11" fill="#5c6f6d">${dashAxisFmt(j*ax.step)}</text>`;
  }
  rows.forEach((r,i)=>{
    const top=m.t+i*rowH, y0=top+5, bh=10;
    g+=`<text x="${m.l-8}" y="${(top+rowH/2+4).toFixed(1)}" text-anchor="end" font-size="10.5" font-weight="700" font-family="Consolas,'Courier New',monospace" fill="#0F3D3E">${dashEsc(r.label)}</text>`;
    [[r.a,o.colors[0]],[r.b,o.colors[1]]].forEach((pair,j)=>{
      const v=pair[0], col=pair[1], yy=y0+j*(bh+1);
      if(v>0){
        const w=Math.max(1,X(v)-m.l);
        g+=`<rect x="${m.l}" y="${yy}" width="${w.toFixed(1)}" height="${bh}" rx="1.5" fill="${col}"/><text x="${(m.l+w+4).toFixed(1)}" y="${yy+9}" font-size="9.5" font-weight="700" fill="${col}">${dashKg(v)}</text>`;
      }
    });
    g+=`<rect x="0" y="${top}" width="${W}" height="${rowH}" fill="transparent"><title>${dashEsc(r.label+'\n'+o.names[0]+': '+dashKg(r.a)+' kg\n'+o.names[1]+': '+dashKg(r.b)+' kg')}</title></rect>`;
  });
  let lx=m.l;
  o.names.forEach((nm,j)=>{
    g+=`<rect x="${lx}" y="8" width="12" height="12" rx="2" fill="${o.colors[j]}"/><text x="${lx+20}" y="18" font-size="12" fill="#1c2b2a">${dashEsc(nm)}</text>`;
    lx+=20+nm.length*6.6+26;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Item code wise stock and dispatch" font-family="'Segoe UI',Arial,sans-serif" xmlns="http://www.w3.org/2000/svg">${g}</svg>`;
}

/* ---------- view models (one source for screen, print and Excel) ---------- */
const DASH_LEDGER_HEAD=['Opening (kg)','Stock In (coils)','Stock In (kg)','Dispatched (coils)','Dispatched (kg)','Closing (kg)','Closing (coils)'];
const DASH_LEDGER_FMT=['k','i','k','i','k','k','i'];
function dashLedgerRow(label,r){ return [label,r.opening,r.inC,r.inKg,r.outC,r.outKg,r.closing,r.closingC]; }
function dashLedgerTotal(rows){
  if(!rows.length) return null;
  const s=f=>rows.reduce((t,r)=>t+r[f],0), last=rows[rows.length-1];
  return ['Total',rows[0].opening,s('inC'),s('inKg'),s('outC'),s('outKg'),last.closing,last.closingC];
}
/* Dispatch of the previous calendar month (relative to today) */
function dashLastMonthDispatch(data){
  const n=new Date(), d=new Date(n.getFullYear(),n.getMonth()-1,1);
  const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  let c=0,kg=0; data.outs.forEach(x=>{ if(x.d.slice(0,7)===ym){ c++; kg+=x.w; } });
  return {label:dashMonthLabel(ym),c,kg};
}
function dashLastMonthKpi(data){
  const l=dashLastMonthDispatch(data);
  return {label:'Last Month Dispatch ('+l.label+')',value:dashKg(l.kg),sub:'No. of Coils: '+dashInt(l.c),cls:'amber'};
}
function dashLedgerKpis(tot,data){
  const t=tot||['',0,0,0,0,0,0,0];
  return [
    {label:'Stock In (Received)',value:dashKg(t[3]),sub:'No. of Coils: '+dashInt(t[2]),cls:''},
    {label:'Dispatched',value:dashKg(t[5]),sub:'No. of Coils: '+dashInt(t[4]),cls:'amber'},
    {label:'Closing Balance',value:dashKg(t[6]),sub:'No. of Coils: '+dashInt(t[7])+' | Opening '+dashKg(t[1])+' kg',cls:'green'},
    dashLastMonthKpi(data)
  ];
}
function dashLedgerChart(rows,labels,W,valueLabels,aria){
  return '<div class="dash-chart"><div class="dash-scroll">'+dashColumnChart({
    labels, width:W, height:360, valueLabels, aria,
    series:[{name:'Stock In',color:DASH_COL.stock,values:rows.map(r=>r.inKg)},{name:'Dispatched',color:DASH_COL.disp,values:rows.map(r=>r.outKg)}],
    line:{name:'Closing balance (right axis)',tip:'Closing balance',color:DASH_COL.bal,values:rows.map(r=>r.closing)}
  })+'</div></div>';
}
function dashLedgerNote(extra){
  return 'Stock In counts every coil by its entry date. Dispatched counts coils currently dispatched, by dispatch date (returned coils are not counted). Closing (kg and coils) = Opening + Stock In − Dispatched, and carries over from earlier periods. Last Month Dispatch is the previous calendar month.'+(extra||'');
}

function dashBuildOverall(data){
  const S={stock:{c:0,kg:0},dispatched:{c:0,kg:0},returned:{c:0,kg:0},nonmovable:{c:0,kg:0}};
  const items={}; let recvKg=0;
  data.coils.forEach(c=>{
    const w=+c.weight||0; recvKg+=w;
    if(S[c.status]){ S[c.status].c++; S[c.status].kg+=w; }
    const code=c.itemCode||'(no code)';
    const it=items[code]||(items[code]={code,type:c.product||'',size:(c.size!=null&&c.size!==''?c.size+'mm':''),len:((c.quantity!=null?c.quantity:'')+' '+(c.lengthUnit||'')).trim(),recvKg:0,stockC:0,stockKg:0,dispC:0,dispKg:0,retKg:0,nonKg:0});
    it.recvKg+=w;
    if(c.status==='stock'){ it.stockC++; it.stockKg+=w; }
    else if(c.status==='dispatched'){ it.dispC++; it.dispKg+=w; }
    else if(c.status==='returned'){ it.retKg+=w; }
    else if(c.status==='nonmovable'){ it.nonKg+=w; }
  });
  const list=Object.values(items).sort((a,b)=>a.code.localeCompare(b.code));
  const balC=S.stock.c+S.returned.c+S.nonmovable.c, balKg=S.stock.kg+S.returned.kg+S.nonmovable.kg;
  const headers=['Item Code','Type','Size','Length','Received (kg)','In Stock (coils)','In Stock (kg)','Dispatched (coils)','Dispatched (kg)','Returned (kg)','Non-Movable (kg)','Balance (kg)'];
  const fmt=['c','t','t','t','k','i','k','i','k','k','k','k'];
  const rows=list.map(it=>[it.code,it.type,it.size,it.len,it.recvKg,it.stockC,it.stockKg,it.dispC,it.dispKg,it.retKg,it.nonKg,it.stockKg+it.retKg+it.nonKg]);
  const total=['Total','','','',recvKg,S.stock.c,S.stock.kg,S.dispatched.c,S.dispatched.kg,S.returned.kg,S.nonmovable.kg,balKg];
  const sub='Dashboard — Overall Stock & Dispatch';
  return {
    view:'overall', title:'Overall Stock & Dispatch', sub,
    empty:!data.coils.length, emptyMsg:'No stock entries yet — add coils on the Stock Entry page to see the dashboard.',
    kpis:[
      {label:'Total Received (Stock In)',value:dashKg(recvKg),sub:'No. of Coils: '+dashInt(data.coils.length),cls:'navy'},
      {label:'In Stock (Available)',value:dashKg(S.stock.kg),sub:'No. of Coils: '+dashInt(S.stock.c),cls:''},
      {label:'Dispatched',value:dashKg(S.dispatched.kg),sub:'No. of Coils: '+dashInt(S.dispatched.c),cls:'amber'},
      {label:'Returned',value:dashKg(S.returned.kg),sub:'No. of Coils: '+dashInt(S.returned.c),cls:'purple'},
      {label:'Non-Movable',value:dashKg(S.nonmovable.kg),sub:'No. of Coils: '+dashInt(S.nonmovable.c),cls:'gray'},
      {label:'Closing Balance (Stock in Hand)',value:dashKg(balKg),sub:'No. of Coils: '+dashInt(balC),cls:'green'},
      dashLastMonthKpi(data)
    ],
    chartsTitle:'Overall Charts', tableTitle:'Item Code Wise — Stock & Dispatch',
    charts:(W)=>{
      const top=list.filter(it=>it.stockKg+it.dispKg>0).sort((a,b)=>(b.stockKg+b.dispKg)-(a.stockKg+a.dispKg)).slice(0,15);
      const wr=W>=960?W-396:W;
      const donut=dashDonut({slices:[
        {name:'In Stock',color:DASH_COL.stock,kg:S.stock.kg,c:S.stock.c},
        {name:'Dispatched',color:DASH_COL.disp,kg:S.dispatched.kg,c:S.dispatched.c},
        {name:'Returned',color:DASH_COL.ret,kg:S.returned.kg,c:S.returned.c},
        {name:'Non-Movable',color:DASH_COL.nonmov,kg:S.nonmovable.kg,c:S.nonmovable.c}
      ]});
      const hb=dashHBars({width:wr,names:['In Stock','Dispatched'],colors:[DASH_COL.stock,DASH_COL.disp],
        rows:top.map(it=>({label:it.code,a:it.stockKg,b:it.dispKg}))});
      const more=list.length>15?' (top 15 of '+list.length+' item codes)':'';
      return `<div class="dash-grid"><div class="dash-chart"><div class="dash-chart-title">Weight by status</div>${donut}</div><div class="dash-chart"><div class="dash-chart-title">Item code wise — In Stock vs Dispatched (kg)${more}</div><div class="dash-scroll">${hb}</div></div></div>`;
    },
    headers, fmt, rows, total,
    note:'Each coil is counted once, under its current status. Balance = In Stock + Returned + Non-Movable, the same figure as the Home page.',
    sheets:[
      {name:'Overall Summary',sub,headers:['Status','Coils','Weight (kg)'],fmt:['t','i','k'],rows:[
        ['Total Received',data.coils.length,recvKg],
        ['In Stock (Available)',S.stock.c,S.stock.kg],
        ['Dispatched',S.dispatched.c,S.dispatched.kg],
        ['Returned',S.returned.c,S.returned.kg],
        ['Non-Movable',S.nonmovable.c,S.nonmovable.kg],
        ['Balance (Stock in Hand)',balC,balKg]
      ],total:null},
      {name:'Item Code Wise',sub:'Dashboard — Overall Stock & Dispatch — Item Code Wise',headers,fmt,rows,total}
    ]
  };
}
function dashBuildMonthly(data,allYears){
  let rows=dashMonthlyRows(data);
  const years=[...new Set(rows.map(r=>r.key.slice(0,4)))];
  const yr=(!allYears&&dashState.year!=='all'&&years.includes(dashState.year))?dashState.year:'';
  if(yr) rows=rows.filter(r=>r.key.startsWith(yr));
  const total=dashLedgerTotal(rows);
  const sub='Dashboard — Monthly Wise Stock & Dispatch — '+(yr||'All Years');
  const headers=['Month'].concat(DASH_LEDGER_HEAD), fmt=['t'].concat(DASH_LEDGER_FMT);
  const trows=rows.map(r=>dashLedgerRow(r.label,r));
  return {
    view:'monthly', title:'Monthly Stock & Dispatch', sub, ledger:true, year:yr,
    empty:!rows.length, emptyMsg:'No stock entries or dispatches recorded yet.',
    kpis:dashLedgerKpis(total,data),
    chartsTitle:'Monthly Stock In vs Dispatched', tableTitle:'Monthly Stock & Dispatch Register',
    charts:(W)=>dashLedgerChart(rows,rows.map(r=>r.label),W,rows.length<=24,'Monthly stock in versus dispatched'),
    headers, fmt, rows:trows, total, note:dashLedgerNote(),
    sheets:[{name:'Monthly Wise',sub,headers,fmt,rows:trows,total}]
  };
}
function dashBuildDaily(data,range){
  const from=(range&&range.from)||dashState.from, to=(range&&range.to)||dashState.to;
  const all=dashDailyRows(data,from,to), active=all.filter(r=>r.active);
  const multi=from.slice(0,7)!==to.slice(0,7);
  const labels=all.map(r=>multi?(+r.key.slice(8))+' '+DASH_MON[+r.key.slice(5,7)-1]:String(+r.key.slice(8)));
  const total=dashLedgerTotal(all);
  const sub='Dashboard — Daily Wise Stock & Dispatch — '+from+' to '+to;
  const headers=['Date'].concat(DASH_LEDGER_HEAD), fmt=['t'].concat(DASH_LEDGER_FMT);
  const trows=active.map(r=>dashLedgerRow(r.key,r));
  return {
    view:'daily', title:'Daily Stock & Dispatch', sub, ledger:true, from, to,
    empty:!active.length, emptyMsg:'No stock entries or dispatches between '+from+' and '+to+'.',
    kpis:dashLedgerKpis(total,data),
    chartsTitle:'Daily Stock In vs Dispatched', tableTitle:'Daily Stock & Dispatch Register',
    charts:(W)=>dashLedgerChart(all,labels,W,false,'Daily stock in versus dispatched'),
    headers, fmt, rows:trows, total:active.length?total:null,
    note:dashLedgerNote(' Only days with a stock entry or dispatch are listed.'),
    sheets:[{name:'Daily Wise',sub,headers,fmt,rows:trows,total:active.length?total:null}]
  };
}
function dashBuild(view,data,range){
  if(view==='monthly') return dashBuildMonthly(data);
  if(view==='daily') return dashBuildDaily(data,range);
  return dashBuildOverall(data);
}

/* ---------- HTML pieces ---------- */
function dashKpiHtml(kpis){
  return '<div class="cards dash-kpi">'+kpis.map(k=>`<div class="card ${k.cls||''}"><div class="label">${dashEsc(k.label)}</div><div class="value">${k.value} <small>kg</small></div><div class="muted">${dashEsc(k.sub||'')}</div></div>`).join('')+'</div>';
}
function dashTableHtml(m){
  if(!m.rows.length) return `<div class="empty">${dashEsc(m.emptyMsg)}</div>`;
  const numF=f=>f==='k'||f==='i';
  const cell=(v,f)=>{
    if(f==='k') return `<td class="num${v<-0.0005?' neg':''}">${dashKg(v)}</td>`;
    if(f==='i') return `<td class="num">${dashInt(v)}</td>`;
    if(f==='c') return `<td class="itemcode">${dashEsc(v)}</td>`;
    return `<td>${dashEsc(v)}</td>`;
  };
  const head=m.headers.map((h,i)=>`<th${numF(m.fmt[i])?' class="num"':''}>${dashEsc(h)}</th>`).join('');
  const body=m.rows.map(r=>`<tr>${r.map((v,i)=>cell(v,m.fmt[i])).join('')}</tr>`).join('');
  const tot=m.total?`<tr class="dash-total">${m.total.map((v,i)=>cell(v,i===0?'t':m.fmt[i])).join('')}</tr>`:'';
  return `<div class="table-wrap"><table class="dash-table"><thead><tr>${head}</tr></thead><tbody>${body}${tot}</tbody></table></div>`;
}
function dashUndatedMsg(data){
  return data.undated? `${data.undated} coil${data.undated===1?' has':'s have'} no valid entry or dispatch date and ${data.undated===1?'is':'are'} left out of the monthly and daily figures (they are still counted in Overall).` : '';
}

/* ---------- render ---------- */
function dashRenderTabs(){
  document.querySelectorAll('#dashTabs button').forEach(b=>b.classList.toggle('active',b.dataset.dview===dashState.view));
}
function dashRenderFilters(data){
  const msel=document.getElementById('dash_printMonth');
  if(msel){
    const keys=dashMonthlyRows(data).map(r=>r.key).reverse(), prev=msel.value;
    msel.innerHTML=keys.length?keys.map(k=>`<option value="${k}">${dashMonthLabel(k)}</option>`).join(''):'<option value="">No data</option>';
    if(prev&&keys.includes(prev)) msel.value=prev;
  }
  const host=document.getElementById('dashFilterRow');
  if(dashState.view==='monthly'){
    const years=[...new Set(dashMonthlyRows(data).map(r=>r.key.slice(0,4)))];
    if(dashState.year!=='all'&&!years.includes(dashState.year)) dashState.year='all';
    host.innerHTML=`<div class="field"><label>Year</label><select id="dash_year" onchange="dashState.year=this.value;dashRenderBody()"><option value="all">All Years</option>${years.map(y=>`<option value="${y}"${y===dashState.year?' selected':''}>${y}</option>`).join('')}</select></div><span class="muted">Opening and closing balances carry over from earlier years.</span>`;
  } else if(dashState.view==='daily'){
    host.innerHTML=`<div class="field"><label>From</label><input type="date" id="dash_from" value="${dashState.from}" onchange="dashRangeChanged()"></div>
      <div class="field"><label>To</label><input type="date" id="dash_to" value="${dashState.to}" onchange="dashRangeChanged()"></div>
      <div class="field"><label>&nbsp;</label><div class="inline-add" style="flex-wrap:wrap;">
        <button class="btn outline sm" onclick="dashPreset('this')">This Month</button>
        <button class="btn outline sm" onclick="dashPreset('last')">Last Month</button>
        <button class="btn outline sm" onclick="dashPreset('30')">Last 30 Days</button>
        <button class="btn outline sm" onclick="dashPreset('all')">All Dates</button>
      </div></div>`;
  } else {
    host.innerHTML='<span class="muted">Live totals across every stock entry, by current status and item code.</span>';
  }
}
function dashRenderBody(){
  const host=document.getElementById('dashBody'); if(!host) return;
  const data=dashCollect(), m=dashBuild(dashState.view,data);
  const warn=(m.ledger&&data.undated)?`<div class="dash-warn">${dashEsc(dashUndatedMsg(data))}</div>`:'';
  const charts=(m.empty&&m.ledger)?`<div class="empty">${dashEsc(m.emptyMsg)}</div>`:m.charts(dashWidth());
  host.innerHTML=warn+dashKpiHtml(m.kpis)
    +`<div class="panel"><h2>${dashEsc(m.chartsTitle)}</h2>${charts}</div>`
    +`<div class="panel"><h2>${dashEsc(m.tableTitle)}</h2>${dashTableHtml(m)}<p class="dash-note">${dashEsc(m.note)}</p></div>`;
}
function renderDashboard(){
  const data=dashCollect();
  if(!dashState.inited){
    const ref=data.maxDate||dashLocalYmd(new Date());
    dashState.from=ref.slice(0,7)+'-01'; dashState.to=dashMonthEnd(ref.slice(0,7)); dashState.inited=true;
  }
  dashRenderTabs(); dashRenderFilters(data); dashRenderBody();
}

/* ---------- daily range controls ---------- */
function dashSetRange(f,t){
  if(f>t){ const x=f; f=t; t=x; }
  if(dashDaysBetween(f,t)>365){ f=dashAddDays(t,-365); toast('Daily view is limited to 366 days — showing the latest 366 days of the range.'); }
  dashState.from=f; dashState.to=t;
  const a=document.getElementById('dash_from'), b=document.getElementById('dash_to');
  if(a) a.value=f;
  if(b) b.value=t;
  dashRenderBody();
}
function dashRangeChanged(){
  const f=document.getElementById('dash_from').value, t=document.getElementById('dash_to').value;
  if(!f||!t){ toast('Pick both From and To dates'); return; }
  dashSetRange(f,t);
}
function dashPreset(kind){
  const data=dashCollect(), now=new Date(), ty=now.getFullYear(), tm=now.getMonth();
  let f,t;
  if(kind==='this'){ f=dashLocalYmd(new Date(ty,tm,1)); t=dashLocalYmd(new Date(ty,tm+1,0)); }
  else if(kind==='last'){ f=dashLocalYmd(new Date(ty,tm-1,1)); t=dashLocalYmd(new Date(ty,tm,0)); }
  else if(kind==='30'){ t=dashLocalYmd(now); f=dashAddDays(t,-29); }
  else { f=data.minDate||dashLocalYmd(now); t=data.maxDate||dashLocalYmd(now); }
  dashSetRange(f,t);
}

/* ---------- print ---------- */
function dashPrintHtml(m,data){
  const warn=(m.ledger&&data.undated)?`<p class="dash-note">${dashEsc(dashUndatedMsg(data))}</p>`:'';
  return `<div class="dash-print">${dashKpiHtml(m.kpis)}`
    +(m.empty&&m.ledger?'':`<div class="dash-block"><div class="dash-sec">${dashEsc(m.chartsTitle)}</div>${m.charts(1000)}</div>`)
    +`<div class="dash-sec${m.empty&&m.ledger?'':' dash-tbl'}">${dashEsc(m.tableTitle)}</div>${dashTableHtml(m)}<p class="dash-note">${dashEsc(m.note)}</p>${warn}</div>`;
}
function dashPrintModel(m,data){
  const st=document.createElement('style');
  st.textContent='@page{size:A4 landscape;margin:10mm;}';
  st.setAttribute('data-keep-page','1');
  document.head.appendChild(st);
  printGeneric(m.title,dashPrintHtml(m,data),m.sub);
  setTimeout(()=>st.remove(),1500);
}
function dashPrint(){
  const data=dashCollect(), m=dashBuild(dashState.view,data);
  if(m.empty){ toast('Nothing to print yet'); return; }
  dashPrintModel(m,data);
}
/* ---------- month wise (daily breakdown of one month) ---------- */
function dashBuildMonthDetail(data,ym){
  const m=dashBuildDaily(data,{from:ym+'-01',to:dashMonthEnd(ym)}), lb=dashMonthLabel(ym);
  m.title='Monthly Report - '+lb;
  m.sub='Dashboard — Month Wise Stock & Dispatch — '+lb;
  m.chartsTitle='Daily Stock In vs Dispatched — '+lb;
  m.tableTitle='Daily Register — '+lb;
  return m;
}
function dashSelectedMonthModel(){
  const ym=document.getElementById('dash_printMonth')?.value;
  if(!ym){ toast('Select a month first'); return null; }
  const data=dashCollect(), m=dashBuildMonthDetail(data,ym);
  if(m.empty){ toast('No stock entries or dispatches in '+dashMonthLabel(ym)); return null; }
  return {m,data,ym};
}
function dashPrintMonth(){
  const r=dashSelectedMonthModel(); if(!r) return;
  dashPrintModel(r.m,r.data);
}

/* ---------- PDF (jsPDF + autoTable, charts rasterised from the SVG) ---------- */
function dashPdfSan(s){ return String(s==null?'':s).replace(/[\u2212\u2013\u2014]/g,'-').replace(/[^\x20-\x7E\u00A0-\u00FF]/g,''); }
function dashSvgToPng(svg){
  return new Promise(res=>{
    const vb=svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
    if(!vb){ res(null); return; }
    const w=+vb[1], h=+vb[2], sc=2;
    const s2=svg.replace('<svg ','<svg width="'+w+'" height="'+h+'" ');
    const img=new Image();
    img.onload=()=>{
      try{
        const cv=document.createElement('canvas'); cv.width=w*sc; cv.height=h*sc;
        const cx=cv.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,cv.width,cv.height);
        cx.drawImage(img,0,0,cv.width,cv.height);
        res({data:cv.toDataURL('image/png'),w,h});
      }catch(e){ res(null); }
    };
    img.onerror=()=>res(null);
    img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s2);
  });
}
async function dashPdfBuild(models,data,fileName){
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const PW=doc.internal.pageSize.getWidth(), PH=doc.internal.pageSize.getHeight(), M=10;
  const sec=(t,y)=>{ doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(15,61,62); doc.text(dashPdfSan(t),PW/2,y,{align:'center'}); doc.setTextColor(0); doc.setFont('helvetica','normal'); };
  for(let mi=0;mi<models.length;mi++){
    const m=models[mi];
    if(mi>0) doc.addPage();
    const hy=pdfHead(doc,m.sub,'Date: '+todayStr());
    // KPI strip
    doc.autoTable({
      startY:hy, margin:{left:M,right:M},
      head:[m.kpis.map(k=>dashPdfSan(k.label))],
      body:[m.kpis.map(k=>dashPdfSan('Total Qty: '+k.value+' kg\n'+(k.sub||'')))],
      theme:'grid', styles:{fontSize:8.5,halign:'center',cellPadding:2.5},
      headStyles:{fillColor:[15,61,62],fontSize:8}, bodyStyles:{fontStyle:'bold',textColor:[15,61,62]}
    });
    let y=doc.lastAutoTable.finalY+8;
    if(m.ledger&&m.empty){
      doc.setFontSize(10); doc.text(dashPdfSan(m.emptyMsg),PW/2,y,{align:'center'}); continue;
    }
    // charts
    sec(m.chartsTitle,y); y+=4;
    const svgs=(m.charts(1000).match(/<svg[\s\S]*?<\/svg>/g)||[]);
    for(const svg of svgs){
      const png=await dashSvgToPng(svg); if(!png) continue;
      let w=Math.min(PW-2*M, png.w<=400?110:270), h=w*png.h/png.w;
      if(h>150){ h=150; w=h*png.w/png.h; }
      if(y+h>PH-12){ doc.addPage(); y=14; }
      doc.addImage(png.data,'PNG',(PW-w)/2,y,w,h); y+=h+4;
    }
    // table
    if(y>PH-45){ doc.addPage(); y=14; }
    sec(m.tableTitle,y+4);
    const fmtV=(v,f)=> f==='k'?dashKg(v) : f==='i'?dashInt(v) : dashPdfSan(v);
    const body=m.rows.map(r=>r.map((v,i)=>fmtV(v,m.fmt[i])));
    if(m.total) body.push(m.total.map((v,i)=>fmtV(v,i===0?'t':m.fmt[i])));
    pdfTable(doc,y+7,[m.headers.map(dashPdfSan)],body,{totalLast:!!m.total,fontSize:m.headers.length>9?7:8.5});
    y=doc.lastAutoTable.finalY+5;
    doc.setFontSize(8); doc.setTextColor(90);
    let note=m.note+((m.ledger&&data.undated)?' '+dashUndatedMsg(data):'');
    const lines=doc.splitTextToSize(dashPdfSan(note),PW-2*M);
    if(y+lines.length*3.6>PH-10){ doc.addPage(); y=14; }
    doc.text(lines,PW/2,y,{align:'center'}); doc.setTextColor(0);
  }
  pdfFoot(doc);
  doc.save(fileName+'_'+todayStr()+'.pdf');
  toast('PDF exported');
}
function dashPdfView(){
  const data=dashCollect(), m=dashBuild(dashState.view,data);
  if(m.empty){ toast('Nothing to export yet'); return; }
  const base='Dashboard_'+({overall:'Overall',monthly:'Monthly',daily:'Daily'}[m.view])
    +(m.view==='daily'?'_'+m.from+'_to_'+m.to:(m.view==='monthly'&&m.year?'_'+m.year:''));
  dashPdfBuild([m],data,base).catch(e=>{ console.error(e); toast('PDF export failed'); });
}
function dashPdfFull(){
  const data=dashCollect();
  if(!data.coils.length){ toast('Nothing to export yet'); return; }
  const models=[dashBuildOverall(data)];
  const mo=dashBuildMonthly(data,true); if(!mo.empty) models.push(mo);
  dashPdfBuild(models,data,'Dashboard_Overall').catch(e=>{ console.error(e); toast('PDF export failed'); });
}
function dashPdfMonth(){
  const r=dashSelectedMonthModel(); if(!r) return;
  dashPdfBuild([r.m],r.data,'Dashboard_Month_'+r.ym).catch(e=>{ console.error(e); toast('PDF export failed'); });
}

/* ---------- Excel ---------- */
function dashWriteWorkbook(sheets,fileBase){
  const wb=XLSX.utils.book_new(); let count=0;
  sheets.forEach(s=>{
    if(!s.rows.length) return;
    const body=s.rows.concat(s.total?[s.total]:[]).map(r=>r.map(v=>typeof v==='number'?dashR3(v):v));
    const ws=buildHeaderedSheet(s.sub,s.headers,body);
    body.forEach((r,ri)=>r.forEach((v,ci)=>{
      const cell=ws[XLSX.utils.encode_cell({r:4+ri,c:ci})];
      if(cell&&typeof cell.v==='number'){
        if(s.fmt[ci]==='k') cell.z='#,##0.000';
        else if(s.fmt[ci]==='i') cell.z='#,##0';
      }
    }));
    ws['!cols']=s.headers.map((h,ci)=>{
      let w=String(h).length;
      body.forEach(r=>{ w=Math.max(w,String(r[ci]==null?'':r[ci]).length); });
      return {wch:Math.min(40,Math.max(12,w+2))};
    });
    XLSX.utils.book_append_sheet(wb,ws,s.name); count++;
  });
  if(!count){ toast('No data to export'); return; }
  XLSX.writeFile(wb,fileBase+'_'+todayStr()+'.xlsx');
  toast('Excel exported');
}
function dashExportView(){
  const data=dashCollect(), m=dashBuild(dashState.view,data);
  const base='Dashboard_'+({overall:'Overall',monthly:'Monthly',daily:'Daily'}[m.view])
    +(m.view==='daily'?'_'+m.from+'_to_'+m.to:(m.view==='monthly'&&m.year?'_'+m.year:''));
  dashWriteWorkbook(m.sheets,base);
}
function dashExportFull(){
  const data=dashCollect();
  let sheets=dashBuildOverall(data).sheets.concat(dashBuildMonthly(data,true).sheets);
  if(data.minDate) sheets=sheets.concat(dashBuildDaily(data,{from:data.minDate,to:data.maxDate}).sheets);
  dashWriteWorkbook(sheets,'Dashboard_Full');
}

/* ---------- wiring ---------- */
document.querySelectorAll('#dashTabs button').forEach(b=>{
  b.onclick=()=>{ dashState.view=b.dataset.dview; renderDashboard(); };
});
let dashResizeT;
window.addEventListener('resize',()=>{
  clearTimeout(dashResizeT);
  dashResizeT=setTimeout(()=>{ const p=document.getElementById('page-dashboard'); if(p&&p.classList.contains('active')) dashRenderBody(); },200);
});

/* ============================================================
   BOOT
============================================================ */
renderHome();
