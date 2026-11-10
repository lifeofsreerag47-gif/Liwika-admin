import { auth, db, storage, persistenceReady } from './firebase-config.js';
import {
  onAuthStateChanged, signOut, updateProfile
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, serverTimestamp, Timestamp, runTransaction
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {
  ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject, listAll
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const page = document.body.dataset.page;
const root = $('#pageRoot');
const money = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n || 0));
const dateText = (v) => { const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null); return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; };
const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slugify = (v='') => String(v).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
let currentUser = null;
let currentPageData = [];
let toastTimer;
let orderNotificationsEnabled = false;
let orderNotificationSnapshotReady = false;

function toast(message, bad = false) {
  const el = $('#toast'); if (!el) return;
  el.textContent = message; el.style.borderColor = bad ? 'rgba(223,139,131,.4)' : '';
  el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}
function emptyState(title, detail, action = '') {
  return `<div class="empty-state"><div class="empty-symbol">◇</div><h3>${esc(title)}</h3><p>${esc(detail)}</p>${action}</div>`;
}
function pageHeader(title, desc, actions = '') {
  const meta = root.dataset;
  return `<div class="page-head"><div><p class="eyebrow">${esc(meta.eyebrow || 'LIWI-KA / ADMIN')}</p><h1>${esc(title)}</h1><p>${esc(desc)}</p></div><div class="page-actions">${actions}</div></div>`;
}
function panel(title, body, note='') {
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${note ? `<small>${esc(note)}</small>` : ''}</div>${body}</section>`;
}
function stat(label, value, note, cls='') {
  return `<article class="stat-card"><div class="stat-label">${esc(label)}</div><strong class="stat-value">${esc(value)}</strong><span class="stat-note ${cls}">${esc(note)}</span></article>`;
}
function statusBadge(value) {
  const s = String(value || 'unknown').toLowerCase();
  const cls = ['delivered','paid','published','active','visible','resolved','completed'].includes(s) ? 'success' : ['pending','processing','low','unread','pending_verification'].includes(s) ? 'warning' : ['cancelled','failed','hidden','rejected','out_of_stock'].includes(s) ? 'danger' : 'neutral';
  return `<span class="badge ${cls}">${esc(s.replaceAll('_',' ').toUpperCase())}</span>`;
}
async function readCollection(name, constraints = []) {
  const snap = await getDocs(query(collection(db, name), ...constraints));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function addLog(action, entityType, entityId='', details={}) {
  try { await addDoc(collection(db, 'activity_logs'), { action, entityType, entityId: String(entityId || ''), details, actorUid: currentUser.uid, actorName: currentUser.displayName || currentUser.phoneNumber || currentUser.email || 'Administrator', createdAt: serverTimestamp() }); }
  catch (e) { console.warn('Activity log could not be written', e); }
}
function openAdminDialog(title, body, subtitle='LIWI-KA / ADMIN') {
  const overlay=document.createElement('div'); overlay.className='admin-dialog-backdrop';
  overlay.innerHTML=`<section class="admin-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><div><p>${esc(subtitle)}</p><h2>${esc(title)}</h2></div><button type="button" class="admin-dialog-close" aria-label="Close">×</button></header><div class="admin-dialog-content">${body}</div></section>`;
  document.body.appendChild(overlay);
  let onKey;
  const close=()=>{overlay.remove();if(onKey)document.removeEventListener('keydown',onKey);};
  overlay.addEventListener('click',e=>{if(e.target===overlay||e.target.closest('.admin-dialog-close'))close();});
  onKey=e=>{if(e.key==='Escape')close();};
  document.addEventListener('keydown',onKey);
  return {element:overlay,close};
}
function table(headers, rows, emptyTitle, emptyDetail, emptyAction='') {
  if (!rows.length) return emptyState(emptyTitle, emptyDetail, emptyAction);
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function imageCell(p) {
  return p.imageUrl ? `<img class="table-thumb" src="${esc(p.imageUrl)}" alt="${esc(p.name)}" loading="lazy">` : `<span class="table-thumb empty">◇</span>`;
}
function productRow(p, mode='products') {
  const stock = Number(p.stock || 0);
  const status = p.isPublished && p.isVisible ? 'Published' : 'Hidden';
  const actions = mode === 'visibility'
    ? `<button class="btn btn-sm" data-action="toggle-product" data-id="${esc(p.id)}" data-value="${p.isVisible ? 'true':'false'}">${p.isVisible ? 'HIDE':'SHOW'}</button>`
    : `<div class="action-group"><a class="btn btn-sm" href="add-product.html?edit=${encodeURIComponent(p.id)}">EDIT</a><button class="btn btn-danger btn-sm" data-action="delete-product" data-id="${esc(p.id)}">DELETE</button></div>`;
  return `<tr data-row><td><div class="table-product">${imageCell(p)}<span>${esc(p.name || 'Untitled product')}<small class="cell-sub">${esc(p.flavour || p.category || '—')}</small></span></div></td><td>${esc(p.category || '—')}</td><td>${money(p.price)}</td><td>${stock <= 0 ? statusBadge('out_of_stock') : stock < 10 ? statusBadge('low') : stock}</td><td>${statusBadge(status)}</td><td>${actions}</td></tr>`;
}
function bindSearch() {
  const input = $('[data-search]'); if (!input) return;
  input.addEventListener('input', () => {
    const term = input.value.toLowerCase().trim();
    $$('[data-row]').forEach(row => row.hidden = !row.textContent.toLowerCase().includes(term));
  });
}

async function renderDashboard() {
  root.innerHTML = pageHeader('Good evening.','Here is the live picture of your Liwi-Ka store.', `<a class="btn btn-primary" href="add-product.html">＋ ADD PRODUCT</a>`) + `<div class="stats-grid"><div class="skeleton page-loading"></div><div class="skeleton page-loading"></div><div class="skeleton page-loading"></div><div class="skeleton page-loading"></div></div>`;
  const [products, orders, users, feedback, logs] = await Promise.all([
    readCollection('products'), readCollection('orders', [orderBy('createdAt','desc'), limit(150)]),
    readCollection('users', [limit(300)]), readCollection('feedback', [limit(150)]), readCollection('activity_logs', [orderBy('createdAt','desc'), limit(5)])
  ]);
  const paid = orders.filter(o => String(o.paymentStatus || '').toLowerCase() === 'paid');
  const revenue = paid.reduce((n,o)=>n+Number(o.total || o.amount || 0),0);
  const active = products.filter(p=>p.isVisible !== false && p.isPublished !== false).length;
    const recentRows = orders.slice(0,6).map(o=>`<tr><td><b>${esc(o.orderNumber || o.id.slice(0,8).toUpperCase())}</b></td><td>${esc(o.customerName || o.shippingAddress?.name || 'Customer')}</td><td>${(o.items||[]).length} items</td><td>${money(o.total)}</td><td>${statusBadge(o.status || 'pending')}</td></tr>`);
  const logHTML = logs.length ? logs.map(l=>`<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${esc(l.action || 'Store activity')}</strong><p>${esc(l.details?.summary || l.entityType || 'Updated store data')}</p></div><time>${esc(dateText(l.createdAt))}</time></div>`).join('') : emptyState('No activity yet','Actions performed in the admin panel will appear here.');
  root.innerHTML = pageHeader('Good evening.','Here is the live picture of your Liwi-Ka store.', `<a class="btn btn-primary" href="add-product.html">＋ ADD PRODUCT</a>`) +
    `<section class="stats-grid">${stat('REVENUE (RECENT ORDERS)',money(revenue),`${paid.length} paid orders`)}${stat('TOTAL ORDERS',orders.length,`${orders.filter(o=>String(o.status||'pending')==='pending').length} awaiting action`)}${stat('PUBLISHED PRODUCTS',active,`${products.length} total catalogue items`)}${stat('CUSTOMERS',users.length,`${feedback.length} feedback entries`)}</section>`+
    `<div class="layout-two">${panel('Recent orders',`<div class="table-wrap"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>ITEMS</th><th>TOTAL</th><th>STATUS</th></tr></thead><tbody>${recentRows.join('') || ''}</tbody></table></div>`, 'LATEST')}${panel('Store activity',`<div class="timeline">${logHTML}</div>`, 'AUDIT TRAIL')}</div>`+
    `<section class="panel" style="margin-top:14px"><div class="panel-head"><h2>Quick access</h2><small>STORE MANAGEMENT</small></div><div class="panel-body"><div class="shortcut-grid"><a class="shortcut-card" href="all-products.html"><b>▣ Products</b><small>Manage the catalogue</small></a><a class="shortcut-card" href="orders.html"><b>▤ Orders</b><small>Process customer purchases</small></a><a class="shortcut-card" href="analytics.html"><b>⌁ Analytics</b><small>Explore sales performance</small></a><a class="shortcut-card" href="settings.html"><b>⚙ Settings</b><small>Update store preferences</small></a></div></div></section>`;
}

async function renderProducts(mode='products') {
  const title = mode==='visibility' ? 'Product visibility' : 'All products';
  const desc = mode==='visibility' ? 'Publish or hide products across the customer storefront.' : 'Manage product details, stock, pricing and images.';
  const products = await readCollection('products', [orderBy('createdAt','desc')]); currentPageData = products;
  const actions = mode==='products' ? `<a class="btn btn-primary" href="add-product.html">＋ ADD PRODUCT</a>` : '';
  const rows = products.map(p=>productRow(p,mode));
  const headers = ['PRODUCT','CATEGORY','PRICE','STOCK','STATUS','ACTIONS'];
  root.innerHTML = pageHeader(title,desc,actions) + `<div class="toolbar"><input class="control search-control" data-search placeholder="Search by product name or category…"><select class="control" id="productCategoryFilter"><option value="">All categories</option>${[...new Set(products.map(p=>p.category).filter(Boolean))].sort().map(c=>`<option>${esc(c)}</option>`).join('')}</select><span class="badge neutral">${products.length} PRODUCTS</span></div>${panel('Catalogue',table(headers,rows,'Your catalogue is empty','Add your first product. It will appear on the storefront once published.',`<a class="btn btn-primary" href="add-product.html">ADD FIRST PRODUCT</a>`),'FIRESTORE LIVE')}`;
  bindSearch();
  $('#productCategoryFilter')?.addEventListener('change', e => $$('[data-row]').forEach(row => row.hidden = !!e.target.value && !row.children[1].textContent.includes(e.target.value)));
}

const PLACEMENTS = [
  ['shop','Shop collection'],['best-sellers','Best sellers'],['new-arrivals','New arrivals'],
  ['birthday','Birthday'],['festivals','Festivals'],['celebrations','Celebrations'],['anniversary','Anniversary'],
  ['valentines','Valentine’s'],['graduation','Graduation'],['just-because','Just because']
];
async function renderProductForm() {
  const id = new URLSearchParams(location.search).get('edit');
  const [old, storedCollections] = await Promise.all([
    id ? getDoc(doc(db,'products',id)) : Promise.resolve(null),
    readCollection('collections',[orderBy('name')])
  ]);
  if (id && !old.exists()) { root.innerHTML = pageHeader('Product not found','The selected product may have been removed.') + emptyState('Product unavailable','Return to the catalogue and choose another product.','<a class="btn" href="all-products.html">BACK TO PRODUCTS</a>'); return; }
  const p = old?.data() || {};
  const placements = [...PLACEMENTS];
  storedCollections.filter(c=>c.isActive!==false && c.slug && !placements.some(x=>x[0]===c.slug)).forEach(c=>placements.push([c.slug,c.name||c.slug]));
  const flavourValues = Array.isArray(p.flavours) && p.flavours.length ? p.flavours.join(', ') : (p.flavour || 'Classic');
  root.innerHTML = pageHeader(id?'Edit product':'Add product',id?'Update the product details and storefront placement.':'Create a product in Firebase and upload its image to Firebase Storage.',`<a class="btn" href="all-products.html">← ALL PRODUCTS</a>`) +
  `<form id="productForm" class="panel" style="padding:20px"><div class="form-grid">
    <div class="field"><label class="field-label">PRODUCT NAME *</label><input class="field-input" name="name" required maxlength="100" value="${esc(p.name||'')}" placeholder="e.g. Cocoa Noir"></div>
    <div class="field"><label class="field-label">CATEGORY *</label><input class="field-input" name="category" required value="${esc(p.category||'')}" placeholder="Dark chocolate, gift box…"></div>
    <div class="field"><label class="field-label">PRICE (₹) *</label><input class="field-input" name="price" type="number" min="0" step="0.01" required value="${esc(p.price??'')}" placeholder="499"></div>
    <div class="field"><label class="field-label">FLAVOURS</label><input class="field-input" name="flavours" value="${esc(flavourValues)}" placeholder="Classic, orange, hazelnut…"><small class="field-hint">Separate options with commas. Customers can choose in the product quick view.</small></div>
    <div class="field"><label class="field-label">STOCK QUANTITY *</label><input class="field-input" name="stock" type="number" min="0" step="1" required value="${esc(p.stock??0)}"></div>
    <div class="field"><label class="field-label">BADGE</label><input class="field-input" name="badge" value="${esc(p.badge||'')}" placeholder="BESTSELLER, NEW…"></div>
    <div class="field full"><label class="field-label">PRODUCT IMAGE ${id?'(OPTIONAL — UPLOAD TO REPLACE)':'*'}</label><label class="image-drop ${p.imageUrl?'has-image':''}" id="imageDrop">${p.imageUrl?`<img src="${esc(p.imageUrl)}" alt="Current product image">`:`<span class="upload-copy"><strong>＋ ADD PRODUCT IMAGE</strong><span>Choose or drop a JPG, PNG, WEBP or AVIF image · Max 8 MB</span></span>`}<input id="productImageFile" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/avif"></label><div class="upload-progress"><span id="uploadProgress"></span></div><small class="field-hint">Images are stored in Firebase Storage. Removing a product also removes its stored image.</small></div>
    <div class="field full"><label class="field-label">DESCRIPTION</label><textarea class="field-textarea" name="description" placeholder="Describe this chocolate…">${esc(p.description||'')}</textarea></div>
    <div class="field full"><label class="field-label">STOREFRONT PLACEMENTS</label><div class="collection-grid">${placements.map(([v,l])=>`<label class="collection-card" style="display:flex;align-items:center;gap:10px;padding:11px"><input type="checkbox" name="placements" value="${v}" ${(p.placements||['shop']).includes(v)?'checked':''}><span style="font-size:9px">${l}</span></label>`).join('')}</div></div>
    <div class="field"><label class="field-label">PUBLISH STATUS</label><select class="field-select" name="published"><option value="true" ${(p.isPublished!==false)?'selected':''}>Published</option><option value="false" ${p.isPublished===false?'selected':''}>Draft</option></select></div>
    <div class="field"><label class="field-label">STOREFRONT VISIBILITY</label><select class="field-select" name="visible"><option value="true" ${p.isVisible!==false?'selected':''}>Visible</option><option value="false" ${p.isVisible===false?'selected':''}>Hidden</option></select></div>
    <div class="field"><label class="field-label">NEW ARRIVAL</label><select class="field-select" name="newArrival"><option value="false" ${!p.newArrival?'selected':''}>No</option><option value="true" ${p.newArrival?'selected':''}>Yes</option></select></div>
    <div class="field"><label class="field-label">DISPLAY ORDER</label><input class="field-input" name="sortOrder" type="number" step="1" value="${esc(p.sortOrder??Date.now())}"></div>
  </div><div class="form-actions"><a class="btn" href="all-products.html">CANCEL</a><button class="btn btn-primary" type="submit">${id?'SAVE CHANGES':'SAVE PRODUCT'}</button></div></form>`;
  $('#productForm').addEventListener('submit', async (e)=>{
    e.preventDefault(); const form=e.currentTarget; const data=new FormData(form); const file=$('#productImageFile').files[0];
    if(!id && !file){toast('Please add a product image.',true);return;}
    if(file && file.size>=8*1024*1024){toast('Image must be 8 MB or smaller.',true);return;}
    const submit=$('button[type="submit"]',form); submit.disabled=true; submit.textContent='SAVING…';
    try {
      let oldImageToDelete='';
      const placements=data.getAll('placements');
      const flavours=String(data.get('flavours')||'Classic').split(',').map(v=>v.trim()).filter(Boolean).slice(0,20);
      const payload={name:String(data.get('name')).trim(),category:String(data.get('category')).trim(),price:Number(data.get('price')),flavour:flavours[0]||'Classic',flavours,stock:Number(data.get('stock')),badge:String(data.get('badge')||'').trim(),description:String(data.get('description')||'').trim(),placements,isPublished:data.get('published')==='true',isVisible:data.get('visible')==='true',newArrival:data.get('newArrival')==='true',sortOrder:Number(data.get('sortOrder'))||Date.now(),updatedAt:serverTimestamp()};
      let productId=id;
      if(!productId){const newDoc=doc(collection(db,'products')); productId=newDoc.id;}
      if(file){const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]+/g,'-');const path=`products/${productId}/${Date.now()}-${safeName}`;const task=uploadBytesResumable(storageRef(storage,path),file,{contentType:file.type,cacheControl:'public,max-age=31536000'});await new Promise((resolve,reject)=>task.on('state_changed',s=>$('#uploadProgress').style.width=`${Math.round(100*s.bytesTransferred/s.totalBytes)}%`,reject,resolve));payload.imagePath=path;payload.imageUrl=await getDownloadURL(storageRef(storage,path));if(p.imagePath)oldImageToDelete=p.imagePath;}
      else if(id){payload.imagePath=p.imagePath||'';payload.imageUrl=p.imageUrl||'';}
      payload.createdAt=p.createdAt||serverTimestamp();
      await setDoc(doc(db,'products',productId),payload,{merge:true});
      if(oldImageToDelete) await removeStorageFile(oldImageToDelete).catch(error=>console.warn('Old product image could not be removed:',error));
      await addLog(id?'Updated product':'Created product','product',productId,{summary:payload.name});
      toast(id?'Product updated':'Product created'); location.href='all-products.html';
    } catch(error){console.error(error);toast(error.message||'Could not save the product.',true);submit.disabled=false;submit.textContent=id?'SAVE CHANGES':'SAVE PRODUCT';}
  });
}

