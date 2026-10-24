import {products,getProduct} from './storefront-state.js';
import {candleSizes,money} from './candle-sizes.js';
const $=id=>document.getElementById(id),status=$('desk-status');
let selectedOrder,stockRows=[],personalConfig,selectedReading;
const message=text=>status.textContent=text;
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
const date=value=>value?new Date(Number(value)).toLocaleString():'';
const label=sku=>{const [productId,sizeId]=sku.split('::'),p=getProduct(productId),s=candleSizes.find(size=>size.id===sizeId);return p&&s?p.name+(p.number?' '+p.number:'')+' · '+s.short+' '+s.weight:sku;};
async function api(action,{data,id}={}){
 const response=await fetch('/api/owner/'+action+(id?'?id='+encodeURIComponent(id):''),{credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});
 const payload=await response.json();if(!response.ok){if([401,403].includes(response.status)){$('desk').hidden=true;$('login-panel').hidden=false;$('order-detail').replaceChildren();$('order-list').replaceChildren();$('stock-list').replaceChildren();$('reading-queue').replaceChildren();$('reading-delivery').reset();$('owner-readings').hidden=true;selectedOrder=null;selectedReading=null;}throw Error(payload.error||'The order desk could not complete that request.');}return payload;
}
async function busy(button,action){button.disabled=true;try{await action();}catch(error){message(error.message);}finally{button.disabled=false;}}
async function readingApi(action,data){
 const response=await fetch('/api/personal-readings/'+action,{credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const result=await response.json();
 if(!response.ok){if([401,403].includes(response.status)){$('owner-readings').hidden=true;$('reading-queue').replaceChildren();$('reading-delivery').reset();selectedReading=null;}throw Error(result.error||'The personal reading queue is unavailable.');}return result;
}
async function refreshReadings(){
 if(!personalConfig)personalConfig=await readingApi('config');
 $('owner-readings').hidden=!personalConfig.enabled;if(!personalConfig.enabled)return;
 const {requests}=await readingApi('queue');$('reading-count').textContent=requests.filter(item=>item.status!=='READY').length+' awaiting Keianna';$('reading-queue').replaceChildren();
 for(const request of requests){
  const article=node('article',undefined,'owner-reading');article.append(node('p',request.status.replaceAll('_',' ')+' · '+date(request.created_at),'eyebrow'),node('h3',request.username),node('p',request.contact_email,'muted'),node('p',request.question,'reading-question'));
  if(request.status==='READY')article.append(node('p',request.response_text,'reading-answer'));
  else if(request.payment_review)article.append(node('p','Payment refunded or reversed. Resolve the payment before preparing this reading.','payment-review'));
  else{const button=node('button',request.status==='REQUESTED'?'Prepare this reading':'Continue this reading');button.type='button';button.addEventListener('click',()=>busy(button,async()=>{await readingApi('start',{id:request.id});selectedReading=request;$('reading-delivery').hidden=false;$('reading-delivery-title').textContent='A reading for '+request.username;$('reading-response').value='';$('reading-response').focus();await refreshReadings();}));article.append(button);}
  $('reading-queue').append(article);
 }
 if(!requests.length)$('reading-queue').append(node('p','No personal reading requests yet.','muted'));
}
function renderStock(){
 const filter=$('stock-filter').value.toLowerCase(),list=$('stock-list');list.replaceChildren();
 for(const row of stockRows.filter(row=>label(row.sku).toLowerCase().includes(filter))){
  const article=node('div',undefined,'stock-row'),title=node('div',label(row.sku));
  title.append(node('small',row.mode==='ready_stock'?'Ready stock':'Made to order'));
  const counts=node('span',row.mode==='ready_stock'?(row.on_hand-row.reserved)+' available · '+row.reserved+' held':row.reserved+' in checkout');
  const edit=node('button','Edit','quiet');edit.type='button';edit.setAttribute('aria-label','Edit '+label(row.sku));
  edit.addEventListener('click',()=>{$('stock-sku').value=row.sku;$('stock-mode').value=row.mode;$('stock-quantity').disabled=row.mode!=='ready_stock';$('stock-quantity').value=row.on_hand??'';$('stock-sku').focus();});
  article.append(title,counts,edit);list.append(article);
 }
 if(!list.children.length)list.append(node('p',stockRows.length?'No configured candles match.':'No candle availability has been configured yet.','muted'));
}
async function openOrder(id){
 selectedOrder=(await api('order',{id})).order;
 $('order-title').textContent='Order '+id.slice(0,8).toUpperCase();
 const detail=$('order-detail'),order=selectedOrder,quote=order.quote_json,customer=order.customer_json;detail.replaceChildren();
 detail.append(node('p',order.status.replaceAll('_',' ')+' · '+date(order.created_at),'eyebrow'));
 if(order.status==='PAYMENT_REVIEW')detail.append(node('p','Payment needs owner review. Do not ship until the payment and availability have been resolved.','payment-review'));
 if(customer){detail.append(node('h3',customer.name),node('p',customer.email));const address=customer.address;detail.append(node('address',[address.line1,address.line2,address.city+', '+address.region+' '+address.postalCode,address.country].filter(Boolean).join('\n')));}
 if(quote){const lines=node('ul');for(const line of quote.lines)lines.append(node('li',line.quantity+' × '+line.name+(line.number?' '+line.number:'')+' · '+line.size+' '+line.weight+' · '+money(line.unitCents)+' each'));detail.append(lines);const totals=node('dl');for(const [name,value] of [['Candles',quote.subtotalCents],['Shipping',quote.shippingCents],['Tax',quote.taxCents],['Total',quote.totalCents]])totals.append(node('dt',name),node('dd',money(value)));detail.append(totals,node('p','Processing: '+quote.processingTime,'muted'));}
 if(order.capture_id){
  detail.append(node('p','PayPal capture: '+order.capture_id,'muted'),node('p','Payment: '+(order.payment_status||'COMPLETED').replaceAll('_',' ')+' · Refunded '+money(order.refunded_cents||0),'muted'));
  const {refunds}=await api('refunds',{id}),pending=refunds.find(item=>item.state!=='DONE');
  if(pending||order.refunded_cents<order.total_cents&&order.payment_status!=='REVERSED'){
   const form=node('form',undefined,'refund-form'),heading=node('h3',pending?'Check the pending refund':'Refund this payment');form.append(heading);
   form.append(node('p','Refunds go through PayPal. Stock is not automatically restored. Review made-to-order work before confirming.','muted'));
   const label=node('label','Amount in USD'),amount=node('input');amount.type='number';amount.name='amount';amount.step='0.01';amount.min='0.01';amount.max=((order.total_cents-order.refunded_cents)/100).toFixed(2);amount.required=true;if(pending){amount.value=(pending.amount_cents/100).toFixed(2);amount.readOnly=true;amount.max=amount.value;}label.append(amount);form.append(label);
   const confirm=node('label',undefined,'refund-confirm'),check=node('input');check.type='checkbox';check.required=true;confirm.append(check,document.createTextNode(' I confirm this refund amount and want to send it to PayPal.'));form.append(confirm);
   const submit=node('button',pending?'Check / retry this refund':'Send confirmed refund');submit.type='submit';form.append(submit);let nonce=crypto.randomUUID();
   form.addEventListener('submit',event=>{event.preventDefault();busy(submit,async()=>{const value=amount.value;if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error('Enter a valid amount in dollars.');const [whole,fraction='']=value.split('.'),amountCents=Number(whole)*100+Number(fraction.padEnd(2,'0'));const result=await api('refund',{data:{id,nonce,amountCents,confirm:check.checked}});if(result.refund.status==='COMPLETED')nonce=crypto.randomUUID();await refresh();await openOrder(id);message('PayPal refund: '+result.refund.status.toLowerCase()+'.');});});detail.append(form);
  }
 }
 if(order.fulfillment_json)detail.append(node('p','Shipped with '+order.fulfillment_json.carrier+' · '+order.fulfillment_json.trackingNumber));
 $('ship-form').hidden=order.status!=='PAID'||order.payment_status!=='COMPLETED';
 document.querySelectorAll('[data-order-id]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.orderId===id)));
}
async function refresh(){
 const [orders,stock]=await Promise.all([api('orders'),api('stock')]);stockRows=stock.stock;renderStock();
 const list=$('order-list');list.replaceChildren();$('order-count').textContent=orders.orders.length+' recent';
 for(const order of orders.orders){const button=node('button',undefined,'order-row');button.type='button';button.dataset.orderId=order.id;button.setAttribute('aria-pressed',String(order.id===selectedOrder?.id));const left=node('div');left.append(node('strong',order.id.slice(0,8).toUpperCase()),node('span',date(order.created_at)));const right=node('div',money(order.total_cents));right.append(node('span',order.status.replaceAll('_',' '),order.status==='PAYMENT_REVIEW'?'review':undefined));button.append(left,right);button.addEventListener('click',()=>busy(button,()=>openOrder(order.id)));list.append(button);}
 if(!orders.orders.length)list.append(node('p','No orders yet. Live ordering remains closed until the launch setup is complete.','muted'));
 try{await refreshReadings();}catch{$('owner-readings').hidden=true;}
}
async function load(){
 const me=await api('me');$('login-panel').hidden=me.authorized;$('desk').hidden=!me.authorized;
 if(!me.authorized){message(me.username?'This account does not have active store owner access.':'Sign in to manage the store.');return;}
 $('environment-label').textContent=(me.environment==='sandbox'?'SANDBOX · TEST ORDERS ONLY':'PRODUCTION ORDER DESK')+' · '+me.username;
 await refresh();message('Owner desk ready.');
}
for(const product of products)for(const size of candleSizes){const option=node('option',product.name+(product.number?' '+product.number:'')+' · '+size.short+' '+size.weight+' · '+money(size.priceCents));option.value=product.id+'::'+size.id;$('stock-sku').append(option);}
$('owner-login').addEventListener('submit',event=>{event.preventDefault();const button=event.submitter;busy(button,async()=>{const form=new FormData(event.target);const response=await fetch('/api/members/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:form.get('username'),password:form.get('password')})});const result=await response.json();$('owner-login').elements.password.value='';if(!response.ok)throw Error(result.error||'Sign-in failed.');await load();});});
$('stock-mode').addEventListener('change',()=>{$('stock-quantity').disabled=$('stock-mode').value!=='ready_stock';$('stock-quantity').required=!$('stock-quantity').disabled;});
$('stock-filter').addEventListener('input',renderStock);
$('stock-form').addEventListener('submit',event=>{event.preventDefault();busy(event.submitter,async()=>{const form=new FormData(event.target);await api('stock',{data:{sku:form.get('sku'),mode:form.get('mode'),onHand:form.get('mode')==='made_to_order'?null:Number(form.get('onHand'))}});await refresh();message('Candle availability saved.');});});
$('ship-form').addEventListener('submit',event=>{event.preventDefault();busy(event.submitter,async()=>{const form=new FormData(event.target);await api('ship',{data:{id:selectedOrder.id,carrier:form.get('carrier'),trackingNumber:form.get('trackingNumber')}});await refresh();await openOrder(selectedOrder.id);message('Shipment recorded; tracking email queued. No shipping label was purchased.');});});
$('reading-delivery').addEventListener('submit',event=>{event.preventDefault();if(!selectedReading)return;busy(event.submitter,async()=>{await readingApi('deliver',{id:selectedReading.id,responseText:$('reading-response').value});selectedReading=null;event.target.reset();event.target.hidden=true;await refreshReadings();message('Personal reading delivered to the member’s private room. No email was sent.');});});
$('refresh').addEventListener('click',event=>busy(event.currentTarget,async()=>{await refresh();message('Orders and availability refreshed.');}));
$('expire').addEventListener('click',event=>busy(event.currentTarget,async()=>{const result=await api('expire',{data:{}});await refresh();message(result.expired+' expired checkout holds released.');}));
$('logout').addEventListener('click',event=>busy(event.currentTarget,async()=>{await fetch('/api/members/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:'{}'});selectedOrder=null;selectedReading=null;$('order-detail').replaceChildren();$('order-list').replaceChildren();$('stock-list').replaceChildren();$('reading-queue').replaceChildren();$('reading-delivery').reset();$('owner-readings').hidden=true;await load();}));
load().catch(error=>{message(error.message);$('login-panel').hidden=false;});
