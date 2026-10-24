import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {createPaypalClient} from '../server/paypal-client.mjs';
import {validateMonthlyPlan} from '../server/subscription-core.mjs';
if(process.env.KTTS_PRODUCTION==='1'||!process.env.PAYPAL_SANDBOX_CLIENT_ID||!process.env.PAYPAL_SANDBOX_CLIENT_SECRET)throw Error('Load the existing Sandbox app privately. Production is refused.');
const file=new URL('../.data/paypal-sandbox-membership-setup.json',import.meta.url),fingerprint=createHash('sha256').update(process.env.PAYPAL_SANDBOX_CLIENT_ID).digest('hex');
let setup;try{setup=JSON.parse(await readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Review the existing private sandbox setup record.');}
if(setup&&setup.appFingerprint!==fingerprint)throw Error('The cached setup belongs to a different PayPal Sandbox app.');
if(!setup)setup={appFingerprint:fingerprint,productRequestId:randomUUID(),planRequestId:randomUUID(),createdAt:Date.now()};
await mkdir(new URL('../.data',import.meta.url),{recursive:true});
const save=()=>writeFile(file,JSON.stringify(setup,null,2)+'\n');await save();
const api=createPaypalClient({mode:'sandbox',clientId:process.env.PAYPAL_SANDBOX_CLIENT_ID,secret:process.env.PAYPAL_SANDBOX_CLIENT_SECRET});
try{
 if(!setup.productId){
  if(setup.createdAt<Date.now()-70*3600000)throw Error('Review the unfinished setup before retrying expired idempotency keys.');
  const product=await api('/v1/catalogs/products',{method:'POST',id:setup.productRequestId,body:{name:'Key to the Soul — Ember Oracle (Sandbox)',description:'Sandbox test membership: one Keianna reading monthly and unlimited self-guided deck access.',type:'SERVICE',home_url:'https://www.keytothesoul.com/tarot.html'}});
  if(!/^PROD-[A-Z0-9]{10,40}$/.test(product.id||''))throw Error('Unexpected Sandbox product reference.');setup.productId=product.id;await save();
 }
 if(!setup.planId){
  const plan=await api('/v1/billing/plans',{method:'POST',id:setup.planRequestId,body:{product_id:setup.productId,name:'Ember Oracle monthly — Sandbox only',description:'$11.11 monthly; one Keianna reading credit; unlimited self-guided deck; bank 15 credits; cancel anytime.',status:'ACTIVE',billing_cycles:[{frequency:{interval_unit:'MONTH',interval_count:1},tenure_type:'REGULAR',sequence:1,total_cycles:0,pricing_scheme:{fixed_price:{value:'11.11',currency_code:'USD'}}}],payment_preferences:{auto_bill_outstanding:false,setup_fee:{value:'0.00',currency_code:'USD'},setup_fee_failure_action:'CANCEL',payment_failure_threshold:1},quantity_supported:false}});
  setup.planId=plan.id;await save();
 }
 validateMonthlyPlan(await api('/v1/billing/plans/'+setup.planId),setup.planId);setup.verifiedAt=new Date().toISOString();await save();
 console.log(JSON.stringify({environment:'sandbox',productId:setup.productId,planId:setup.planId,price:'11.11 USD monthly',verified:true,subscriberCreated:false,realCharge:false}));
}catch(error){console.error(error.status?error.message:'Sandbox plan setup needs review. No subscriber or real charge was created.');process.exitCode=1;}