async function removeStorageFile(path) {
  if (!path) return;
  try { await deleteObject(storageRef(storage, path)); }
  catch (error) { if (error?.code !== 'storage/object-not-found') throw error; }
}
async function removeProduct(p) {
  if(!confirm(`Permanently remove “${p.name}” and its stored image? This cannot be undone from the admin panel.`)) return;
  try {
    if(p.imagePath) await removeStorageFile(p.imagePath);
    if(Array.isArray(p.imagePaths)) await Promise.all(p.imagePaths.map(removeStorageFile));
    await deleteDoc(doc(db,'products',p.id));
    await addLog('Deleted product','product',p.id,{summary:p.name});
    toast('Product and linked image removed'); await renderProducts(page==='visibility'?'visibility':'products');
  } catch(e){console.error(e);toast(`Delete failed: ${e.message}`,true);}
}
async function toggleProduct(id, value) {
  const visible=value!=='true'; await updateDoc(doc(db,'products',id),{isVisible:visible,updatedAt:serverTimestamp()});
  await addLog(visible?'Published product visibility':'Hid product','product',id,{summary:visible?'Product visible':'Product hidden'});
  toast(visible?'Product is now visible':'Product hidden from storefront'); await renderProducts('visibility');
}

async function renderCollections() {
  const [collections,products]=await Promise.all([readCollection('collections',[orderBy('name')]),readCollection('products')]);
  root.innerHTML=pageHeader('Collections','Create and organise the groups customers browse on the storefront.',`<button class="btn btn-primary" data-action="new-collection">＋ NEW COLLECTION</button>`)+
  (collections.length?`<div class="collection-grid">${collections.map(c=>`<article class="collection-card"><div class="eyebrow">STOREFRONT COLLECTION</div><h3>${esc(c.name)}</h3><p>${esc(c.description||'No description added.')}</p><div class="collection-meta"><span class="badge neutral">${products.filter(p=>(p.placements||[]).includes(c.slug)).length} PRODUCTS</span><div class="action-group"><button class="btn btn-sm" data-action="edit-collection" data-id="${esc(c.id)}">EDIT</button><button class="btn btn-danger btn-sm" data-action="delete-collection" data-id="${esc(c.id)}">DELETE</button></div></div></article>`).join('')}</div>`:emptyState('No collections yet','Create your first collection. Products can be assigned to it from the product editor.','<button class="btn btn-primary" data-action="new-collection">CREATE COLLECTION</button>'));
  currentPageData=collections;
}
async function collectionForm(existing=null) {
  const dialog=openAdminDialog(existing?'Edit collection':'New collection',`<form id="collectionEditor" class="admin-dialog-form"><div class="field"><label class="field-label" for="collectionName">COLLECTION NAME *</label><input class="field-input" id="collectionName" name="name" maxlength="80" required value="${esc(existing?.name||'')}" placeholder="e.g. Festive gifts"></div><div class="field"><label class="field-label" for="collectionDescription">DESCRIPTION</label><textarea class="field-textarea" id="collectionDescription" name="description" maxlength="300" placeholder="A short introduction for this collection…">${esc(existing?.description||'')}</textarea></div><div class="form-actions"><button class="btn" type="button" data-modal-close>Cancel</button><button class="btn btn-primary" type="submit">${existing?'SAVE CHANGES':'CREATE COLLECTION'}</button></div></form>`,'CATALOG / COLLECTIONS');
  const form=$('#collectionEditor',dialog.element);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const data=new FormData(form);const clean=String(data.get('name')||'').trim();const description=String(data.get('description')||'').trim();
    if(!clean)return toast('Collection name is required.',true);
    const slug=slugify(clean);const button=$('button[type="submit"]',form);button.disabled=true;button.textContent='SAVING…';
    try {
      if(existing) {
        if(existing.slug!==slug) {
          const products=await readCollection('products');
          await Promise.all(products.filter(p=>(p.placements||[]).includes(existing.slug)).map(p=>updateDoc(doc(db,'products',p.id),{placements:(p.placements||[]).map(value=>value===existing.slug?slug:value),updatedAt:serverTimestamp()})));
        }
        await updateDoc(doc(db,'collections',existing.id),{name:clean,slug,description,updatedAt:serverTimestamp()});
      } else await setDoc(doc(db,'collections',slug),{name:clean,slug,description,isActive:true,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
      await addLog(existing?'Updated collection':'Created collection','collection',slug,{summary:clean});toast('Collection saved');dialog.close();await renderCollections();
    } catch(error){toast(error.message,true);button.disabled=false;button.textContent=existing?'SAVE CHANGES':'CREATE COLLECTION';}
  });
  $('[data-modal-close]',dialog.element).addEventListener('click',dialog.close);
  $('#collectionName',dialog.element).focus();
}

