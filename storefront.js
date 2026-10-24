import {initCatalog} from './catalog-ui.js';
import {products,getProduct,getIntention} from './storefront-state.js';
import {initRitualBag} from './ritual-bag-ui.js';
import {initMoonRoom} from './zen-ui.js';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const title=p=>p.name+(p.number?' '+p.number:'');
let selected='release',toastTimer;
function toast(message){const live=document.querySelector('dialog[open] .dialog-status');if(live)live.textContent=message;clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3300);}
function showDialog(dialog){document.querySelectorAll('dialog[open]').forEach(other=>{if(other!==dialog)other.close();});if(!dialog.open)dialog.showModal();document.body.classList.add('modal-open');}
document.querySelectorAll('dialog').forEach(dialog=>{
 dialog.addEventListener('close',()=>{if(dialog.id==='seal-dialog')$('#seal-frame').replaceChildren();if(!document.querySelector('dialog[open]'))document.body.classList.remove('modal-open');});
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
});
const {renderCollection,showProduct}=initCatalog({showDialog});
function setIntention(id){
 const intention=getIntention(id),p=products.find(p=>p.intention===id);if(!intention||!p)return;
 selected=id;
 document.querySelectorAll('[data-intention]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.intention===id)));
 $('#ritual-result').innerHTML=`<div class="ritual-card-label"><span>YOUR LITTLE RITUAL</span><span>${escape(intention.name.toUpperCase())}</span></div><span class="phase" aria-hidden="true">${intention.symbol}</span><h3>${escape(p.affirmation)}</h3><ol class="ritual-steps">${p.ritual.map(step=>`<li>${escape(step)}</li>`).join('')}</ol><div class="ritual-pairing"><div><span>A CANDLE FOR THIS MOMENT</span><strong>${escape(title(p))}</strong></div><button data-product="${p.id}" aria-label="Explore ${escape(title(p))}">↗</button></div><button class="save-ritual" data-save-ritual="${p.id}">Keep this ritual card ↓</button>`;
}
function saveRitual(id){
 const p=getProduct(id);if(!p)return;
 const text=['KEY TO THE SOUL','Hand-poured by Keianna','',getIntention(p.intention).name.toUpperCase(),'“'+p.affirmation+'”','',...p.ritual.map((step,i)=>(i+1)+'. '+step),'','A candle for this moment: '+title(p),'','Come as you are. Leave a little lighter.'].join('\n');
 const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download='key-to-the-soul-'+p.intention+'-ritual.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
 toast('Your ritual card is ready to keep.');
}
addEventListener('store:checkout',event=>{
 const config=event.detail;if(!config?.enabled)return;
 const status=config.mode==='sandbox'?'Sandbox checkout is ready for test accounts. No real orders.':'Made to order · choose your candle and size to begin checkout.';
 $('#collection-order-status').textContent=status;
 $('#ordering-answer').textContent=config.mode==='sandbox'?'This protected preview supports test checkout only. Use a PayPal Sandbox buyer account; no real order or shipment is created.':'Choose your candle and size, then review delivery and your full total at checkout. Candles are made to order, with 3–5 business days of handling before dispatch.';
});
fetch('/api/subscriptions/config',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(config=>{if(config?.enabled)$('#tarot-membership-summary').textContent='$11.11/month · One Keianna reading each month · Unlimited self-guided deck · Cancel anytime';}).catch(()=>{});
initRitualBag({showDialog,toast,showProduct});
initMoonRoom({showDialog});

document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.hasAttribute('data-close'))button.closest('dialog')?.close();
 if(button.dataset.filter)renderCollection(button.dataset.filter);
 if(button.dataset.product)showProduct(button.dataset.product);
 if(button.dataset.intention)setIntention(button.dataset.intention);
 if(button.dataset.note){setIntention(button.dataset.note);$('#ritual-room').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});$('#ritual-title').focus({preventScroll:true});}
 if(button.dataset.saveRitual)saveRitual(button.dataset.saveRitual);
 if(button.hasAttribute('data-open-3d')){
  const iframe=document.createElement('iframe');iframe.src='ember-3d.html?embed=1';iframe.title='Turn the warm copper Ember Seal';$('#seal-frame').replaceChildren(iframe);showDialog($('#seal-dialog'));
 }
});
$('#ritual-title').tabIndex=-1;
$('#year').textContent=new Date().getFullYear();
$('#menu-button').addEventListener('click',()=>{const open=$('#menu-button').getAttribute('aria-expanded')!=='true';$('#menu-button').setAttribute('aria-expanded',String(open));$('#site-links').dataset.open=String(open);});
$('#site-links').addEventListener('click',event=>{if(event.target.closest('a')){$('#menu-button').setAttribute('aria-expanded','false');$('#site-links').dataset.open='false';}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('#menu-button').getAttribute('aria-expanded')==='true'){$('#menu-button').setAttribute('aria-expanded','false');$('#site-links').dataset.open='false';$('#menu-button').focus();}});

const motionButton=document.createElement('button');motionButton.className='motion-toggle';motionButton.textContent='Pause decorative motion';motionButton.setAttribute('aria-pressed','false');$('.hero-bottom').append(motionButton);
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
function syncMotionPreference(){motionButton.disabled=motionPreference.matches;if(motionPreference.matches){motionButton.textContent='Reduced motion enabled';motionButton.setAttribute('aria-pressed','true');}else{const still=document.body.classList.contains('still');motionButton.textContent=still?'Resume decorative motion':'Pause decorative motion';motionButton.setAttribute('aria-pressed',String(still));}}
motionPreference.addEventListener('change',syncMotionPreference);syncMotionPreference();
motionButton.addEventListener('click',()=>{const still=document.body.classList.toggle('still');motionButton.setAttribute('aria-pressed',String(still));motionButton.textContent=still?'Resume decorative motion':'Pause decorative motion';});

let remaining=60000,deadline=0,interval=null,quietState='idle';
function drawTime(){
 const seconds=Math.ceil(remaining/1000);$('#quiet-time').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 $('#quiet-time').setAttribute('aria-label',seconds+' seconds remaining');$('#clock-ring').style.setProperty('--progress',String(remaining/60000*100)+'%');
}
function pauseQuiet(){
 if(quietState!=='running')return;remaining=Math.max(0,deadline-Date.now());clearInterval(interval);interval=null;quietState='paused';document.body.classList.remove('quiet-active');$('#quiet-toggle').textContent='Return to your minute ↗';$('#quiet-status').textContent='Your minute can wait for you.';drawTime();
}
function tick(){
 remaining=Math.max(0,deadline-Date.now());drawTime();
 if(remaining===0){clearInterval(interval);interval=null;quietState='complete';document.body.classList.remove('quiet-active');$('#quiet-toggle').textContent='Take another quiet minute ↗';$('#quiet-status').textContent='Carry a little of this quiet with you.';}
}
$('#quiet-toggle').addEventListener('click',()=>{
 if(quietState==='running'){pauseQuiet();return;}
 if(quietState==='complete')remaining=60000;
 quietState='running';deadline=Date.now()+remaining;document.body.classList.add('quiet-active');$('#quiet-toggle').textContent='Pause your minute';$('#quiet-status').textContent='Nothing to do. Just a little room for yourself.';tick();interval=setInterval(tick,250);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseQuiet();});
addEventListener('pagehide',()=>clearInterval(interval));
renderCollection();setIntention(selected);
