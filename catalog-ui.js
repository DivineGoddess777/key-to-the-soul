import {products,getProduct,getIntention} from './storefront-state.js';
import {collections} from './catalog-collections.js';
import {candleSizes,getSize,money,sizeLabel} from './candle-sizes.js';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const title=p=>p.name+(p.number?' '+p.number:'');
export function initCatalog({showDialog}){
 const $=selector=>document.querySelector(selector);
 let current='featured';
 function renderCollection(filter=current,resetIntention=true){
  if(!collections.some(c=>c.id===filter))filter='featured';current=filter;
  if(resetIntention)$('#collection-intention-filter').value='all';
  const intention=$('#collection-intention-filter').value;
  const visible=products.filter(p=>(filter==='all'||p.collections.includes(filter))&&(intention==='all'||p.intention===intention));
  $('#product-grid').classList.toggle('filtered',filter!=='all');
  $('#product-grid').innerHTML=visible.length?visible.map(p=>{
   const name=filter==='angel'?(p.number||p.name):p.name;
   const art=p.image?`<img src="${p.image}" alt="${escape(p.alt)}" loading="lazy" width="400" height="500">`:`<span class="collection-art"><img src="logos/ember-copper.svg" alt=""><strong>${escape(p.symbol||'◯')}</strong><small>COLLECTION ARTWORK<br>PRODUCT PHOTO COMING SOON</small></span>`;
   return `<article class="product-card"><button class="product-image ${p.image?'':'artwork-card'}" data-product="${p.id}" aria-label="Explore ${escape(title(p))}">${art}${p.number&&filter!=='angel'?`<span class="product-number">${p.number}</span>`:''}<span class="product-peek">Choose your ritual size <span aria-hidden="true">↗</span></span></button><div class="product-info"><span class="product-intention">${escape(filter==='zodiac'?'Zodiac':filter==='angel'?'Angel Number':getIntention(p.intention).name)}</span><h3><button data-product="${p.id}">${escape(name)}</button></h3><p>${escape(filter==='angel'&&p.number?p.name:(p.scent||'Includes herbs + crystals'))}</p><div class="product-actions"><span class="card-price">Mini ${money(getSize('mini').priceCents)}</span><button data-product="${p.id}" aria-label="Choose a size for ${escape(title(p))}">Choose a size <span aria-hidden="true">↗</span></button></div></div></article>`;
  }).join(''):'<div class="collection-empty"><p>No candles match this combination yet.</p><button class="quiet-link" data-filter="all">See all candles ↗</button></div>';
  $('#collection-count').textContent=visible.length+(visible.length===1?' candle':' candles')+' / '+collections.find(c=>c.id===filter).name;
  document.querySelectorAll('[data-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.filter===filter)));
 }
 function showProduct(id){
  const p=getProduct(id);if(!p)return;
  const image=p.image?`<div class="detail-photo"><img class="detail-image" src="${p.image}" alt="${escape(p.alt)}"><span>Collection photo · size-specific details confirmed before ordering</span>${p.gallery?.length?`<div class="photo-views" role="group" aria-label="Candle photo views">${[{image:p.image,alt:p.alt},...p.gallery].map((photo,index)=>`<button type="button" data-photo-product="${p.id}" data-photo-index="${index}" aria-label="View ${index===0?'styled':'original'} ${escape(title(p))} photo" aria-pressed="${index===0}"><img src="${photo.image}" alt=""></button>`).join('')}</div>`:''}</div>`:`<div class="detail-art"><img src="logos/ember-copper.svg" alt="Ember Seal collection artwork"><strong>${escape(p.symbol||p.name)}</strong><span>COLLECTION ARTWORK / PRODUCT PHOTO COMING SOON</span></div>`;
  $('#product-detail').innerHTML=`<div class="detail-grid">${image}<div class="detail-copy"><p class="eyebrow">${escape(getIntention(p.intention).name.toUpperCase())}</p><h2 id="product-title">${escape(title(p))}</h2><p class="detail-scent">${escape(p.scent||'Scent details will be confirmed before ordering')}</p><p class="detail-description">${escape(p.description)}</p><p class="inclusions">Includes herbs + crystals</p><fieldset class="size-options"><legend>Choose your ritual size</legend>${candleSizes.map(size=>`<label><input type="radio" name="candle-size" value="${size.id}"><span><strong>${escape(size.name)}</strong><small>${escape(size.weight+' · '+size.purpose)}</small></span><b>${money(size.priceCents)}</b></label>`).join('')}</fieldset><p id="size-confirmation" class="size-confirmation" role="status">Select a size to save this candle to your bag.</p><button class="button" data-add="${p.id}" disabled>Choose a size first</button><small>Prices shown are per candle, before shipping and any applicable tax. ${document.documentElement.dataset.checkoutMode?document.documentElement.dataset.checkoutMode==='sandbox'?'Sandbox test checkout only.':'Made to order.':'Online ordering opens soon.'}</small><p class="detail-affirmation">“${escape(p.affirmation)}”</p><p class="eyebrow">YOUR LITTLE RITUAL</p><ol class="ritual-steps">${p.ritual.map(step=>`<li>${escape(step)}</li>`).join('')}</ol><button class="save-ritual" data-save-ritual="${p.id}">Save your ritual card ↓</button><p class="dialog-status" role="status"></p></div></div>`;
  showDialog($('#product-dialog'));
 }
 $('#product-dialog').addEventListener('click',event=>{
  const button=event.target.closest('[data-photo-product]');if(!button)return;
  const p=getProduct(button.dataset.photoProduct),photo=[{image:p.image,alt:p.alt},...(p.gallery||[])][Number(button.dataset.photoIndex)];if(!photo)return;
  const image=$('#product-detail .detail-image');image.src=photo.image;image.alt=photo.alt;
  document.querySelectorAll('[data-photo-product]').forEach(view=>view.setAttribute('aria-pressed',String(view===button)));
 });
 $('#collection-intention-filter').addEventListener('change',()=>renderCollection(current,false));
 $('#product-dialog').addEventListener('change',event=>{
  if(event.target.name!=='candle-size')return;
  const size=getSize(event.target.value);if(!size)return;
  const button=$('#product-dialog [data-add]');button.disabled=false;button.dataset.size=size.id;button.textContent='Add '+size.short+' to ritual bag +';
  $('#size-confirmation').textContent=sizeLabel(size)+' · '+money(size.priceCents)+' per candle, before shipping and any applicable tax.';
 });
 return {renderCollection,showProduct};
}