async function deleteCollection(id) {
  const c=currentPageData.find(x=>x.id===id); if(!c||!confirm(`Delete collection “${c.name}”? Products will remain; only their collection placement is removed.`))return;
  try { const products=await readCollection('products'); await Promise.all(products.filter(p=>(p.placements||[]).includes(c.slug)).map(p=>updateDoc(doc(db,'products',p.id),{placements:(p.placements||[]).filter(s=>s!==c.slug),updatedAt:serverTimestamp()}))); await deleteDoc(doc(db,'collections',id)); await addLog('Deleted collection','collection',id,{summary:c.name});toast('Collection deleted');await renderCollections(); }
  catch(e){toast(e.message,true);}
}


async function changeOrderStatus(orderId, nextStatus) {
  const orderRef=doc(db,'orders',orderId);
  await runTransaction(db,async transaction=>{
    const orderSnap=await transaction.get(orderRef);
    if(!orderSnap.exists())throw new Error('This order no longer exists.');
    const order=orderSnap.data();
    const previous=String(order.status||'pending');
    if(previous==='cancelled' && nextStatus!=='cancelled')throw new Error('A cancelled order cannot be reopened. Create a new order instead.');
    if(nextStatus==='cancelled' && previous!=='cancelled'){
      const quantities=new Map();
      (order.items||[]).forEach(item=>{const id=String(item.productId||'');const qty=Number(item.quantity||0);if(id&&Number.isInteger(qty)&&qty>0)quantities.set(id,(quantities.get(id)||0)+qty);});
      const refs=[...quantities.keys()].map(id=>doc(db,'products',id));
      const productSnaps=await Promise.all(refs.map(ref=>transaction.get(ref)));
      // All reads precede writes. Missing products are skipped, but the order
      // can still be cancelled if the product was already removed by an admin.
      productSnaps.forEach((snap,index)=>{if(snap.exists()){const qty=quantities.get(snap.id)||0;transaction.update(refs[index],{stock:Number(snap.data().stock||0)+qty,updatedAt:serverTimestamp()});}});
    }
    transaction.update(orderRef,{status:nextStatus,updatedAt:serverTimestamp()});
  });
}

