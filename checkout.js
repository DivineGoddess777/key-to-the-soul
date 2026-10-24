import {restoreRitualBag,bagLines} from './ritual-bag.js';
import {money} from './candle-sizes.js';
const $=s=>document.querySelector(s),params=new URLSearchParams(location.search);
let config,bag,quote,customer,fingerprint,order,nonce=crypto.randomUUID(),busy=false;
try{bag=restoreRitualBag(key=>localStorage.getItem(key));}catch{bag={items:{}};}
const status=message=>{$('#checkout-status').textContent=message;};
async function api(action,data){
 const response=await fetch('/api/checkout/'+action,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',credentials:'same-origin'});
 const payload=await response.json();if(!response.ok)throw Error(payload.error||'Checkout is temporarily unavailable.');return payload;
}
const p=(parent,text,className)=>{const node=document.createElement('p');node.textContent=text;if(className)node.className=className;parent.append(node);return node;};
function line(parent,label,value){const row=document.createElement('div');row.className='checkout-line';const name=document.createElement('span'),amount=document.createElement('strong');name.textContent=label;amount.textContent=value;row.append(name,amount);parent.append(row);}
function drawLines(parent,lines){parent.replaceChildren();for(const item of lines)line(parent,item.quantity+' × '+item.name+(item.number?' '+item.number:'')+' · '+item.size+' '+item.weight,money(item.quantity*item.unitCents));}
function summary(q){
 drawLines($('#order-details'),q.lines);
 const totals=document.createElement('div');totals.className='totals';for(const [label,cents] of [['Candles',q.subtotalCents],['Shipping',q.shippingCents],['Tax',q.taxCents],['Total',q.totalCents]])line(totals,label,money(cents));$('#order-details').append(totals);
}
function renderReview(){
 const c=customer,a=c.address;$('#customer-form').hidden=true;$('#review').hidden=false;
 $('#delivery-details').textContent=c.name+'\n'+c.email+'\n'+a.line1+(a.line2?'\n'+a.line2:'')+'\n'+a.city+', '+a.region+' '+a.postalCode+'\n'+a.country;
 summary(quote);$('#policy-summary').textContent=quote.processingTime+'. '+config.terms.carrier+' · '+config.terms.transit+'. '+config.terms.damage+' '+config.terms.returns;
 $('#accept-terms').checked=false;$('#accept-terms').closest('label').hidden=false;$('#pay').hidden=false;$('#pay').disabled=true;$('#edit').hidden=false;$('#cancel').hidden=!order;
 $('#review-title').textContent='Your ritual.';
 $('#review-title').tabIndex=-1;$('#review-title').focus({preventScroll:true});$('#review').scrollIntoView({block:'start',behavior:'instant'});
}
function showOrder(next){
 order=next;quote=next.quote;customer=next.customer;renderReview();
 if(!params.has('receipt'))history.replaceState(null,'',location.pathname+'?order='+encodeURIComponent(order.id));
 if(['PAID','FULFILLED','PAYMENT_REVIEW'].includes(order.status)){
  $('#review-title').textContent=order.status==='PAYMENT_REVIEW'?'Payment received.':order.status==='FULFILLED'?'Your ritual is on its way.':'Your ritual is confirmed.';
  status(order.status==='PAYMENT_REVIEW'?'Your payment was received after the reservation ended. Contact support@keytothesoul.com before placing another order.':'Payment confirmed'+(config.mode==='sandbox'?' · SANDBOX TEST ONLY — no real order or shipment.':'. Keep this page as your receipt.'));
  $('#accept-terms').closest('label').hidden=true;$('#pay').hidden=true;$('#edit').hidden=true;$('#cancel').hidden=true;
  p($('#order-details'),'Order '+order.id+' · PayPal capture '+order.captureId,'quiet');
  if(order.fulfillment)p($('#order-details'),'Shipped with '+order.fulfillment.carrier+' · '+order.fulfillment.trackingNumber,'quiet');
  if(order.paymentStatus&&order.paymentStatus!=='COMPLETED'){
   $('#review-title').textContent=order.paymentStatus==='REFUNDED'?'Your payment was refunded.':'A payment update.';
   status(order.paymentStatus==='REVERSED'?'PayPal reversed this payment. Contact support@keytothesoul.com about your order.':order.paymentStatus==='REFUND_PENDING'?'Your refund is pending with PayPal.':'PayPal reports '+order.paymentStatus.toLowerCase().replaceAll('_',' ')+'.');
   if(order.refundedCents)p($('#order-details'),'Refunded: '+money(order.refundedCents),'quiet');
  }
 }else if(['CANCELED','EXPIRED'].includes(order.status)||order.expiresAt<=Date.now()){
  status('This unpaid reservation ended. Return to the collection to start again.');$('#pay').hidden=true;$('#accept-terms').closest('label').hidden=true;$('#cancel').hidden=true;
 }
}
async function work(action){if(busy)return;busy=true;try{await action();}catch(error){status(error.message);$('#checkout-status').focus();}finally{busy=false;}}
$('#customer-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{
 const form=new FormData(event.target);customer={name:form.get('name'),email:form.get('email'),address:Object.fromEntries(['line1','line2','city','region','postalCode','country'].map(key=>[key,form.get(key)]))};
 if(String(form.get('region')).trim().toUpperCase()==='PA')customer.address.county=form.get('county');
 const result=await api('quote',{items:bag.items,customer});({quote,customer,fingerprint}=result);nonce=crypto.randomUUID();renderReview();status('Review your total and delivery details. Stock is held only when you continue to PayPal.');
});});
const deliveryState=$('#customer-form input[name=region]');
function updateCounty(){const show=deliveryState.value.trim().toUpperCase()==='PA';$('#county-label').hidden=!show;$('#delivery-county').required=show;}
deliveryState.addEventListener('input',updateCounty);deliveryState.addEventListener('change',updateCounty);updateCounty();
$('#accept-terms').addEventListener('change',()=>{$('#pay').disabled=!$('#accept-terms').checked;});
$('#edit').addEventListener('click',()=>work(async()=>{if(order){const result=await api('cancel',{id:order.id});showOrder(result.order);order=null;}$('#review').hidden=true;$('#customer-form').hidden=false;history.replaceState(null,'',location.pathname);status('Update your delivery details, then review your total again.');}));
$('#cancel').addEventListener('click',()=>work(async()=>{showOrder((await api('cancel',{id:order.id})).order);}));
$('#pay').addEventListener('click',()=>work(async()=>{
 if(!$('#accept-terms').checked)return;$('#pay').disabled=true;status('Preparing your secure PayPal checkout…');
 try{
  if(!order)order=(await api('reserve',{items:bag.items,customer,nonce,quoteFingerprint:fingerprint})).order;
  $('#cancel').hidden=false;
  history.replaceState(null,'',location.pathname+'?order='+encodeURIComponent(order.id));
  const result=await api('pay',{id:order.id});
  if(result.requiresCapture){showOrder((await api('capture',{id:order.id,paypalId:result.order.paypalId})).order);return;}
  if(!result.approvalUrl){showOrder(result.order);return;}
  const url=new URL(result.approvalUrl),hosts=config.mode==='sandbox'?['www.sandbox.paypal.com','sandbox.paypal.com']:['www.paypal.com','paypal.com'];
  if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.username||url.password)throw Error('PayPal returned an unexpected address.');
  location.assign(url.href);
 }finally{$('#pay').disabled=!$('#accept-terms').checked;}
}));
await work(async()=>{
 config=await api('config');$('#checkout-mode').textContent=config.message;
 if(params.has('receipt')){$('#checkout-layout').hidden=false;showOrder((await api('receipt?token='+encodeURIComponent(params.get('receipt')))).order);$('#edit').hidden=true;$('#pay').hidden=true;$('#cancel').hidden=true;$('#customer-form').hidden=true;return;}
 if(!config.enabled){$('#closed').hidden=false;return;}
 $('#checkout-layout').hidden=false;
 for(const country of config.countries){const option=document.createElement('option');option.value=country;option.textContent=new Intl.DisplayNames(['en'],{type:'region'}).of(country);$('#customer-form select[name=country]').append(option);}
 const terms=config.terms;p($('#shipping-terms'),'$8.95 flat-rate shipping. Free shipping on candle orders of $60 or more within the contiguous U.S.');p($('#shipping-terms'),terms.processingTime+'. '+terms.carrier+' · '+terms.transit+'.');p($('#shipping-terms'),terms.damage+' '+terms.returns);
 const id=params.get('order');
 if(id){
  showOrder((await api('order?id='+encodeURIComponent(id))).order);
  if(params.get('result')==='approved'&&!order.captureId){
   status('Confirming your PayPal payment…');
   try{showOrder((await api('capture',{id:order.id,paypalId:params.get('token')})).order);}catch(error){status(error.message+' Refresh this page to check the saved payment before trying again.');}
  }else if(params.get('result')==='canceled'&&!order.captureId)status('PayPal was closed. You can resume checkout or cancel this unpaid reservation.');
  return;
 }
 const lines=bagLines(bag.items);drawLines($('#bag-summary'),lines.filter(line=>line.size).map(line=>({name:line.product.name,number:line.product.number,size:line.size.short,weight:line.size.weight,quantity:line.qty,unitCents:line.size.priceCents})));
 if(!lines.length||lines.some(line=>!line.size)){status('Choose a candle and a size in your ritual bag before checking out.');$('#customer-form').hidden=true;}
});
