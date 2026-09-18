const file=location.pathname.split('/').pop()||'admin.html';const map={"admin.html":"Dashboard","control-center.html":"Control Center","all-products.html":"All Products","add-product.html":"Add Product","collections.html":"Collections","visibility.html":"Visibility","orders.html":"Orders","customers.html":"Customers","inventory.html":"Inventory","feedback.html":"Feedback","analytics.html":"Analytics","activity.html":"Activity","settings.html":"Store Settings","account.html":"Admin Account"};document.querySelectorAll('.sidebar a[data-page]').forEach(a=>{if(a.dataset.page===map[file])a.classList.add('active')});function toast(t){const e=document.querySelector('.toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(window.tt);window.tt=setTimeout(()=>e.classList.remove('show'),2200)}document.querySelectorAll('[data-toast]').forEach(e=>e.addEventListener('click',()=>toast(e.dataset.toast)));document.querySelectorAll('.toggle').forEach(e=>e.addEventListener('click',()=>{e.classList.toggle('on');toast(e.classList.contains('on')?'Setting enabled':'Setting disabled')}));document.querySelectorAll('form').forEach(f=>f.addEventListener('submit',e=>{e.preventDefault();toast(f.dataset.message||'Changes saved successfully')}));const search=document.querySelector('[data-search]');if(search){search.addEventListener('input',()=>{const q=search.value.toLowerCase();document.querySelectorAll('[data-row]').forEach(r=>r.style.display=r.innerText.toLowerCase().includes(q)?'':'none')})}

/* Interactive light follows the cursor across cards */
document.querySelectorAll('.card,.section-card').forEach(card=>{
  card.addEventListener('pointermove',e=>{
    const r=card.getBoundingClientRect();
    card.style.setProperty('--mx',`${e.clientX-r.left}px`);
    card.style.setProperty('--my',`${e.clientY-r.top}px`);
  });
});

/* Smooth shared-page transition */
document.querySelectorAll('a[href]').forEach(link=>{
  const href=link.getAttribute('href');
  if(!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || link.target==='_blank') return;
  link.addEventListener('click',e=>{
    if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey) return;
    e.preventDefault();
    document.body.classList.add('page-leaving');
    setTimeout(()=>location.href=href,180);
  });
});

/* Product image uploader / preview */
const imageUpload=document.querySelector('#productImageUpload');const imageInput=document.querySelector('#productImage');const imagePreview=document.querySelector('#imagePreview');const previewImage=document.querySelector('#previewImage');const uploadEmpty=document.querySelector('#uploadEmpty');const previewName=document.querySelector('#previewName');const removeImage=document.querySelector('#removeImage');let selectedImageUrl='';
function showImage(file){if(!file||!file.type.startsWith('image/')){toast('Please choose a valid image');return}if(selectedImageUrl)URL.revokeObjectURL(selectedImageUrl);selectedImageUrl=URL.createObjectURL(file);previewImage.src=selectedImageUrl;previewName.textContent=file.name;imagePreview.classList.add('show');uploadEmpty.classList.add('hide')}
if(imageUpload&&imageInput){imageUpload.addEventListener('click',e=>{if(!e.target.closest('#removeImage'))imageInput.click()});imageInput.addEventListener('change',()=>showImage(imageInput.files[0]));['dragenter','dragover'].forEach(ev=>imageUpload.addEventListener(ev,e=>{e.preventDefault();imageUpload.classList.add('dragging')}));['dragleave','drop'].forEach(ev=>imageUpload.addEventListener(ev,e=>{e.preventDefault();imageUpload.classList.remove('dragging')}));imageUpload.addEventListener('drop',e=>showImage(e.dataTransfer.files[0]))}
if(removeImage)removeImage.addEventListener('click',e=>{e.stopPropagation();imageInput.value='';previewImage.removeAttribute('src');imagePreview.classList.remove('show');uploadEmpty.classList.remove('hide');if(selectedImageUrl){URL.revokeObjectURL(selectedImageUrl);selectedImageUrl=''}toast('Product image removed')});
