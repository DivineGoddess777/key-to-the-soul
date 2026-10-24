import {membershipTerms,subscriptionApproval,subscriptionUUID} from './subscription-core.mjs';
const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const safe=row=>row?{id:row.id,status:row.status,paypalId:row.paypal_id,nextBillingAt:row.next_billing_at,cancelledAt:row.cancelled_at,failedPayments:row.failed_payments,cancellationRequestedAt:row.cancellation_requested_at,lastVerifiedAt:row.last_verified_at}:null;
async function body(request){
 if(!request.headers.get('content-type')?.startsWith('application/json')||Number(request.headers.get('content-length')||0)>8192||!request.body)throw Error('Check the membership form.');
 let size=0;const parts=[];for await(const part of request.body){size+=part.byteLength;if(size>8192)throw Error('Check the membership form.');parts.push(Buffer.from(part));}
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Check the membership form.');return value;
}
export function subscriptionConfig(env){
 const mode=env.VERCEL_ENV==='preview'?'sandbox':'live',prefix=mode==='sandbox'?'PAYPAL_SANDBOX_':'PAYPAL_LIVE_';
 const credentials={clientId:env[prefix+'CLIENT_ID'],secret:env[prefix+'CLIENT_SECRET']},plan=env[prefix+'TAROT_PLAN_ID'];
 const flag=mode==='sandbox'?env.KTTS_SUBSCRIPTIONS_SANDBOX==='1'&&env.KTTS_PRODUCTION!=='1':env.KTTS_LIVE_SUBSCRIPTIONS==='1'&&env.KTTS_PRODUCTION==='1'&&env.KTTS_MEMBERSHIP_TAX_REVIEWED==='1'&&/^[a-f0-9]{64}$/.test(env.CRON_SECRET||'');
 return {mode,credentials,plan,enabled:Boolean(flag&&/^P-[A-Z0-9]{10,40}$/.test(plan||'')&&credentials.clientId&&credentials.secret&&env.DATABASE_URL&&env[prefix+'WEBHOOK_ID'])};
}
export function createSubscriptionsApi({origin,mode,enabled=false,plan,authenticate,getStore,getGateway,getReconciler,clock=Date.now}){
 return async(request,action)=>{
  if(!['config','me','join','sync','cancel'].includes(action))return json(404,{error:'Not found.'});
  const mutating=['join','sync','cancel'].includes(action);
  if(request.method!==(mutating?'POST':'GET'))return json(405,{error:'Use your membership controls.'});
  if(action==='config')return json(200,{enabled,mode,terms:membershipTerms});
  if(!enabled)return json(503,{error:'Paid membership is not open yet.'});
  try{
   const user=await authenticate(request);if(!user)return json(401,{error:'Sign in before joining or managing membership.'});
   if(mutating&&request.headers.get('origin')!==origin)return json(403,{error:'Use membership controls on this site.'});
   let data;if(mutating)try{data=await body(request);}catch{return json(400,{error:'Check the membership form.'});}
   const store=await getStore();
   if(action==='me')return json(200,{subscription:safe(await store.current(user.id))});
   if(action==='join'){
    if(mode==='live'&&!user.recovery_email)return json(409,{error:'Verify your recovery email in Account settings before joining. This helps you keep access to your paid membership.'});
    if(data.termsVersion!==membershipTerms.version||data.consent!==true||!subscriptionUUID(data.nonce))return json(400,{error:'Review and accept the $11.11 monthly membership terms.'});
    let local=await store.begin(user.id,data.nonce,plan);const gateway=await getGateway();
    if(local.paypal_id){
     local=await (await getReconciler()).sync(local.id,user.id);
     if(local.status==='APPROVAL_PENDING'){const remote=await gateway.read(local.paypal_id);return json(200,{subscription:safe(local),approvalUrl:subscriptionApproval(remote,mode)});}
     return json(200,{subscription:safe(local)});
    }
    if(local.created_at<clock()-70*3600000)return json(409,{error:'This unfinished checkout needs review. Contact support@keytothesoul.com before starting another agreement.'});
    const claim=await store.claim(local.id,user.id);
    try{
     const remote=await gateway.create(claim.row);local=await store.bind(local.id,user.id,remote,claim.token);
     return json(200,{subscription:safe(local),approvalUrl:subscriptionApproval(remote,mode)});
    }finally{await store.release(local.id,claim.token);}
   }
   if(!subscriptionUUID(data.id))return json(400,{error:'Invalid membership reference.'});
   const local=await store.get(data.id,user.id);if(!local)return json(404,{error:'This membership is unavailable in your account.'});
   if(action==='cancel'&&data.confirm!==true)return json(400,{error:'Confirm that you want to stop monthly renewal.'});
   return json(200,{subscription:safe(await (await getReconciler()).sync(local.id,user.id,{cancel:action==='cancel'}))});
  }catch(error){return json(error.status||503,{error:error.status?error.message:'Membership billing is temporarily unavailable. Check your saved agreement before trying again.'});}
 };
}
