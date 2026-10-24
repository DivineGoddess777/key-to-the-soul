import {createPaypalClient} from './paypal-client.mjs';
import {planId,subscriptionId,subscriptionUUID,validateMonthlyPlan,validateSubscription,subscriptionApproval} from './subscription-core.mjs';
const fail=()=>{throw Object.assign(Error('Invalid PayPal membership reference.'),{status:409});};
export function createPaypalSubscriptions({mode,clientId,secret,origin,plan,request=fetch}){
 const site=new URL(origin);if(site.origin!==origin||site.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(site.hostname)||!planId(plan))throw Error('Configure membership billing privately.');
 const api=createPaypalClient({mode,clientId,secret,request});
 const valid=id=>{if(!subscriptionId(id))fail();return id;};
 let checked;
 async function verifyPlan(){if(!checked)checked=api('/v1/billing/plans/'+plan).then(value=>validateMonthlyPlan(value,plan)).catch(error=>{checked=undefined;throw error;});return checked;}
 return {
  verifyPlan,
  async create(local){
   await verifyPlan();if(!subscriptionUUID(local.id)||local.plan_id!==plan)fail();
   const back=origin+'/tarot.html?membership='+encodeURIComponent(local.id);
   const remote=await api('/v1/billing/subscriptions',{method:'POST',id:local.id,body:{plan_id:plan,custom_id:local.id,quantity:'1',application_context:{brand_name:'Key to the Soul',locale:'en-US',shipping_preference:'NO_SHIPPING',user_action:'SUBSCRIBE_NOW',payment_method:{payee_preferred:'IMMEDIATE_PAYMENT_REQUIRED'},return_url:back+'&result=approved',cancel_url:back+'&result=canceled'}}});
   if(!subscriptionId(remote.id))fail();validateSubscription(remote,{...local,paypal_id:remote.id});subscriptionApproval(remote,mode);return remote;
  },
  read:id=>api('/v1/billing/subscriptions/'+valid(id)),
  readSale:id=>{if(!/^[A-Z0-9]{6,40}$/.test(id||''))fail();return api('/v1/payments/sale/'+id);},
  async transactions(id,start,end){
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<=start||end-start>32*86400000)fail();
   const params=new URLSearchParams({start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString()});
   const result=await api('/v1/billing/subscriptions/'+valid(id)+'/transactions?'+params);
   const transactions=result.transactions===undefined&&result.total_items===0?[]:result.transactions;
   if(!Array.isArray(transactions)||Number(result.total_pages||1)>1||transactions.length>100)throw Object.assign(Error('The payment history needs additional reconciliation.'),{status:503});return transactions;
  },
  cancel:id=>api('/v1/billing/subscriptions/'+valid(id)+'/cancel',{method:'POST',body:{reason:'Member requested cancellation in the Key to the Soul account.'}})
 };
}