async function renderOrders() {
  const orders=await readCollection('orders',[orderBy('createdAt','desc')]); currentPageData=orders;
  const rows=orders.map(o=>`<tr data-row><td><b>${esc(o.orderNumber||o.id.slice(0,8).toUpperCase())}</b><small class="cell-sub">${esc(dateText(o.createdAt))}</small></td><td>${esc(o.customerName||o.shippingAddress?.name||'Customer')}<small class="cell-sub">${esc(o.phone||o.shippingAddress?.phone||'')}</small></td><td>${(o.items||[]).length} items</td><td>${money(o.total)}</td><td><select class="control inline-select" data-payment-status="${esc(o.id)}">${['unpaid','pending_verification','paid','failed','refunded'].map(s=>`<option value="${s}" ${(o.paymentStatus||'unpaid')===s?'selected':''}>${s.replaceAll('_',' ').toUpperCase()}</option>`).join('')}</select></td><td><select class="control inline-select" data-order-status="${esc(o.id)}">${['pending','processing','shipped','delivered','cancelled'].map(s=>`<option value="${s}" ${(o.status||'pending')===s?'selected':''}>${s.toUpperCase()}</option>`).join('')}</select></td><td><button class="btn btn-sm" data-action="view-order" data-id="${esc(o.id)}">VIEW</button></td></tr>`);
  root.innerHTML=pageHeader('Orders','Review purchases, payment status and fulfilment progress.')+`<div class="toolbar"><input class="control search-control" data-search placeholder="Search order number, name or phone…"><select class="control" id="orderStatusFilter"><option value="">All statuses</option>${['pending','processing','shipped','delivered','cancelled'].map(s=>`<option value="${s}">${s.toUpperCase()}</option>`).join('')}</select><span class="badge neutral">${orders.length} ORDERS</span></div>${panel('All orders',table(['ORDER','CUSTOMER','ITEMS','TOTAL','PAYMENT','FULFILMENT','DETAILS'],rows,'No orders yet','Orders placed by customers will appear here once checkout is connected.'),'LIVE FROM FIRESTORE')}`;
  bindSearch(); $('#orderStatusFilter').addEventListener('change',e=>$$('[data-row]').forEach(r=>r.hidden=!!e.target.value&&r.querySelector('[data-order-status]')?.value!==e.target.value));
}
async function renderCustomers() {
  const customers=await readCollection('users',[orderBy('createdAt','desc')]); currentPageData=customers;
  const orders=await readCollection('orders'); const rows=customers.map(u=>{const count=orders.filter(o=>o.customerUid===u.id).length;return `<tr data-row><td><div class="table-product"><span class="table-thumb empty">${esc((u.name||'C').slice(0,1).toUpperCase())}</span><span>${esc(u.name||'Customer')}<small class="cell-sub">${esc(u.email||'Phone-only account')}</small></span></div></td><td>${esc(u.phoneNumber||u.phone||'—')}</td><td>${count}</td><td>${money(orders.filter(o=>o.customerUid===u.id).reduce((n,o)=>n+Number(o.total||0),0))}</td><td>${esc(dateText(u.createdAt))}</td></tr>`;});
  root.innerHTML=pageHeader('Customers','Customer profiles and purchase relationships.')+`<div class="toolbar"><input class="control search-control" data-search placeholder="Search name, email or phone…"><span class="badge neutral">${customers.length} CUSTOMERS</span></div>${panel('Customer directory',table(['CUSTOMER','PHONE','ORDERS','LIFETIME SPEND','JOINED'],rows,'No customer profiles yet','Customer profiles are created when customers register or sign in.'),'USERS COLLECTION')}`;bindSearch();
}
async function renderSupport() {
  const messages=await readCollection('support_messages',[orderBy('createdAt','desc')]); currentPageData=messages;
  const rows=messages.map(m=>`<tr data-row><td><b>${esc(m.name||'Customer')}</b><small class="cell-sub">${esc(m.email||'')}</small></td><td>${esc(m.orderNumber||'—')}</td><td style="white-space:normal;min-width:250px">${esc(m.message||'')}</td><td>${statusBadge(m.status||'open')}</td><td><div class="action-group"><button class="btn btn-sm" data-action="view-support" data-id="${esc(m.id)}">VIEW</button><button class="btn btn-sm" data-action="set-support-status" data-id="${esc(m.id)}" data-value="${m.status==='resolved'?'open':'resolved'}">${m.status==='resolved'?'REOPEN':'RESOLVE'}</button><button class="btn btn-danger btn-sm" data-action="delete-support" data-id="${esc(m.id)}">DELETE</button></div></td></tr>`);
  root.innerHTML=pageHeader('Support inbox','Messages sent through the Customer Care page.')+`<div class="toolbar"><input class="control search-control" data-search placeholder="Search customer, email or message…"><span class="badge neutral">${messages.filter(m=>m.status!=='resolved').length} OPEN</span><span class="badge neutral">${messages.length} TOTAL</span></div>${panel('Customer messages',table(['CUSTOMER','ORDER','MESSAGE','STATUS','ACTIONS'],rows,'No customer messages yet','New messages submitted from Customer Care will appear here.'),'SUPPORT MESSAGES')}`;bindSearch();
}
async function renderInventory() {
  const products=await readCollection('products',[orderBy('name')]);currentPageData=products;
  const rows=products.map(p=>`<tr data-row><td><div class="table-product">${imageCell(p)}<span>${esc(p.name||'Untitled')}<small class="cell-sub">${esc(p.category||'')}</small></span></div></td><td><input class="control inline-select" type="number" min="0" step="1" value="${Number(p.stock||0)}" id="stock-${esc(p.id)}" style="width:85px"></td><td>${Number(p.stock||0)<1?statusBadge('out_of_stock'):Number(p.stock||0)<10?statusBadge('low'):statusBadge('healthy')}</td><td><button class="btn btn-sm" data-action="save-stock" data-id="${esc(p.id)}">SAVE</button></td></tr>`);
  root.innerHTML=pageHeader('Inventory','Monitor available stock and keep quantities accurate.')+`<div class="toolbar"><input class="control search-control" data-search placeholder="Search products…"><span class="badge warning">${products.filter(p=>Number(p.stock||0)<10).length} LOW STOCK</span></div>${panel('Stock levels',table(['PRODUCT','AVAILABLE UNITS','HEALTH','UPDATE'],rows,'No products to track','Add products to start managing inventory.'),'PRODUCTS COLLECTION')}`;bindSearch();
}
async function renderFeedback() {
  const items=await readCollection('feedback',[orderBy('createdAt','desc')]); currentPageData=items;
  const rows=items.map(f=>`<tr data-row><td>${esc(f.customerName||'Customer')}<small class="cell-sub">${esc(f.productName||'Store feedback')}</small></td><td>${'★'.repeat(Math.max(0,Math.min(5,Number(f.rating||0))))}${'☆'.repeat(5-Math.max(0,Math.min(5,Number(f.rating||0))))}</td><td style="white-space:normal;min-width:230px">${esc(f.message||f.comment||'—')}</td><td>${statusBadge(f.isVisible===false?'hidden':f.reviewed?'reviewed':'unread')}</td><td><div class="action-group"><button class="btn btn-sm" data-action="toggle-feedback" data-id="${esc(f.id)}" data-value="${f.isVisible===false?'false':'true'}">${f.isVisible===false?'SHOW':'HIDE'}</button><button class="btn btn-danger btn-sm" data-action="delete-feedback" data-id="${esc(f.id)}">DELETE</button></div></td></tr>`);
  root.innerHTML=pageHeader('Customer feedback','Review ratings and messages submitted by customers.')+`<div class="toolbar"><input class="control search-control" data-search placeholder="Search feedback…"><span class="badge neutral">${items.length} REVIEWS</span></div>${panel('Feedback inbox',table(['CUSTOMER','RATING','MESSAGE','STATUS','ACTIONS'],rows,'No feedback yet','Customer reviews will appear here when submitted from the storefront.'),'FEEDBACK COLLECTION')}`;bindSearch();
}
async function renderAnalytics() {
  const [orders,products]=await Promise.all([readCollection('orders',[orderBy('createdAt','desc')]),readCollection('products')]);
  const days=Number(new URLSearchParams(location.search).get('days')||30); const cutoff=Date.now()-days*86400000;
  const period=orders.filter(o=>{const d=o.createdAt?.toDate?.()||new Date(o.createdAt||0);return d.getTime()>=cutoff;});
  const completed=period.filter(o=>String(o.paymentStatus||'').toLowerCase()==='paid'); const fulfilled=period.filter(o=>['processing','shipped','delivered'].includes(String(o.status||'').toLowerCase())); const revenue=completed.reduce((n,o)=>n+Number(o.total||0),0);
  const bars=Array.from({length:Math.min(days,14)},(_,i)=>{const start=cutoff+i*(days/Math.min(days,14))*86400000;const end=cutoff+(i+1)*(days/Math.min(days,14))*86400000;return {label:new Date(start).toLocaleDateString('en-IN',{day:'numeric',month:'short'}),value:completed.filter(o=>{const t=o.createdAt?.toDate?.()?.getTime?.()||new Date(o.createdAt||0).getTime();return t>=start&&t<end;}).reduce((n,o)=>n+Number(o.total||0),0)};});
  const max=Math.max(1,...bars.map(b=>b.value));
  const popular={};completed.forEach(o=>(o.items||[]).forEach(i=>{const k=i.productId||i.id||i.name;popular[k]=(popular[k]||{name:i.name||'Product',qty:0,revenue:0});popular[k].qty+=Number(i.quantity||1);popular[k].revenue+=Number(i.price||0)*Number(i.quantity||1);}));
  const top=Object.values(popular).sort((a,b)=>b.qty-a.qty).slice(0,5);
  root.innerHTML=pageHeader('Analytics','Use completed store orders to understand sales performance.',`<select class="control" id="analyticsRange"><option value="7" ${days===7?'selected':''}>LAST 7 DAYS</option><option value="30" ${days===30?'selected':''}>LAST 30 DAYS</option><option value="90" ${days===90?'selected':''}>LAST 90 DAYS</option></select>`)+
  `<div class="stats-grid">${stat('REVENUE',money(revenue),`Last ${days} days`)}${stat('ORDERS',period.length,`Last ${days} days`)}${stat('AVERAGE ORDER VALUE',money(completed.length?revenue/completed.length:0),'Completed orders')}${stat('FULFILLED / IN PROGRESS',fulfilled.length,'Last '+days+' days')}${stat('CATALOGUE SIZE',products.length,'Products in Firestore')}</div>`+
  `<div class="layout-two">${panel('Revenue over time',`<div class="panel-body"><div class="chart-bars">${bars.map(b=>`<div class="chart-column" title="${esc(b.label)} · ${money(b.value)}"><div class="chart-bar" style="height:${Math.max(2,b.value/max*100)}%"></div></div>`).join('')}</div><div class="chart-labels">${bars.map(b=>`<span>${esc(b.label)}</span>`).join('')}</div><p class="field-hint">Revenue includes only orders whose payment status is explicitly marked paid. Cash-on-delivery orders should be marked paid after collection.</p></div>`,'LIVE DATA')}${panel('Top products',table(['PRODUCT','UNITS','REVENUE'],top.map(p=>`<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>${money(p.revenue)}</td></tr>`),'No sales data yet','Product performance will appear after real orders are recorded.'),'BY QUANTITY')}</div>`;
  $('#analyticsRange').addEventListener('change',e=>location.href=`analytics.html?days=${e.target.value}`);
}
async function renderActivity() {
  const logs=await readCollection('activity_logs',[orderBy('createdAt','desc'),limit(200)]); currentPageData=logs;
  root.innerHTML=pageHeader('Activity','A chronological audit trail for actions in the admin panel.')+panel('Recent activity',logs.length?`<div class="timeline">${logs.map(l=>`<div class="timeline-item"><span class="timeline-dot"></span><div><strong>${esc(l.action||'Store activity')}</strong><p>${esc(l.details?.summary||`${l.entityType||'record'} ${l.entityId||''}`)} · ${esc(l.actorName||'Administrator')}</p></div><time>${esc(dateText(l.createdAt))}</time></div>`).join('')}</div>`:emptyState('No activity recorded','Your changes to products, collections, orders and settings will be recorded here.'),'AUDIT LOG');
}
const SETTINGS=[['storefrontOnline','Storefront online','Allow customers to browse the store.'],['maintenanceMode','Maintenance mode','Show a maintenance message instead of the catalogue.'],['reviewsEnabled','Customer reviews','Allow customer feedback submissions.'],['orderNotifications','Order notifications','Enable admin-side new order alerts.']];
async function renderSettings() {
  const snap=await getDoc(doc(db,'settings','store'));const s=snap.exists()?snap.data():{};
  const notificationAction = ('Notification' in window && Notification.permission !== 'granted') ? `<button class="btn" id="requestNotifications" type="button">ALLOW BROWSER ALERTS</button>` : '';
  root.innerHTML=pageHeader('Store settings','Storefront preferences are shared with the customer website.',notificationAction)+`<section class="panel"><div class="panel-head"><h2>Store preferences</h2><small>SETTINGS / STORE</small></div><div class="settings-list">${SETTINGS.map(([key,label,desc])=>`<div class="setting-row"><div class="setting-copy"><strong>${label}</strong><small>${desc}</small></div><button class="switch" role="switch" aria-checked="${Boolean(s[key]??(key!=='maintenanceMode' && key!=='orderNotifications'))}" data-setting="${key}" type="button" aria-label="${label}"></button></div>`).join('')}</div><div class="panel-body"><p class="field-hint">Changes are saved immediately to Firestore. Maintenance mode takes precedence over normal catalogue display.</p></div></section>`;
}
async function renderAccount() {
  const u=currentUser;
  root.innerHTML=pageHeader('Admin account','Manage your signed-in account profile.')+`<section class="panel" style="max-width:760px"><div class="panel-head"><h2>Administrator profile</h2><small>FIREBASE AUTHENTICATION</small></div><form class="panel-body" id="accountForm"><div class="form-grid"><div class="field"><label class="field-label">DISPLAY NAME</label><input class="field-input" name="displayName" maxlength="80" value="${esc(u.displayName||'Administrator')}" required></div><div class="field"><label class="field-label">EMAIL ADDRESS</label><input class="field-input" value="${esc(u.email||'Not provided')}" disabled></div><div class="field"><label class="field-label">PHONE NUMBER</label><input class="field-input" value="${esc(u.phoneNumber||'Not provided')}" disabled></div><div class="field"><label class="field-label">USER ID</label><input class="field-input" value="${esc(u.uid)}" disabled></div><div class="field full"><label class="field-label">SIGN-IN PROVIDERS</label><div class="badge neutral">${(u.providerData||[]).map(p=>esc(p.providerId)).join(' · ')||'Firebase Authentication'}</div></div></div><div class="form-actions"><button class="btn btn-primary" type="submit">SAVE PROFILE</button></div></form></section>`;
  $('#accountForm').addEventListener('submit',async e=>{e.preventDefault();try{await updateProfile(currentUser,{displayName:new FormData(e.currentTarget).get('displayName').trim()});await addLog('Updated administrator profile','admin',currentUser.uid,{summary:'Display name updated'});toast('Profile updated');await setAdminIdentity(currentUser);}catch(err){toast(err.message,true);}});
}

