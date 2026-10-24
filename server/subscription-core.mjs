export const membershipTerms=Object.freeze({version:'ember-monthly-2026-10-18',priceCents:1111,currency:'USD',interval:'month',personalReadingsPerPaidMonth:1,maxUnusedReadings:15,unlimitedSelfGuided:true,reader:'Keianna',cancelAnytime:true});
export const subscriptionId=id=>typeof id==='string'&&/^I-[A-Z0-9]{6,40}$/.test(id);
export const planId=id=>typeof id==='string'&&/^P-[A-Z0-9]{10,40}$/.test(id);
export const subscriptionUUID=id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id);
const fail=message=>{throw Object.assign(Error(message),{status:409});};
export function validateMonthlyPlan(plan,expectedId){
 const cycles=plan?.billing_cycles,cycle=cycles?.[0],preferences=plan?.payment_preferences;
 if(plan?.id!==expectedId||!planId(plan.id)||plan.status!=='ACTIVE'||cycles?.length!==1||cycle.tenure_type!=='REGULAR'||cycle.sequence!==1||cycle.total_cycles!==0||cycle.frequency?.interval_unit!=='MONTH'||cycle.frequency.interval_count!==1||cycle.pricing_scheme?.fixed_price?.currency_code!=='USD'||cycle.pricing_scheme.fixed_price.value!=='11.11'||plan.quantity_supported===true||preferences?.auto_bill_outstanding!==false||preferences?.payment_failure_threshold!==1||preferences.setup_fee&&Number(preferences.setup_fee.value)!==0||plan.taxes&&Number(plan.taxes.percentage)!==0)fail('The PayPal plan does not match the confirmed monthly membership.');
 return plan;
}
export function validateSubscription(remote,local){
 const statuses=['APPROVAL_PENDING','APPROVED','ACTIVE','SUSPENDED','CANCELLED','EXPIRED'];
 if(!remote||remote.id!==local.paypal_id||!subscriptionId(remote.id)||remote.plan_id!==local.plan_id||remote.custom_id!==local.id||!statuses.includes(remote.status)||remote.plan_overridden===true||remote.quantity!==undefined&&Number(remote.quantity)!==1||remote.shipping_amount&&Number(remote.shipping_amount.value)!==0)fail('PayPal membership details do not match this account.');
 return remote;
}
export function subscriptionApproval(remote,mode){
 const href=remote.links?.find(link=>link.rel==='approve')?.href;
 if(!href)fail('PayPal approval is not ready.');const url=new URL(href);
 const hosts=mode==='sandbox'?['www.sandbox.paypal.com','sandbox.paypal.com']:['www.paypal.com','paypal.com'];
 if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.username||url.password||url.port||url.hash||!/^BA-[A-Z0-9]{6,64}$/.test(url.searchParams.get('ba_token')||'')&&url.searchParams.get('subscription_id')!==remote.id)fail('PayPal returned an unexpected subscription approval address.');
 return url.href;
}
export function monthlyBoundary(anchor,offset){
 const source=new Date(anchor);if(!Number.isSafeInteger(anchor)||!Number.isInteger(offset)||!Number.isFinite(source.getTime()))fail('The billing date is unavailable.');
 const day=source.getUTCDate(),result=new Date(anchor);result.setUTCDate(1);result.setUTCMonth(result.getUTCMonth()+offset);
 const maxDay=new Date(Date.UTC(result.getUTCFullYear(),result.getUTCMonth()+1,0)).getUTCDate();result.setUTCDate(Math.min(day,maxDay));return result.getTime();
}
export function billingAnchor(remote,local={}){
 const start=Date.parse(remote.start_time);if(!Number.isSafeInteger(start))return null;
 const next=Date.parse(remote.billing_info?.next_billing_time);
 if(Number.isSafeInteger(next)&&next>start){
  const source=new Date(start),scheduled=new Date(next),candidate=new Date(start);
  candidate.setUTCHours(scheduled.getUTCHours(),scheduled.getUTCMinutes(),scheduled.getUTCSeconds(),scheduled.getUTCMilliseconds());
  const months=(scheduled.getUTCFullYear()-source.getUTCFullYear())*12+scheduled.getUTCMonth()-source.getUTCMonth();
  if(months<1||months>1200||monthlyBoundary(candidate.getTime(),months)!==next)fail('The monthly billing schedule needs reconciliation.');
  return candidate.getTime();
 }
 return Number.isSafeInteger(Number(local.billing_anchor))&&Number(local.billing_anchor)>0?Number(local.billing_anchor):start;
}
export function paidPeriod(anchor,time){
 const start=new Date(anchor),paid=new Date(time);let offset=(paid.getUTCFullYear()-start.getUTCFullYear())*12+paid.getUTCMonth()-start.getUTCMonth();
 if(!Number.isSafeInteger(anchor)||!Number.isSafeInteger(time)||time<anchor-300000||offset<0||offset>1200)fail('The paid billing period is unavailable.');
 if(time<monthlyBoundary(anchor,offset)-300000)offset--;if(offset<0)offset=0;
 return {periodStart:monthlyBoundary(anchor,offset),periodEnd:monthlyBoundary(anchor,offset+1)};
}
export function verifiedTransaction(transaction,remote,local,now=Date.now()){
 validateSubscription(remote,local);
 const id=transaction?.id,gross=transaction?.amount_with_breakdown?.gross_amount;
 if(!/^[A-Z0-9]{6,40}$/.test(id||'')||gross?.currency_code!=='USD'||gross.value!=='11.11')fail('The membership payment amount has not been verified.');
 const time=Date.parse(transaction.time),anchor=billingAnchor(remote,local);
 if(!Number.isSafeInteger(time)||time>now+300000)fail('The membership payment date has not been verified.');
 const period=paidPeriod(anchor,time);
 if(!['COMPLETED','PARTIALLY_REFUNDED','REFUNDED'].includes(transaction.status))return null;
 return {userId:local.user_id,paymentId:id,subscriptionId:local.paypal_id,...period,amountCents:1111,currency:'USD',refunded:transaction.status==='REFUNDED',partialRefund:transaction.status==='PARTIALLY_REFUNDED',paymentTime:time};
}
