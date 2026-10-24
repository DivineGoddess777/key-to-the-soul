import {validateSubscription,verifiedTransaction,subscriptionId} from './subscription-core.mjs';
const day=86400000;
const fail=message=>{throw Object.assign(Error(message),{status:503});};
export function createSubscriptionReconciler({store,readings,gateway,clock=Date.now}){
 async function payments(local,remote,start,end,{reversalPaymentId,refundPaymentId}={}){
  if(end<=start)return;
  const transactions=await gateway.transactions(local.paypal_id,start,end);
  if(refundPaymentId&&!transactions.some(t=>t.id===refundPaymentId&&['REFUNDED','PARTIALLY_REFUNDED'].includes(t.status)))fail('The refund is not yet visible in PayPal history.');
  transactions.sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  let reversalFound=false;
  for(const transaction of transactions){
   const reversing=transaction.id===reversalPaymentId;
   const verified=verifiedTransaction(reversing?{...transaction,status:'REFUNDED'}:transaction,remote,local,clock());
   if(!verified)continue;
   const known=await readings.payment(verified.paymentId);
   if(known){
    // Existing funded periods remain immutable even if PayPal changes the
    // scheduled UTC hour. Replays must still match the same account and cycle.
    if(String(known.user_id)!==String(local.user_id)||known.subscription_id!==local.paypal_id||known.amount_cents!==1111||new Date(Number(known.period_start)).toISOString().slice(0,10)!==new Date(verified.periodStart).toISOString().slice(0,10))fail('The saved membership payment needs reconciliation.');
    verified.periodStart=Number(known.period_start);verified.periodEnd=Number(known.period_end);
   }
   await readings.applyPaidMonth(verified);
   if(verified.refunded||reversing)await readings.voidPaidMonth({...verified,reversed:reversing});
   else if(verified.partialRefund)await readings.markPartialRefund(verified);
   if(reversing)reversalFound=true;
  }
  if(reversalPaymentId&&!reversalFound)fail('The reversed payment is not yet visible in PayPal history.');
 }
 async function sync(id,userId,{cancel=false,paymentId,paymentTime,reversed=false,refunded=false}={}){
  const started=Date.now(),claim=await store.claim(id,userId);let local=claim.row;
  try{
   if(!local.paypal_id)fail('Resume PayPal membership approval first.');
   await gateway.verifyPlan();let remote=validateSubscription(await gateway.read(local.paypal_id),local);
   if(cancel&&remote.status!=='CANCELLED'){
    if(!['ACTIVE','SUSPENDED'].includes(remote.status))fail('This agreement is not yet active. No renewal has been confirmed.');
    await store.cancellationRequested(id,userId,claim.token);
    try{await gateway.cancel(local.paypal_id);}catch(error){remote=validateSubscription(await gateway.read(local.paypal_id),local);if(remote.status!=='CANCELLED')throw error;}
    remote=validateSubscription(await gateway.read(local.paypal_id),local);
    if(remote.status!=='CANCELLED')fail('PayPal has not confirmed cancellation. Check again before assuming renewal has stopped.');
   }
   local=await store.updateRemote(id,userId,remote,claim.token);
   // PayPal has no transaction-history resource before buyer activation (404).
   // Process lifecycle notifications without asking for payment history; a sale
   // notification must retry until activation can be verified independently.
   if(['APPROVAL_PENDING','APPROVED'].includes(remote.status)){
    if(paymentId)fail('PayPal has not activated this membership payment yet.');
    return await store.get(id,userId);
   }
   const anchor=local.billing_anchor,now=clock();
   if(Number.isSafeInteger(anchor)&&anchor<=now){
    // Negative payment evidence is reconciled first so a late completion event
    // can never briefly resurrect a refunded or reversed credit.
    if(paymentId){
     const known=await readings.payment(paymentId),when=Number(known?.payment_time)||paymentTime;
     if(!Number.isSafeInteger(when)||when>now+300000)fail('The payment date needs reconciliation.');
     await payments(local,remote,Math.max(anchor-day,when-day),Math.min(when+day,now),{reversalPaymentId:reversed?paymentId:undefined,refundPaymentId:refunded?paymentId:undefined});
    }
    // Short bounded windows allow catch-up after missed callbacks. Each completed
    // window advances only after every payment was reconciled successfully.
    let from=Math.max(anchor-day,local.reconciled_through?local.reconciled_through-35*day:anchor-day);
    for(let count=0;count<3&&from<now&&Date.now()-started<65000;count++){
     const through=Math.min(from+31*day,now);await payments(local,remote,from,through);
     await store.advance(id,claim.token,through);from=through;
    }
   }
   return await store.get(id,userId);
  }finally{await store.release(id,claim.token);}
 }
 async function event(event){
  const type=event.event_type;
  if(type.startsWith('BILLING.SUBSCRIPTION.')){
   const local=await store.findByPayPal(event.resource.id);if(!local)return {ignored:true};await sync(local.id,local.user_id);return {reconciled:true};
  }
  if(!['PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REFUNDED','PAYMENT.SALE.REVERSED'].includes(type))return {ignored:true};
  const resource=event.resource;
  const linked=resource.links?.map(link=>{try{const url=new URL(link.href);return ['api.paypal.com','api-m.paypal.com','api.sandbox.paypal.com','api-m.sandbox.paypal.com'].includes(url.hostname)?url.pathname.match(/^\/v1\/payments\/sale\/([A-Z0-9]{6,40})$/)?.[1]:null;}catch{return null;}}).find(Boolean);
  const paymentId=resource.sale_id||linked||resource.id;
  if(!/^[A-Z0-9]{6,40}$/.test(paymentId||''))fail('Invalid membership payment reference.');
  const known=await readings.payment(paymentId);
  let providerId=resource.billing_agreement_id||known?.subscription_id,paymentTime=Number(known?.payment_time)||Date.parse(resource.create_time);
  if(!subscriptionId(providerId)){
   const sale=await gateway.readSale(paymentId);providerId=sale.billing_agreement_id;paymentTime=Date.parse(sale.create_time);
  }
  const local=await store.findByPayPal(providerId);if(!local)return {ignored:true};
  await sync(local.id,local.user_id,{paymentId,paymentTime,reversed:type==='PAYMENT.SALE.REVERSED',refunded:type==='PAYMENT.SALE.REFUNDED'});return {reconciled:true};
 }
 return {sync,event};
}