async function dispatchAction(button) {
  const action=button.dataset.action,id=button.dataset.id;
  if(action==='delete-product'){const p=currentPageData.find(x=>x.id===id)||{id};await removeProduct(p);}
  if(action==='toggle-product')await toggleProduct(id,button.dataset.value);
  if(action==='new-collection')await collectionForm();
  if(action==='edit-collection')await collectionForm(currentPageData.find(x=>x.id===id));
  if(action==='delete-collection')await deleteCollection(id);
  if(action==='save-stock') {const value=Number($(`#stock-${CSS.escape(id)}`).value);if(!Number.isInteger(value)||value<0)return toast('Enter a valid stock quantity.',true);try{await updateDoc(doc(db,'products',id),{stock:value,updatedAt:serverTimestamp()});await addLog('Updated inventory','product',id,{summary:`Stock set to ${value}`});toast('Inventory updated');await renderInventory();}catch(e){toast(e.message,true);}}
  if(action==='view-support'){const m=currentPageData.find(x=>x.id===id);if(m){openAdminDialog('Customer message',`<div class=\"dialog-meta\"><p><span>NAME</span><b>${esc(m.name||'Customer')}</b></p><p><span>EMAIL</span><b>${esc(m.email||'—')}</b></p><p><span>ORDER NUMBER</span><b>${esc(m.orderNumber||'—')}</b></p><p><span>STATUS</span><b>${esc(m.status||'open')}</b></p></div><div class=\"dialog-lines\" style=\"white-space:pre-wrap;line-height:1.7;padding-top:16px;color:#e6dfce;font-size:11px\">${esc(m.message||'')}</div>`,'STORE / CUSTOMER CARE');}}
  if(action==='set-support-status'){const m=currentPageData.find(x=>x.id===id);const status=button.dataset.value;try{await updateDoc(doc(db,'support_messages',id),{status,updatedAt:serverTimestamp()});await addLog('Updated support message','support_message',id,{summary:`${m?.name||'Customer'} · ${status}`});toast(status==='resolved'?'Message resolved':'Message reopened');await renderSupport();}catch(e){toast(e.message,true);}}
  if(action==='delete-support'){const m=currentPageData.find(x=>x.id===id);if(confirm('Permanently delete this customer message?'))try{await deleteDoc(doc(db,'support_messages',id));await addLog('Deleted support message','support_message',id,{summary:m?.name||'Customer'});toast('Message deleted');await renderSupport();}catch(e){toast(e.message,true);}}
  if(action==='view-order'){const o=currentPageData.find(x=>x.id===id);if(o){const lines=(o.items||[]).map(i=>`<div class=\"dialog-line\"><span>${esc(i.name||i.productName||'Product')} <small>${esc(i.flavour||'Classic')} × ${Number(i.quantity||1)}</small></span><b>${money(Number(i.price||0)*Number(i.quantity||1))}</b></div>`).join('');openAdminDialog(`Order ${o.orderNumber||id}`,`<div class=\"dialog-meta\"><p><span>CUSTOMER</span><b>${esc(o.customerName||'Customer')}</b></p><p><span>PHONE</span><b>${esc(o.phone||'—')}</b></p><p><span>PAYMENT</span><b>${esc(o.paymentMethod||'—')} · ${esc(o.paymentStatus||'pending')}</b></p><p><span>FULFILMENT</span><b>${esc(o.status||'pending')}</b></p><p class=\"full\"><span>DELIVERY ADDRESS</span><b>${esc(o.shippingAddress?.address||o.shippingAddress?.locationLabel||'—')}, ${esc(o.shippingAddress?.pin||'')}</b></p></div><div class=\"dialog-lines\">${lines}</div><div class=\"dialog-total\"><span>ORDER TOTAL</span><strong>${money(o.total)}</strong></div>`,'STORE / ORDER DETAILS');}}
  if(action==='toggle-feedback'){const f=currentPageData.find(x=>x.id===id);try{await updateDoc(doc(db,'feedback',id),{isVisible:f?.isVisible===false,reviewed:true,updatedAt:serverTimestamp()});await addLog('Updated feedback visibility','feedback',id,{summary:'Review visibility changed'});toast('Feedback updated');await renderFeedback();}catch(e){toast(e.message,true);}}
  if(action==='delete-feedback'){if(confirm('Permanently delete this feedback entry?'))try{await deleteDoc(doc(db,'feedback',id));await addLog('Deleted feedback','feedback',id);toast('Feedback deleted');await renderFeedback();}catch(e){toast(e.message,true);}}
}

