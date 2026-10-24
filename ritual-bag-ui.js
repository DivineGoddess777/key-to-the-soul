import {getProduct,getIntention} from './storefront-state.js';
import {candleSizes,getSize,sizeLabel,money} from './candle-sizes.js';
import {BAG_STORAGE_KEY,PREVIOUS_BAG_KEY,OLDER_BAG_KEY,LEGACY_BAG_KEY,normalizeNote,normalizeRitualBag,restoreRitualBag,summarizeBag,formatBagSummary,bagLines,getBagLine,lineKey,changeBagLine,addBagItem,resizeBagLine} from './ritual-bag.js';
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const title=p=>p.name+(p.number?' '+p.number:'');
export function initRitualBag({showDialog,toast,showProduct}){
 const $=selector=>document.querySelector(selector),dialog=$('#bag-dialog');
 let state=normalizeRitualBag(null),storageAvailable=true,undo=null,checkoutEnabled=false;
 try{state=restoreRitualBag(key=>localStorage.getItem(key));}catch{storageAvailable=false;}
 function persist(){
  try{localStorage.setItem(BAG_STORAGE_KEY,JSON.stringify(state));localStorage.removeItem(PREVIOUS_BAG_KEY);localStorage.removeItem(OLDER_BAG_KEY);localStorage.removeItem(LEGACY_BAG_KEY);storageAvailable=true;}catch{storageAvailable=false;}
 }
 function preservation(){
  $('.bag-foot small').textContent=storageAvailable?'Your candles and intention are saved only in this browser. This bag is not an order or a stock reservation.':'Available for this visit only. Download a copy to keep your selections; browser storage is unavailable.';
  const message=storageAvailable?'Saved only in this browser.':'Available for this visit. Download a copy to keep it.';
  if($('#bag-note-status').textContent!==message)$('#bag-note-status').textContent=message;
 }
 function render(){
  const summary=summarizeBag(state.items),lines=bagLines(state.items);
  $('#bag-checkout').hidden=!checkoutEnabled||!summary.count||Boolean(summary.unpricedCount);
  $('.bag-launch-note').textContent=checkoutEnabled?'REVIEW SHIPPING AND TOTAL AT CHECKOUT':'ONLINE ORDERING OPENS SOON';
  document.querySelectorAll('.bag-count').forEach(node=>node.textContent=String(summary.count));
  document.querySelectorAll('[data-open-bag]').forEach(button=>button.setAttribute('aria-label','Open ritual bag, '+summary.count+(summary.count===1?' item':' items')));
  $('#bag-overview').hidden=!summary.count;
  $('#bag-summary-count').textContent=summary.count+(summary.count===1?' candle':' candles')+' · '+summary.types+(summary.types===1?' favorite':' favorites');
  $('#bag-intentions').innerHTML=summary.intentions.map(id=>'<span>'+escape(getIntention(id).name)+'</span>').join('');
  $('#bag-price-label').textContent=summary.unpricedCount?'Partial candle subtotal':'Candle subtotal';
  $('#bag-price-range').textContent=summary.count>summary.unpricedCount?money(summary.subtotalCents):'Choose your sizes';
  $('#bag-price-note').textContent=(summary.unpricedCount?summary.unpricedCount+' candle'+(summary.unpricedCount===1?' needs':'s need')+' a size. ':'')+'Shipping and any applicable tax are not included.';
  $('#bag-items').innerHTML=lines.length?lines.map(line=>{
   const p=line.product,key=line.key;
   return `<div class="bag-item"><button class="bag-photo-link ${p.image?'':'illustration'}" data-product="${p.id}" aria-label="View ${escape(title(p))}"><img src="${p.image||'logos/ember-copper.svg'}" alt="${escape(p.image?p.alt:'Ember Seal collection artwork')}"></button><div><h3><button class="bag-product-link" data-product="${p.id}">${escape(title(p))}</button></h3><p>${escape(getIntention(p.intention).name)} · Herbs + crystals</p><label class="bag-size-label">Ritual size<select data-line-size="${key}" aria-label="Size for ${escape(title(p))}"><option value="" disabled ${line.size?'':'selected'}>Choose a size</option>${candleSizes.map(size=>`<option value="${size.id}" ${line.size?.id===size.id?'selected':''}>${escape(sizeLabel(size)+' · '+money(size.priceCents))}</option>`).join('')}</select></label><p class="bag-line-price">${line.size?money(line.qty*line.size.priceCents)+' subtotal':(line.legacyDeluxe?'Previously Deluxe 10–12 oz. Choose Large 10 oz or Deluxe 12 oz.':'Choose a size for a subtotal')}</p><div class="quantity"><button data-qty="${key}" data-delta="-1" aria-label="Remove one ${escape(title(p))} ${line.size?.short||''}">−</button><span aria-label="Quantity ${line.qty}">${line.qty}</span><button data-qty="${key}" data-delta="1" aria-label="Add one ${escape(title(p))} ${line.size?.short||''}" ${line.qty>=9?'disabled':''}>+</button><button class="remove-item" data-remove="${key}" aria-label="Remove ${escape(title(p))} ${line.size?.short||''}">Remove</button></div></div></div>`;
  }).join(''):'<div class="bag-empty"><img src="logos/ember-copper.svg" alt="" width="105" height="105"><p>A little room for<br><em>something that speaks to you.</em></p><small>Choose a candle and its ritual size. Your favorites and personal intention stay here for you.</small><button class="quiet-link" id="bag-find-ritual">Help me find my ritual ↗</button></div>';
  $('#bag-note-wrap').hidden=!summary.count;
  if(document.activeElement!==$('#bag-note'))$('#bag-note').value=state.note;
  $('#bag-note-count').textContent=Array.from(state.note).length+'/240';
  $('#bag-download').disabled=!summary.count;$('#bag-clear').disabled=!summary.count;
  $('#bag-undo-row').hidden=!undo;if(undo)$('#bag-undo-message').textContent=undo.message;preservation();
 }
 function change(key,delta){
  const line=getBagLine(key);if(!line||![-1,1].includes(delta))return;
  if(delta>0&&(state.items[line.key]||0)>=9){toast('You can save up to 9 of each candle and size.');return;}
  const previous=state.items;state={...state,items:changeBagLine(state.items,key,delta)};
  undo=delta<0&&!state.items[line.key]?{items:previous,message:title(line.product)+' removed.'}:null;persist();render();
 }
 function add(id,sizeId){
  if(!getProduct(id))return;
  if(!getSize(sizeId)){showProduct(id);return;}
  const key=lineKey(id,sizeId);
  if((state.items[key]||0)>=9){showDialog(dialog);toast('You can save up to 9 of each candle and size.');return;}
  state={...state,items:addBagItem(state.items,id,sizeId)};undo=null;persist();render();showDialog(dialog);toast(title(getProduct(id))+' · '+getSize(sizeId).short+' added to your bag.');
 }
 function remove(key){
  const line=getBagLine(key);if(!line||!state.items[line.key])return;
  const previous=state.items,items={...previous};delete items[line.key];state={...state,items};undo={items:previous,message:title(line.product)+' removed.'};persist();render();$('#bag-undo').focus();toast('Candle removed. You can undo this.');
 }
 document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-open-bag')){render();showDialog(dialog);}
  if(button.dataset.add)add(button.dataset.add,button.dataset.size);
  if(button.dataset.qty){const key=button.dataset.qty,delta=Number(button.dataset.delta);change(key,delta);const next=dialog.querySelector(`[data-qty="${key}"][data-delta="${delta}"]`);(next&&!next.disabled?next:undo?$('#bag-undo'):dialog.querySelector('[data-close]')).focus();}
  if(button.dataset.remove)remove(button.dataset.remove);
  if(button.id==='bag-clear'){if(!summarizeBag(state.items).count)return;undo={items:state.items,message:'Your bag was cleared.'};state={...state,items:{}};persist();render();$('#bag-undo').focus();toast('Bag cleared. Your intention is kept, and you can undo this.');}
  if(button.id==='bag-undo'&&undo){state={...state,items:undo.items};undo=null;persist();render();toast('Your candles are back.');$('#bag-download').focus();}
  if(button.id==='bag-download'){
   if(!summarizeBag(state.items).count)return;
   const blob=new Blob([formatBagSummary(state)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='key-to-the-soul-ritual-bag.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('Your ritual bag summary is ready to keep.');
  }
  if(button.id==='bag-find-ritual'){dialog.close();$('#ritual-room').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('#ritual-title').focus({preventScroll:true});}
 });
 dialog.addEventListener('change',event=>{
  const select=event.target.closest('[data-line-size]');if(!select)return;
  const line=getBagLine(select.dataset.lineSize),result=resizeBagLine(state.items,select.dataset.lineSize,select.value);
  if(result.error){select.value=line?.size?.id||'';toast(result.error==='quantity-limit'?'These sizes would combine to more than 9. Reduce the quantity first.':'Choose a listed size.');return;}
  state={...state,items:result.items};undo=null;persist();render();
  dialog.querySelector(`[data-line-size="${lineKey(line.product.id,select.value)}"]`)?.focus();toast('Ritual size updated. Your candle subtotal has changed.');
 });
 $('#bag-note').addEventListener('input',event=>{const note=normalizeNote(event.target.value);state={...state,note};if(event.target.value!==note)event.target.value=note;$('#bag-note-count').textContent=Array.from(note).length+'/240';persist();preservation();});
 addEventListener('storage',event=>{
  if(event.key!==BAG_STORAGE_KEY&&event.key!==null)return;
  let next=normalizeRitualBag(null);try{next=event.key===null?next:normalizeRitualBag(JSON.parse(event.newValue||'null'));}catch{return;}
  if(document.activeElement===$('#bag-note'))next.note=state.note;state=next;undo=null;render();
 });
 function openFromHash(){if(location.hash==='#ritual-bag'){render();showDialog(dialog);}}
 addEventListener('hashchange',openFromHash);dialog.addEventListener('close',()=>{if(location.hash==='#ritual-bag')history.replaceState(null,'',location.pathname+location.search);});
 render();openFromHash();
 fetch('/api/checkout/config',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(config=>{checkoutEnabled=config?.enabled===true;document.documentElement.dataset.checkoutMode=checkoutEnabled?config.mode:'';dispatchEvent(new CustomEvent('store:checkout',{detail:config}));render();}).catch(()=>{});
}
