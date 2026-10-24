import {restoreRitualBag,bagLines} from './ritual-bag.js';
import {money} from './candle-sizes.js';
const $=selector=>document.querySelector(selector);
const status=$('#sandbox-status'),cart=$('#sandbox-cart'),total=$('#sandbox-total'),redirect=$('#paypal-redirect'),retry=$('#capture-retry');
const pendingKey='ktts-paypal-sandbox-pending';
const bag=restoreRitualBag(key=>{try{return localStorage.getItem(key);}catch{return null;}});
const lines=bagLines(bag.items),valid=lines.length&&lines.every(line=>line.size);
for(const line of lines){const p=document.createElement('p');p.textContent=line.qty+' × '+line.product.name+' · '+(line.size?line.size.short+' '+line.size.weight+' · '+money(line.qty*line.size.priceCents):'Choose a size in your ritual bag.');p.className='quiet-note';p.style.fontSize='13px';cart.append(p);}
if(!lines.length)cart.textContent='Add a candle and choose a size in your ritual bag first.';
if(valid)total.textContent='Test candle subtotal: '+money(lines.reduce((sum,line)=>sum+line.qty*line.size.priceCents,0));
let nonce=crypto.randomUUID(),popupNonce=crypto.randomUUID(),captureOrder;
async function post(path,body){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.error||'The sandbox test could not continue.');return data;}
function showReceipt(result){
 if(result.status!=='COMPLETED'||!result.test)throw Error('PayPal has not confirmed this test payment.');
 const receipt=$('#sandbox-receipt');receipt.replaceChildren();
 for(const text of ['Sandbox payment complete',money(result.totalCents)+' USD · test funds only','PayPal order: '+result.paypalId,'Capture: '+result.captureId,'Your ritual bag remains saved. No shipment or real store order was created.']){const p=document.createElement('p');p.textContent=text;receipt.append(p);}
 receipt.hidden=false;status.textContent=result.message;redirect.hidden=true;retry.hidden=true;$('#paypal-buttons').hidden=true;$('#popup-label').hidden=true;
 sessionStorage.removeItem(pendingKey);history.replaceState(null,'',location.pathname);nonce=crypto.randomUUID();
}
async function capture(id){
 captureOrder=id;retry.hidden=true;retry.disabled=true;redirect.hidden=true;$('#paypal-buttons').hidden=true;$('#popup-label').hidden=true;status.textContent='Verifying the sandbox payment with PayPal…';
 try{showReceipt(await post('/api/paypal/orders/'+encodeURIComponent(id)+'/capture',{}));}
 catch(error){status.textContent=error.message;retry.hidden=false;retry.disabled=false;}
}
retry.addEventListener('click',()=>capture(captureOrder));
redirect.addEventListener('click',async()=>{
 redirect.disabled=true;status.textContent='Preparing your sandbox checkout…';
 try{
  const pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
  if(pending?.nonce&&pending.cart===JSON.stringify(bag.items))nonce=pending.nonce;
  sessionStorage.setItem(pendingKey,JSON.stringify({nonce,cart:JSON.stringify(bag.items)}));
  const data=await post('/api/paypal/orders',{items:bag.items,nonce,flow:'redirect'});
  const url=new URL(data.approvalUrl);
  if(url.origin!=='https://www.sandbox.paypal.com'||url.pathname!=='/checkoutnow'||url.username||url.password)throw Error('The sandbox approval address is unavailable.');
  sessionStorage.setItem(pendingKey,JSON.stringify({nonce,id:data.id,cart:JSON.stringify(bag.items)}));location.assign(url.href);
 }catch(error){status.textContent=error.message;redirect.disabled=false;}
});
async function init(){
 const response=await fetch('/api/paypal/config',{cache:'no-store'}),config=await response.json();status.textContent=config.message;
 if(!config.enabled)return;
 const params=new URLSearchParams(location.search),pending=JSON.parse(sessionStorage.getItem(pendingKey)||'null');
 if(params.get('paypal')==='approved'){
  if(!pending?.id||params.get('token')!==pending.id){status.textContent='This approval does not match a checkout started in this tab. Return to your bag and start a new test.';return;}
  sessionStorage.setItem(pendingKey,JSON.stringify({...pending,approved:true}));await capture(pending.id);return;
 }
 if(pending?.approved&&/^[A-Z0-9]{10,32}$/.test(pending.id||'')){await capture(pending.id);return;}
 if(params.get('paypal')==='canceled'){
  sessionStorage.removeItem(pendingKey);history.replaceState(null,'',location.pathname);status.textContent='Sandbox test canceled. Your ritual bag is unchanged.';
 }
 if(!valid)return;
 redirect.hidden=false;$('#popup-label').hidden=false;
 const sdk=document.createElement('script');sdk.src='https://www.paypal.com/sdk/js?'+new URLSearchParams({'client-id':config.clientId,currency:'USD',intent:'capture',components:'buttons'});
 sdk.addEventListener('error',()=>{status.textContent='Popup controls could not load. Use Continue to PayPal Sandbox above.';});
 sdk.addEventListener('load',()=>paypal.Buttons({
  style:{layout:'vertical',shape:'rect',color:'gold',label:'paypal'},
  createOrder:async()=>{status.textContent='Creating a sandbox test order…';const data=await post('/api/paypal/orders',{items:bag.items,nonce:popupNonce});return data.id;},
  onApprove:async data=>{sessionStorage.setItem(pendingKey,JSON.stringify({id:data.orderID,approved:true}));await capture(data.orderID);},
  onCancel:()=>{popupNonce=crypto.randomUUID();status.textContent='Sandbox test canceled. Your ritual bag is unchanged.';},
  onError:()=>{status.textContent='Popup checkout could not continue. Try Continue to PayPal Sandbox above. Your bag is still saved.';}
 }).render('#paypal-buttons'));
 document.head.append(sdk);
}
init().catch(()=>{status.textContent='PayPal sandbox is not connected yet. Live checkout remains closed.';});