document.addEventListener('click', e=>{
  if(e.target.closest('#requestNotifications')){if('Notification' in window)Notification.requestPermission().then(permission=>toast(permission==='granted'?'Browser alerts enabled':'Browser alerts not enabled',permission!=='granted'));return;}
  const settingButton=e.target.closest('[data-setting]');
  if(settingButton){e.preventDefault();const key=settingButton.dataset.setting;const value=settingButton.getAttribute('aria-checked')!=='true';settingButton.setAttribute('aria-checked',String(value));setDoc(doc(db,'settings','store'),{[key]:value,updatedAt:serverTimestamp()},{merge:true}).then(()=>addLog('Updated store setting','setting',key,{summary:`${key}: ${value}`})).then(()=>toast('Setting saved')).catch(err=>{settingButton.setAttribute('aria-checked',String(!value));toast(err.message,true);});return;}
  const b=e.target.closest('[data-action]');if(b){e.preventDefault();dispatchAction(b).catch(err=>toast(err.message,true));}
});
document.addEventListener('change', async e=>{
  const orderId=e.target.dataset.orderStatus;
  if(orderId){const status=e.target.value;try{await changeOrderStatus(orderId,status);await addLog('Updated order status','order',orderId,{summary:`Status changed to ${status}${status==='cancelled'?' · stock returned to inventory':''}`});toast(status==='cancelled'?'Order cancelled and stock restored':'Order status updated');}catch(err){toast(err.message,true);await renderOrders();}}
  const paymentOrderId=e.target.dataset.paymentStatus;
  if(paymentOrderId){const paymentStatus=e.target.value;try{await updateDoc(doc(db,'orders',paymentOrderId),{paymentStatus,updatedAt:serverTimestamp()});await addLog('Updated payment status','order',paymentOrderId,{summary:`Payment status changed to ${paymentStatus}`});toast('Payment status updated');}catch(err){toast(err.message,true);}}
  const setting=e.target.dataset.setting;
  if(setting){const value=e.target.getAttribute('aria-checked')!=='true';e.target.setAttribute('aria-checked',String(value));try{await setDoc(doc(db,'settings','store'),{[setting]:value,updatedAt:serverTimestamp()},{merge:true});await addLog('Updated store setting','setting',setting,{summary:`${setting}: ${value}`});toast('Setting saved');}catch(err){e.target.setAttribute('aria-checked',String(!value));toast(err.message,true);}}
});


