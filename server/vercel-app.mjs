import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {isIP} from 'node:net';
import {createMembershipHandler} from '../membership.js';
import {connectPostgresMembers} from './membership-postgres.mjs';
import {createPaypalSandbox} from '../paypal-sandbox.mjs';
import {connectSandboxOrders} from './paypal-orders-postgres.mjs';
import {connectOrders as connectCommerceOrders} from './orders-postgres.mjs';
import {createOwnerApi} from './owner-api.mjs';
import {createCheckoutApi} from './checkout-api.mjs';
import {createPaypalCommerce} from './paypal-commerce.mjs';
import {commerceConfig} from './commerce-config.mjs';
import {connectWebhookEvents,createPaypalWebhookHandler,createPaypalWebhookVerifier,createOrderPaymentReconciler} from './paypal-webhooks.mjs';
import {connectPersonalReadings} from './personal-readings-postgres.mjs';
import {createPersonalReadingsApi} from './personal-readings-api.mjs';
import {connectSubscriptions as connectSubscriptionStore} from './subscriptions-postgres.mjs';
import {createPaypalSubscriptions} from './paypal-subscriptions.mjs';
import {createSubscriptionsApi,subscriptionConfig} from './subscriptions-api.mjs';
import {createSubscriptionReconciler} from './subscription-reconcile.mjs';
import {createStoreMaintenance} from './store-maintenance.mjs';
import {connectMailOutbox,dispatchStoreMail} from './mail-outbox.mjs';
import {storeMailConfig,createWorkspaceMailer} from './store-mail.mjs';
import {connectRecovery,dispatchAccountMail} from './account-recovery.mjs';
import {createRecoveryApi} from './recovery-api.mjs';
const json=(status,payload)=>Response.json(payload,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const clientKey=req=>{const ip=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();return isIP(ip)?ip:'unavailable';};
export function deploymentOrigin(env){
 // Preview origins come only from Vercel's deployment metadata, never Host or Origin headers.
 const previewHost=env.VERCEL==='1'&&env.VERCEL_ENV==='preview'&&/^[a-z0-9][a-z0-9-]*\.vercel\.app$/.test(env.VERCEL_URL||'')?env.VERCEL_URL:null;
 const configured=env.KTTS_ORIGIN||(previewHost?'https://'+previewHost:null);
 if(!configured)throw Error('Site origin is not configured.');
 const origin=new URL(configured);
 if(origin.protocol!=='https:'||origin.origin!==configured)throw Error('Use an exact HTTPS site origin.');
 return origin.origin;
}
function nodeRequest(request,pathname){
 const req=request.body?Readable.fromWeb(request.body):Readable.from([]);
 req.method=request.method;req.headers=Object.fromEntries(request.headers);req.socket={remoteAddress:'vercel'};req.url=pathname;return req;
}
async function nodeResponse(handler,req){
 let status=200,headers={},body;
 const res={writeHead(code,next={}){status=code;headers=next;return this;},end(value){body=value;return this;}};
 if(!await handler.handle(req,res))return json(404,{error:'Not found.'});
 return new Response(body,{status,headers});
}
export function modelDestination(file,base,manifest){
 if(!manifest.files.some(entry=>entry.path==='models/'+file))return null;
 const url=new URL(base);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Invalid model delivery origin.');
 url.pathname=url.pathname.replace(/\/?$/,'/');
 return new URL(file,url).href;
}
export function createVercelApp({env=process.env,connect=connectPostgresMembers,connectOrders=connectSandboxOrders,connectCommerce=connectCommerceOrders,connectEvents=connectWebhookEvents,connectReadings=connectPersonalReadings,connectSubscriptions=connectSubscriptionStore,connectRecovery:connectAccountRecovery=connectRecovery,paypalRequest=fetch,loadAsset=name=>name==='tarot-deck.js'?readFile(new URL('../tarot-deck.js',import.meta.url)):readFile(new URL('../tarot-state.js',import.meta.url)),loadManifest=()=>readFile(new URL('../models/manifest.json',import.meta.url),'utf8').then(JSON.parse)}={}){
 let ready,sandbox,commerce,webhook,personal,billing,outbox,recovery,memberStorage;
 const siteOrigin=()=>deploymentOrigin(env);
 async function membership(){
  const origin=siteOrigin();
  if(!env.DATABASE_URL)throw Error('Member storage is not configured.');
  // Only this Vercel adapter trusts the client-IP header overwritten by Vercel.
  if(!ready)ready=connect(env.DATABASE_URL).then(store=>{memberStorage=store;return createMembershipHandler(store,{origin,secure:true,clientKey});}).catch(error=>{ready=undefined;throw error;});
  return ready;
 }
 const sandboxEnabled=()=>env.VERCEL_ENV==='preview'&&env.KTTS_PRODUCTION!=='1'&&env.KTTS_PAYPAL_SANDBOX==='1'&&Boolean(env.PAYPAL_SANDBOX_CLIENT_ID&&env.PAYPAL_SANDBOX_CLIENT_SECRET&&env.DATABASE_URL);
 async function paypal(){
  if(!sandbox)sandbox=connectOrders(env.DATABASE_URL).then(store=>createPaypalSandbox({origin:siteOrigin(),store,secure:true,enabled:true,production:false,clientId:env.PAYPAL_SANDBOX_CLIENT_ID,secret:env.PAYPAL_SANDBOX_CLIENT_SECRET,request:paypalRequest,clientKey})).catch(error=>{sandbox=undefined;throw error;});
  return sandbox;
 }
 function readingStore(){
  const environment=env.VERCEL_ENV==='preview'?'sandbox':'live';
  if(!personal)personal=connectReadings(env.DATABASE_URL,{environment}).catch(error=>{personal=undefined;throw error;});return personal;
 }
 function subscriptionServices(){
  if(!billing)billing=(async()=>{
   const config=subscriptionConfig(env),[store,readings]=await Promise.all([connectSubscriptions(env.DATABASE_URL,{environment:config.mode}),readingStore()]);
   const gateway=createPaypalSubscriptions({mode:config.mode,...config.credentials,origin:siteOrigin(),plan:config.plan,request:paypalRequest});
   return {store,gateway,reconciler:createSubscriptionReconciler({store,readings,gateway})};
  })().catch(error=>{billing=undefined;throw error;});return billing;
 }
 const recoveryEnabled=()=>env.KTTS_ACCOUNT_RECOVERY==='1'&&Boolean(env.DATABASE_URL)&&storeMailConfig(env).enabled;
 const recoveryStore=()=>{
  if(!recovery)recovery=connectAccountRecovery(env.DATABASE_URL,{environment:env.VERCEL_ENV==='preview'?'sandbox':'live',secret:env.KTTS_RECEIPT_SECRET}).catch(error=>{recovery=undefined;throw error;});return recovery;
 };
 return async function fetchRequest(request){
  const url=new URL(request.url),kind=url.searchParams.get('kind'),file=url.searchParams.get('file'),action=url.searchParams.get('action');
  if(kind==='account'){
   return createRecoveryApi({enabled:recoveryEnabled(),origin:siteOrigin(),authenticate:async req=>(await membership()).currentUser({headers:Object.fromEntries(req.headers)}),reauthenticate:async(username,password)=>{await membership();return memberStorage.login(username,password);},getStore:recoveryStore,clientKey:req=>clientKey({headers:Object.fromEntries(req.headers)})})(request,action);
  }
  if(kind==='maintenance'){
   const config=subscriptionConfig(env),mailConfig=storeMailConfig(env);
   return createStoreMaintenance({secret:env.CRON_SECRET,subscriptionEnabled:config.enabled,emailEnabled:mailConfig.enabled,getSubscriptions:subscriptionServices,getOrders:env.DATABASE_URL?()=>{
    if(!commerce)commerce=connectCommerce(env.DATABASE_URL,{environment:config.mode}).catch(error=>{commerce=undefined;throw error;});return commerce;
   }:undefined,getMail:async()=>{
    if(!outbox)outbox=connectMailOutbox(env.DATABASE_URL,{environment:config.mode}).catch(error=>{outbox=undefined;throw error;});
    const [store,mailer]=await Promise.all([outbox,createWorkspaceMailer(env)]);
    return {dispatch:async()=>{const orders=await dispatchStoreMail({outbox:store,mailer,origin:siteOrigin(),secret:mailConfig.receiptSecret,limit:2});if(!recoveryEnabled())return orders;const accounts=await dispatchAccountMail({store:await recoveryStore(),mailer,origin:siteOrigin(),secret:mailConfig.receiptSecret,limit:2});return {sent:orders.sent+accounts.sent,failed:orders.failed+accounts.failed};},close:()=>mailer.close()};
   }})(request);
  }
  if(kind==='subscriptions'){
   try{
    const config=subscriptionConfig(env);
    return await createSubscriptionsApi({...config,origin:siteOrigin(),authenticate:async req=>(await membership()).currentUser({headers:Object.fromEntries(req.headers)}),getStore:async()=>(await subscriptionServices()).store,getGateway:async()=>(await subscriptionServices()).gateway,getReconciler:async()=>(await subscriptionServices()).reconciler})(request,action);
   }catch{return json(503,{error:'Membership billing is temporarily unavailable.'});}
  }
  if(kind==='personal'){
   try{
    const environment=env.VERCEL_ENV==='preview'?'sandbox':'live';
    const handler=createPersonalReadingsApi({origin:siteOrigin(),environment,enabled:env.KTTS_PERSONAL_READINGS_READY==='1',authenticate:async req=>(await membership()).currentUser({headers:Object.fromEntries(req.headers)}),getStore:readingStore});
    return await handler(request,action);
   }catch{return json(503,{error:'Personal readings are temporarily unavailable.'});}
  }
  if(kind==='webhook'){
   const mode=env.VERCEL_ENV==='preview'?'sandbox':'live',prefix=mode==='sandbox'?'PAYPAL_SANDBOX_':'PAYPAL_LIVE_';
   const clientId=env[prefix+'CLIENT_ID'],secret=env[prefix+'CLIENT_SECRET'],webhookId=env[prefix+'WEBHOOK_ID'];
   if(!clientId||!secret||!webhookId||!env.DATABASE_URL||mode==='live'&&env.KTTS_PRODUCTION!=='1')return json(503,{error:'Payment notifications are not configured.'});
   try{
    if(!webhook)webhook=(async()=>{
     if(!commerce)commerce=connectCommerce(env.DATABASE_URL,{environment:mode}).catch(error=>{commerce=undefined;throw error;});
     const [orders,events]=await Promise.all([commerce,connectEvents(env.DATABASE_URL,{environment:mode})]);
     const gateway=createPaypalCommerce({mode,clientId,secret,origin:siteOrigin(),request:paypalRequest});
     const reconcileOrder=createOrderPaymentReconciler({orders,readPayPalOrder:gateway.read,readCapture:gateway.readCapture,readRefund:gateway.readRefund});
     return createPaypalWebhookHandler({webhookId,store:events,verify:createPaypalWebhookVerifier({mode,clientId,secret,request:paypalRequest}),onVerifiedEvent:async event=>{
      if(event.event_type.startsWith('BILLING.SUBSCRIPTION.')||event.event_type.startsWith('PAYMENT.SALE.')){
       if(!env[prefix+'TAROT_PLAN_ID'])return {ignored:true};return (await subscriptionServices()).reconciler.event(event);
      }
      return reconcileOrder(event);
     }});
    })().catch(error=>{webhook=undefined;throw error;});
    return await (await webhook)(request);
   }catch{return json(503,{error:'Payment notification reconciliation is temporarily unavailable.'});}
  }
  if(kind==='checkout'){
   try{
    const config=commerceConfig(env);
    const checkout=createCheckoutApi({...config,origin:siteOrigin(),getStore:()=>{
     if(!commerce)commerce=connectCommerce(env.DATABASE_URL,{environment:config.mode}).catch(error=>{commerce=undefined;throw error;});return commerce;
    },getGateway:()=>createPaypalCommerce({mode:config.mode,...config.credentials,origin:siteOrigin(),request:paypalRequest})});
    return await checkout(request,action);
   }catch{return json(503,{error:'Checkout is temporarily unavailable. No payment was initiated.'});}
  }
  if(kind==='owner'){
   try{
    const handler=await membership(),environment=env.VERCEL_ENV==='preview'?'sandbox':'live';
    const owner=createOwnerApi({origin:siteOrigin(),environment,authenticate:req=>handler.currentUser({headers:Object.fromEntries(req.headers)}),getGateway:()=>{
     const config=commerceConfig(env);return createPaypalCommerce({mode:config.mode,...config.credentials,origin:siteOrigin(),request:paypalRequest});
    },getStore:()=>{
     if(!commerce)commerce=connectCommerce(env.DATABASE_URL,{environment}).catch(error=>{commerce=undefined;throw error;});
     return commerce;
    }});
    return await owner(request,action);
   }catch{return json(503,{error:'The owner desk is temporarily unavailable.'});}
  }
  if(kind==='paypal'&&!sandboxEnabled()){
   if(request.method==='GET'&&action==='config')return json(200,{enabled:false,mode:'sandbox',clientId:null,message:'PayPal sandbox is not connected for this preview. Live checkout is closed.'});
   return json(503,{error:'Checkout is not connected. No order has been placed.'});
  }
  if(!['member','model','asset','paypal'].includes(kind))return json(404,{error:'Not found.'});
  if(!['member','paypal'].includes(kind)&&!['GET','HEAD'].includes(request.method))return json(405,{error:'Use GET or HEAD.'});
  if(kind==='asset'&&!['tarot-deck.js','tarot-state.js'].includes(file))return json(404,{error:'Not found.'});
  if(kind==='member'&&!['me','signup','login','logout','redeem'].includes(action))return json(404,{error:'Not found.'});
  if(kind==='paypal'&&!/^(?:config|orders(?:\/[A-Z0-9]{10,32}\/capture)?)$/.test(action||''))return json(404,{error:'Not found.'});
  try{
   const handler=await membership();
   const req=nodeRequest(request,kind==='member'?'/api/members/'+action:kind==='paypal'?'/api/paypal/'+action:url.pathname);
   if(kind==='member')return await nodeResponse(handler,req);
   if(!await handler.active(req))return json(403,{error:'Active membership required.'});
   if(kind==='paypal')return await nodeResponse(await paypal(),req);
   if(kind==='asset')return new Response(request.method==='HEAD'?null:await loadAsset(file),{headers:{...privateHeaders,'Content-Type':'text/javascript; charset=utf-8'}});
   if(!env.KTTS_MODEL_BASE_URL)return json(503,{error:'Local model downloads are being prepared. Your written reading remains available.'});
   const destination=modelDestination(file,env.KTTS_MODEL_BASE_URL,await loadManifest());
   if(!destination)return json(404,{error:'Model file not found.'});
   return new Response(null,{status:307,headers:{...privateHeaders,Location:destination}});
  }catch{return json(503,{error:'This part of the store is temporarily unavailable. Please try again shortly.'});}
 };
}
