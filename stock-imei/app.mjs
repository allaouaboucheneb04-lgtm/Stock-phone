import { normalizeImei, isValidImei, extractImeis, money, inventorySummary, csvEncode, validatePhoneDraft } from './core.mjs';
import { listData, commitChange, restoreData } from './db.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { phones: [], events: [], view: 'home', filter: 'all', query: '', brand: '', eventFilter: 'all', eventQuery: '', photo: '', editingId: null, detailId: null, saleId: null, scanner: null, scanning: false, scanningStart: false, scanOrigin: 'general', scanLocked: false, toastTimer: null };

function esc(input = '') { return String(input ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function dateText(raw) { if (!raw) return '—'; const d = new Date(raw); return Number.isNaN(d.valueOf()) ? '—' : new Intl.DateTimeFormat('fr-CA', { dateStyle:'medium', timeStyle:'short' }).format(d); }
function todayDateText() { return new Intl.DateTimeFormat('fr-CA', {day:'numeric',month:'long',year:'numeric'}).format(new Date()); }
function uuid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function statusText(status) { return ({stock:'En stock',reserve:'Réservé',sold:'Vendu'})[status] || status; }
function phoneLabel(phone) { return `${phone.brand} ${phone.model}${phone.capacity ? ` · ${phone.capacity}` : ''}`; }
function phoneAvatar(phone) { const src = typeof phone.photo === 'string' && /^data:image\/(jpeg|jpg|png|webp);base64,/.test(phone.photo) ? `<img src="${phone.photo}" alt="Photo du téléphone">` : '<svg><use href="#i-phone"/></svg>'; return `<span class="phone-avatar">${src}</span>`; }
function showToast(message, error = false) { const node=$('#toast'); node.textContent=message; node.classList.toggle('error',error); node.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer=setTimeout(()=>node.classList.remove('show'),3400); }
function dialogOpen(name) { const dialog=$(`#${name}`); if (!dialog.open) dialog.showModal(); }
function dialogClose(name) { const dialog=$(`#${name}`); if (dialog?.open) dialog.close(); }

async function reload() {
  const result = await listData();
  state.phones=result.phones.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  state.events=result.events.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  render();
}
function render() { renderDashboard(); renderInventory(); renderHistory(); }
function renderDashboard() {
  const summary=inventorySummary(state.phones);
  $('#stat-stock').textContent=summary.stock;
  $('#stat-reserved').textContent=summary.reserved;
  $('#stat-sold').textContent=summary.sold;
  $('#stat-value').textContent=money(summary.costValue);
  $('#today-label').textContent=todayDateText();
  const latest=state.phones.slice(0,5);
  $('#recent-phones').innerHTML=latest.length ? latest.map(phone=>`<button class="recent-item" type="button" data-phone-id="${esc(phone.id)}">${phoneAvatar(phone)}<span class="recent-info"><strong>${esc(phoneLabel(phone))}</strong><small>IMEI : ${esc(phone.imei)}</small></span><span class="recent-trail"><b>${money(phone.listPrice)}</b><span class="status-badge ${esc(phone.status)}">${esc(statusText(phone.status))}</span></span></button>`).join('') : emptyHTML('Aucun téléphone enregistré','Commence par scanner l’IMEI de ton premier appareil.', true);
}
function emptyHTML(title, subtitle, addButton=false) { return `<div class="empty-state"><span class="empty-icon"><svg><use href="#i-package"/></svg></span><h3>${esc(title)}</h3><p>${esc(subtitle)}</p>${addButton ? '<button type="button" class="btn btn-dark" data-action="create"><svg><use href="#i-plus"/></svg>Ajouter un téléphone</button>' : ''}</div>`; }
function renderInventory() {
  const summary=inventorySummary(state.phones);
  for (const [name,count] of Object.entries({all:summary.all,stock:summary.stock,reserve:summary.reserved,sold:summary.sold})) $(`#count-${name}`).textContent=count;
  const brandNode=$('#brand-filter'); const oldBrand=state.brand;
  const brands=[...new Set(state.phones.map(p=>p.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
  brandNode.innerHTML='<option value="">Toutes les marques</option>'+brands.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if (brands.includes(oldBrand)) brandNode.value=oldBrand; else state.brand='';
  const query=state.query.trim().toLocaleLowerCase('fr');
  const list=state.phones.filter(p => (state.filter==='all'||p.status===state.filter) && (!state.brand||p.brand===state.brand) && (!query||[p.imei,p.imei2,p.brand,p.model,p.capacity,p.color,p.serial,p.supplier,p.location].some(v=>String(v||'').toLocaleLowerCase('fr').includes(query))));
  $('#inventory-count').textContent=`${list.length} téléphone${list.length===1?'':'s'} trouvé${list.length===1?'':'s'}`;
  $('#inventory-list').innerHTML=list.length ? list.map(p=>`<button class="inventory-item" type="button" data-phone-id="${esc(p.id)}">${phoneAvatar(p)}<span class="inventory-info"><strong>${esc(phoneLabel(p))}</strong><small>IMEI : ${esc(p.imei)}${p.color?' · '+esc(p.color):''}</small></span><span class="status-badge ${esc(p.status)}">${esc(statusText(p.status))}</span><span class="inventory-price"><strong>${money(p.status==='sold' ? p.salePrice : p.listPrice)}</strong><small>${p.status==='sold'?'Vendu à':'Prix affiché'}</small></span><svg class="inventory-chevron"><use href="#i-chevron"/></svg></button>`).join('') : emptyHTML('Aucun résultat',state.phones.length ? 'Essaie un autre filtre ou une autre recherche.' : 'Ton stock est vide pour le moment.',!state.phones.length);
}
function renderHistory() {
  const titles={entree:'Entrée en stock',vente:'Vente enregistrée',reservation:'Téléphone réservé',retour:'Retour en stock',modification:'Fiche modifiée',suppression:'Fiche supprimée'};
  const query=state.eventQuery.toLocaleLowerCase('fr').trim();
  const events=state.events.filter(e=>(state.eventFilter==='all'||e.type===state.eventFilter)&&(!query||[e.brand,e.model,e.imei,e.summary].some(v=>String(v||'').toLocaleLowerCase('fr').includes(query))));
  $('#history-list').innerHTML=events.length ? events.map(e=>`<div class="history-entry"><span class="event-icon ${esc(e.type)}"><svg><use href="#i-${e.type==='vente'?'check':e.type==='suppression'?'trash':e.type==='modification'?'edit':e.type==='entree'?'plus':'history'}"/></svg></span><div class="history-info"><strong>${esc(titles[e.type] || e.type)} — ${esc(`${e.brand} ${e.model}`)}</strong><small>IMEI ${esc(e.imei)}${e.summary?' · '+esc(e.summary):''}</small></div><span class="event-at">${esc(dateText(e.at))}</span></div>`).join('') : emptyHTML('Aucun mouvement','Les entrées, réservations et ventes apparaîtront ici.');
}
function setView(name) {
  state.view=name;
  $$('.view').forEach(node => node.hidden=node.id!==`view-${name}`);
  $$('[data-nav]').forEach(node=>{node.classList.toggle('active',node.dataset.nav===name); if (node.dataset.nav===name) node.setAttribute('aria-current','page'); else node.removeAttribute('aria-current');});
  const breadcrumbs={home:'Vue d’ensemble',inventory:'Inventaire',history:'Mouvements',settings:'Paramètres'};
  $('#breadcrumb').innerHTML=`Stock IMEI <span> / </span> ${breadcrumbs[name]}`;
  window.scrollTo({top:0,behavior:'instant'});
}
function formValue(id) { return $(`#form-${id}`).value.trim(); }
function clearFormError() { $('#form-error').hidden=true; }
function openCreate(imei='', imei2='') {
  state.editingId=null; state.photo='';
  $('#phone-form').reset();$('#form-id').value='';
  $('#phone-dialog-title').textContent='Ajouter un téléphone';$('#phone-submit').textContent='Enregistrer le téléphone';
  $('#form-imei').readOnly=false;
  $('#form-imei').value=imei;$('#form-imei2').value=imei2;
  $('#photo-preview').hidden=true;$('#photo-label').textContent='Ajouter une photo du téléphone';
  clearFormError(); dialogOpen('phone-dialog');
  if (!imei) setTimeout(()=>$('#form-imei').focus(),50);
}
function openEdit(phone) {
  state.editingId=phone.id;state.photo=phone.photo||'';
  $('#phone-form').reset();
  for(const [id,key] of Object.entries({imei:'imei',imei2:'imei2',brand:'brand',model:'model',capacity:'capacity',color:'color',condition:'condition',serial:'serial',cost:'purchasePrice',price:'listPrice',supplier:'supplier',location:'location',notes:'notes'})) $(`#form-${id}`).value=phone[key]??'';
  $('#form-id').value=phone.id;
  $('#phone-dialog-title').textContent='Modifier la fiche';$('#phone-submit').textContent='Enregistrer les modifications';
  // IMEI can be corrected on edit, with global duplicate validation.
  $('#form-imei').readOnly=false;
  $('#photo-preview').hidden=!state.photo;
  if (state.photo) $('#photo-preview').src=state.photo;
  $('#photo-label').textContent=state.photo?'Modifier la photo':'Ajouter une photo du téléphone';
  clearFormError();dialogOpen('phone-dialog');
}
async function saveForm(event) {
  event.preventDefault();
  const draft={imei:normalizeImei(formValue('imei')),imei2:normalizeImei(formValue('imei2')),brand:formValue('brand'),model:formValue('model'),capacity:formValue('capacity'),color:formValue('color'),condition:formValue('condition'),serial:formValue('serial'),purchasePrice:Number(formValue('cost')||0),listPrice:Number(formValue('price')||0),supplier:formValue('supplier'),location:formValue('location'),notes:formValue('notes'),photo:state.photo};
  const error=validatePhoneDraft(draft,state.phones,state.editingId);
  if(error){$('#form-error').hidden=false;$('#form-error').textContent=error;$('#form-error').scrollIntoView({block:'nearest'});return;}
  const old=state.phones.find(p=>p.id===state.editingId);
  const now=new Date().toISOString();
  const phone={...(old||{}),...draft,id:old?.id||uuid(),status:old?.status||'stock',createdAt:old?.createdAt||now,updatedAt:now};
  const evt={id:uuid(),phoneId:phone.id,type:old?'modification':'entree',at:now,brand:phone.brand,model:phone.model,imei:phone.imei,summary:old?'Données de la fiche mises à jour':'Ajout au stock'};
  const button=$('#phone-submit');button.disabled=true;
  try{await commitChange(phone,evt);dialogClose('phone-dialog');await reload();showToast(old?'Téléphone modifié.':'Téléphone ajouté au stock.');}
  catch(e){$('#form-error').hidden=false;$('#form-error').textContent=e?.name==='ConstraintError'?'Cet IMEI est déjà enregistré.':`Erreur de sauvegarde : ${e.message}`;}
  finally{button.disabled=false;}
}
function openDetail(phone) {
  state.detailId=phone.id;
  $('#detail-title').textContent='Détails du téléphone';
  const fields=[['IMEI principal',`<span class="detail-imei">${esc(phone.imei)}<button class="copy-imei" data-copy-imei="${esc(phone.imei)}" type="button">Copier</button></span>`],['IMEI secondaire',esc(phone.imei2||'—')],['Numéro de série',esc(phone.serial||'—')],['Capacité',esc(phone.capacity||'—')],['Couleur',esc(phone.color||'—')],['État',esc(({neuf:'Neuf',occasion:'Occasion',reconditionne:'Reconditionné'})[phone.condition]||'—')],['Prix d’achat',money(phone.purchasePrice)],['Prix affiché',money(phone.listPrice)],['Prix de vente réel',phone.status==='sold'?money(phone.salePrice):'—'],['Fournisseur',esc(phone.supplier||'—')],['Emplacement',esc(phone.location||'—')],['Ajouté le',esc(dateText(phone.createdAt))]];
  const timeline=state.events.filter(e=>e.phoneId===phone.id).slice(0,5);
  $('#detail-content').innerHTML=`<div class="detail-hero"><span class="detail-image">${phone.photo && /^data:image\/(jpeg|jpg|png|webp);base64,/.test(phone.photo)?`<img alt="Téléphone" src="${phone.photo}">`:'<svg><use href="#i-phone"/></svg>'}</span><div><h3>${esc(phoneLabel(phone))}</h3><span class="status-badge ${esc(phone.status)}">${esc(statusText(phone.status))}</span><br><small>${esc(phone.color||'')} ${phone.condition?'· '+esc(phone.condition):''}</small></div></div><div class="detail-grid">${fields.map(([label,value])=>`<div class="detail-cell"><small>${label}</small><strong>${value}</strong></div>`).join('')}</div>${phone.notes?`<div class="detail-cell" style="margin-top:23px"><small>Notes</small><strong class="detail-notes">${esc(phone.notes)}</strong></div>`:''}${timeline.length?`<div class="detail-cell" style="margin-top:23px"><small>Derniers mouvements</small>${timeline.map(e=>`<p style="font-size:11px;margin:6px 0;color:#52646b">${esc(dateText(e.at))} · ${esc(e.summary||e.type)}</p>`).join('')}</div>`:''}`;
  $('#detail-actions').innerHTML=`<button type="button" class="btn btn-outline" data-detail-action="edit"><svg><use href="#i-edit"/></svg>Modifier</button>${phone.status==='stock'?'<button type="button" class="btn btn-outline" data-detail-action="reserve">Réserver</button>':''}${phone.status==='reserve'||phone.status==='sold'?'<button type="button" class="btn btn-outline" data-detail-action="return">Remettre en stock</button>':''}${phone.status!=='sold'?'<button type="button" class="btn btn-dark" data-detail-action="sell">Vendre</button>':''}<button type="button" class="btn btn-danger" data-detail-action="delete" title="Supprimer cette fiche"><svg><use href="#i-trash"/></svg></button>`;
  dialogOpen('detail-dialog');
}
async function updateStatus(phone,newStatus,type,summary,extra={}) {
  const now=new Date().toISOString();const updated={...phone,...extra,status:newStatus,updatedAt:now};
  const evt={id:uuid(),phoneId:phone.id,type,at:now,brand:phone.brand,model:phone.model,imei:phone.imei,summary};
  await commitChange(updated,evt);dialogClose('detail-dialog');await reload();showToast(summary);
}
async function detailAction(action) {
  const phone=state.phones.find(p=>p.id===state.detailId);if(!phone)return;
  try{
    if(action==='edit'){dialogClose('detail-dialog');openEdit(phone);}
    if(action==='reserve'){await updateStatus(phone,'reserve','reservation','Téléphone réservé');}
    if(action==='return'){
      if(phone.status==='sold'&&!window.confirm('Confirmer le retour en stock ? La vente précédente restera dans l’historique.'))return;
      await updateStatus(phone,'stock','retour','Remis en stock',{salePrice:null,saleCustomer:''});
    }
    if(action==='sell'){
      state.saleId=phone.id;$('#sale-form').reset();$('#sale-phone-label').textContent=`${phoneLabel(phone)} · IMEI ${phone.imei}`;$('#sale-price').value=phone.listPrice||'';$('#sale-error').hidden=true;dialogClose('detail-dialog');dialogOpen('sale-dialog');
    }
    if(action==='delete'){
      if(!window.confirm(`Supprimer définitivement la fiche ${phone.brand} ${phone.model} (IMEI ${phone.imei}) ? Cette suppression restera inscrite dans l’historique.`))return;
      const now=new Date().toISOString();await commitChange(phone,{id:uuid(),phoneId:phone.id,type:'suppression',at:now,brand:phone.brand,model:phone.model,imei:phone.imei,summary:'Fiche supprimée'},true);
      dialogClose('detail-dialog');await reload();showToast('Fiche supprimée.');
    }
  } catch(error){showToast(error?.message||'Une erreur est survenue.',true);}
}
async function saveSale(event) {
  event.preventDefault();
  const phone=state.phones.find(p=>p.id===state.saleId);if(!phone)return;
  const price=Number($('#sale-price').value);
  if(!Number.isFinite(price)||price<0){$('#sale-error').textContent='Indique un prix de vente valide.';$('#sale-error').hidden=false;return;}
  const button=$('#sale-form button[type="submit"]');button.disabled=true;
  try{
    await updateStatus(phone,'sold','vente',`Vendu ${money(price)}`,{salePrice:price,saleCustomer:$('#sale-customer').value.trim(),soldAt:new Date().toISOString()});
    dialogClose('sale-dialog');
  }catch(error){$('#sale-error').textContent=error.message;$('#sale-error').hidden=false;}
  finally{button.disabled=false;}
}
async function processPhoto(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {showToast('Choisis une image.',true);return;}
  if (file.size>15*1024*1024) {showToast('Image trop volumineuse (max 15 Mo).',true);return;}
  try {
    const uri=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)});
    const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Impossible de lire cette image.'));img.src=uri;});
    const scale=Math.min(1,650/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);
    state.photo=canvas.toDataURL('image/jpeg',.75);
    $('#photo-preview').src=state.photo;$('#photo-preview').hidden=false;$('#photo-label').textContent='Photo ajoutée — toucher pour remplacer';
  }catch(e){showToast('Impossible de traiter la photo.',true);}
}
function download(text,mime,filename) {
  const blob=new Blob([text],{type:mime});const href=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=href;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(href),5000);
}
function exportJSON() {
  const payload={schemaVersion:1,app:'Stock IMEI',exportedAt:new Date().toISOString(),phones:state.phones,events:state.events};
  download(JSON.stringify(payload,null,2),'application/json',`sauvegarde-stock-imei-${new Date().toISOString().slice(0,10)}.json`);
  showToast('Sauvegarde créée. Conserve-la en lieu sûr.');
}
function exportCSV() {
  const header=['IMEI','IMEI 2','Marque','Modèle','Capacité','Couleur','État','Statut','Coût achat CAD','Prix affiché CAD','Prix vendu CAD','Série','Fournisseur','Emplacement','Notes','Date ajout','Date vente'];
  const rows=state.phones.map(p=>[p.imei,p.imei2,p.brand,p.model,p.capacity,p.color,p.condition,statusText(p.status),p.purchasePrice,p.listPrice,p.salePrice,p.serial,p.supplier,p.location,p.notes,p.createdAt,p.soldAt]);
  download('\ufeff'+csvEncode([header,...rows]),'text/csv;charset=utf-8',`inventaire-imei-${new Date().toISOString().slice(0,10)}.csv`);showToast('Inventaire CSV exporté.');
}
async function importJSON(file) {
  if(!file)return;
  try {
    if(file.size>75*1024*1024)throw Error('Le fichier est trop volumineux.');
    const raw=JSON.parse(await file.text());
    if(raw?.schemaVersion!==1||!Array.isArray(raw.phones)||!Array.isArray(raw.events))throw Error('Format de sauvegarde non reconnu.');
    const imeis=new Set(),ids=new Set(),eventIds=new Set();
    for(const p of raw.phones) {
      if(!p||typeof p!=='object'||!p.id||!isValidImei(p.imei)||!['stock','reserve','sold'].includes(p.status)||typeof p.brand!=='string'||typeof p.model!=='string')throw Error('La sauvegarde contient un téléphone invalide.');
      if(ids.has(p.id))throw Error('Identifiants dupliqués dans la sauvegarde.');ids.add(p.id);
      for(const value of [p.imei,p.imei2].filter(Boolean)) {if(!isValidImei(value)||imeis.has(value))throw Error('IMEI invalide ou dupliqué dans la sauvegarde.');imeis.add(value);}
      if(p.photo && (typeof p.photo !=='string'||!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(p.photo)))throw Error('Photo invalide.');
    }
    for(const e of raw.events){if(!e||typeof e!=='object'||!e.id||typeof e.at!=='string'||eventIds.has(e.id))throw Error('Historique invalide.');eventIds.add(e.id);}
    if(!window.confirm(`Restaurer ${raw.phones.length} téléphones et ${raw.events.length} mouvements ? Toutes les données actuellement présentes sur cet appareil seront remplacées.`))return;
    await restoreData(raw.phones,raw.events);await reload();setView('inventory');showToast('Sauvegarde restaurée avec succès.');
  }catch(error){showToast(`Importation impossible : ${error.message}`,true);}
  finally{$('#restore-file-input').value='';}
}

function scanStatus(text, error=false) { const msg=$('#scan-message');msg.textContent=text;msg.style.color=error?'#c85f52':'#78919a'; }
let scannerLibPromise;
function tryScript(url) {return new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=url;script.onload=resolve;script.onerror=()=>{script.remove();reject(new Error('Chargement impossible'))};document.head.appendChild(script);});}
async function loadScannerLib() {
  if(globalThis.Html5Qrcode)return;
  if(!scannerLibPromise)scannerLibPromise=(async()=>{
    const urls=['https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js','https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'];
    for(const url of urls){try{await tryScript(url);if(globalThis.Html5Qrcode)return;}catch{ /* Try second source. */ }}
    throw Error('Le module de scan n’est pas accessible. Vérifie ta connexion Internet.');
  })();
  try{await scannerLibPromise;}catch(e){scannerLibPromise=null;throw e;}
}
function makeScanner() {
  const formats=globalThis.Html5QrcodeSupportedFormats;
  return new globalThis.Html5Qrcode('scanner-viewport', {formatsToSupport:[formats.QR_CODE,formats.DATA_MATRIX,formats.CODE_128,formats.CODE_39,formats.PDF_417,formats.EAN_13]},false);
}
async function stopScanner() {
  state.scanLocked=true;
  const instance=state.scanner;
  state.scanner=null;state.scanning=false;state.scanningStart=false;
  if(!instance)return;
  try{if(instance.isScanning)await instance.stop();}catch{/* Already stopped */}
  try{instance.clear();}catch{/* Element may have been detached. */}
}
async function openScanner(origin='general') {
  state.scanOrigin=origin;state.scanLocked=false;$('#manual-imei').value='';dialogOpen('scan-dialog');
  await startScanner();
}
async function startScanner() {
  if(state.scanning||state.scanningStart)return;
  state.scanLocked=false;state.scanningStart=true;
  scanStatus('Initialisation de la caméra…');
  try{
    if(!globalThis.isSecureContext)throw Error('Le scanner nécessite une adresse HTTPS.');
    if(!navigator.mediaDevices?.getUserMedia)throw Error('La caméra n’est pas accessible dans ce navigateur. Essaie Safari.');
    await loadScannerLib();
    if(!$('#scan-dialog').open){state.scanningStart=false;return;}
    // Ensure previous instance has released the camera.
    if(state.scanner)await stopScanner();
    state.scanLocked=false;
    const scanner=makeScanner();state.scanner=scanner;
    const config={fps:10,qrbox:(w,h)=>({width:Math.max(160,Math.min(290,Math.round(w*.85))),height:Math.max(100,Math.min(185,Math.round(h*.7)))}),disableFlip:true};
    try{await scanner.start({facingMode:'environment'},config,onCodeFound,()=>{});}
    catch(error){
      const cameras=await globalThis.Html5Qrcode.getCameras();
      if(!cameras?.length)throw error;
      const rear=cameras.find(c=>/back|rear|arrière|environment/i.test(c.label))||cameras[cameras.length-1];
      await scanner.start(rear.id,config,onCodeFound,()=>{});
    }
    state.scanning=true;scanStatus('Cadre le code IMEI sur la boîte du téléphone.');
  }catch(error){scanStatus(`${error.message||'Impossible de lancer le scanner.'} Tu peux entrer l’IMEI manuellement ou scanner une photo.`,true);}
  finally{state.scanningStart=false;}
}
async function onCodeFound(raw) {
  if(state.scanLocked)return;
  const found=extractImeis(raw);
  if(!found.length){scanStatus('Code détecté, mais aucun IMEI de 15 chiffres valide trouvé. Essaie le code marqué « IMEI ».',true);return;}
  state.scanLocked=true;
  await stopScanner();dialogClose('scan-dialog');
  resolveScan(found[0],found[1]||'');
}
function resolveScan(imei,imei2='') {
  if(!isValidImei(imei)){scanStatus('IMEI invalide. Vérifie les 15 chiffres.',true);showToast('IMEI invalide. Vérifie les 15 chiffres.',true);return;}
  if(state.scanOrigin==='form') {
    $('#form-imei').value=imei;if(imei2)$('#form-imei2').value=imei2;
    showToast('IMEI ajouté dans la fiche.');return;
  }
  const scanned=[imei,imei2].filter(Boolean);
  const existing=state.phones.find(p=>[p.imei,p.imei2].some(v=>v&&scanned.includes(v)));
  if(existing){openDetail(existing);showToast('Téléphone déjà présent dans le stock.');}
  else{openCreate(imei,imei2);showToast('Nouvel IMEI détecté : complète sa fiche.');}
}
async function scanImage(file) {
  if(!file)return;
  try{
    scanStatus('Analyse de la photo…');
    await loadScannerLib();
    await stopScanner();
    const scanner=makeScanner();state.scanner=scanner;
    const result=await scanner.scanFile(file,true);
    const found=extractImeis(result);
    if(found.length){await stopScanner();dialogClose('scan-dialog');resolveScan(found[0],found[1]||'');}
    else{scanStatus('Aucun IMEI valide sur cette photo. Prends une photo plus nette du code IMEI.',true);}
  }catch(error){scanStatus(`Impossible de lire le code sur cette photo : ${error?.message||'réessaie'}.`,true);}
  finally{$('#scan-image-input').value='';}
}
function wire() {
  $$('[data-nav]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.nav)));
  for(const sel of ['#top-add','#home-add','#quick-add','#inventory-add']) $(sel).addEventListener('click',()=>openCreate());
  for(const sel of ['#home-scan','#quick-scan','#bottom-scan']) $(sel).addEventListener('click',()=>openScanner());
  $('#see-inventory').addEventListener('click',()=>setView('inventory'));
  $('#quick-export').addEventListener('click',exportJSON);
  $('#export-json').addEventListener('click',exportJSON);
  $('#export-csv').addEventListener('click',exportCSV);
  $('#import-json').addEventListener('click',()=>$('#restore-file-input').click());
  $('#restore-file-input').addEventListener('change',e=>importJSON(e.target.files?.[0]));
  $('#form-photo').addEventListener('change',e=>processPhoto(e.target.files?.[0]));
  $('#phone-form').addEventListener('submit',saveForm);
  $('#sale-form').addEventListener('submit',saveSale);
  $('#form-scan').addEventListener('click',()=>openScanner('form'));
  $('#scan-retry').addEventListener('click',async()=>{await stopScanner();await startScanner();});
  $('#scan-photo').addEventListener('click',()=>$('#scan-image-input').click());
  $('#scan-image-input').addEventListener('change',e=>scanImage(e.target.files?.[0]));
  $('#scan-manual-form').addEventListener('submit',async e=>{e.preventDefault();const imei=normalizeImei($('#manual-imei').value);if(!isValidImei(imei)){scanStatus('IMEI invalide : 15 chiffres avec clé de contrôle correcte.',true);return;}await stopScanner();dialogClose('scan-dialog');resolveScan(imei);});
  $('#scan-dialog').addEventListener('close',stopScanner);
  $$('[data-close]').forEach(b=>b.addEventListener('click',()=>dialogClose(b.dataset.close)));
  $$('.modal').forEach(d=>d.addEventListener('click',e=>{if(e.target===d)dialogClose(d.id)}));
  $('#search-input').addEventListener('input',e=>{state.query=e.target.value;renderInventory();});
  $('#brand-filter').addEventListener('change',e=>{state.brand=e.target.value;renderInventory();});
  $$('.filter-chip').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.filter;$$('.filter-chip').forEach(n=>n.classList.toggle('active',n===b));renderInventory();}));
  $('#event-filter').addEventListener('change',e=>{state.eventFilter=e.target.value;renderHistory();});
  $('#event-search').addEventListener('input',e=>{state.eventQuery=e.target.value;renderHistory();});
  document.addEventListener('click',e=>{
    const create=e.target.closest('[data-action="create"]');if(create){openCreate();return;}
    const phone=e.target.closest('[data-phone-id]');if(phone){const record=state.phones.find(p=>p.id===phone.dataset.phoneId);if(record)openDetail(record);return;}
    const action=e.target.closest('[data-detail-action]');if(action){detailAction(action.dataset.detailAction);return;}
    const copy=e.target.closest('[data-copy-imei]');if(copy){navigator.clipboard?.writeText(copy.dataset.copyImei).then(()=>showToast('IMEI copié.')).catch(()=>showToast('Copie impossible.',true));}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden && $('#scan-dialog').open)stopScanner();});
}
async function init() {
  wire();setView('home');
  try{await reload();}catch(error){showToast(`Stockage indisponible : ${error.message}`,true);console.error(error);}
  if('serviceWorker' in navigator && globalThis.isSecureContext)navigator.serviceWorker.register('./sw.js').catch(err=>console.warn('Service worker indisponible :',err));
}
init();