function watchOrderNotifications() {
  // The initial snapshot is intentionally silent; notifications are only for
  // orders arriving after the administrator has opened the dashboard.
  onSnapshot(doc(db, 'settings', 'store'), snap => {
    orderNotificationsEnabled = snap.exists() && snap.data().orderNotifications === true;
  }, error => console.warn('Could not read notification preference:', error));
  onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5)), snap => {
    if (!orderNotificationSnapshotReady) { orderNotificationSnapshotReady = true; return; }
    snap.docChanges().forEach(change => {
      if (change.type !== 'added' || !orderNotificationsEnabled) return;
      const order = change.doc.data();
      const orderLabel = order.orderNumber || change.doc.id.slice(0, 10);
      toast(`New order received · ${orderLabel}`);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Liwi-Ka order', { body: `${orderLabel} · ${money(order.total)}` });
      }
    });
  }, error => console.warn('Live order notifications unavailable:', error));
}

function setAdminIdentity(user){const label=user.displayName||user.phoneNumber||user.email||'Administrator';$('#adminName')&&($('#adminName').textContent=label);$('#adminAvatar')&&($('#adminAvatar').textContent=label.split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase());$('#adminRole')&&($('#adminRole').textContent='Authorized administrator');}
async function start() {
  await persistenceReady;
  onAuthStateChanged(auth,async user=>{
    if(!user){location.replace('login.html');return;}
    try{const token=await user.getIdTokenResult(true);if(token.claims.admin!==true){await signOut(auth);location.replace('login.html?denied=1');return;}currentUser=user;setAdminIdentity(user);watchOrderNotifications();$('#storeStatusLabel').textContent='FIREBASE CONNECTED';$('#storeStatusSub').textContent='Live database connection';
      if(page==='dashboard')await renderDashboard();else if(page==='products')await renderProducts('products');else if(page==='visibility')await renderProducts('visibility');else if(page==='product-form')await renderProductForm();else if(page==='collections')await renderCollections();else if(page==='orders')await renderOrders();else if(page==='customers')await renderCustomers();else if(page==='inventory')await renderInventory();else if(page==='feedback')await renderFeedback();else if(page==='support')await renderSupport();else if(page==='analytics')await renderAnalytics();else if(page==='activity')await renderActivity();else if(page==='settings')await renderSettings();else if(page==='account')await renderAccount();
    }catch(error){console.error(error);root.innerHTML=pageHeader('Could not load this page','Check your Firebase connection and Security Rules.')+`<div class="error-banner">${esc(error.message||'Unknown Firebase error')}</div>`;$('#storeStatusLabel').textContent='CONNECTION ERROR';$('#storeStatusSub').textContent='Check Firebase Rules';}
  });
}
$('#signOut')?.addEventListener('click',async()=>{try{await signOut(auth);location.replace('login.html');}catch(e){toast(e.message,true);}});
$('#refreshPage')?.addEventListener('click',()=>location.reload());
$('#mobileNavToggle')?.addEventListener('click',()=>document.body.classList.toggle('nav-open'));
document.addEventListener('click',e=>{if(document.body.classList.contains('nav-open')&&!e.target.closest('.sidebar')&&!e.target.closest('#mobileNavToggle'))document.body.classList.remove('nav-open');});
start();
