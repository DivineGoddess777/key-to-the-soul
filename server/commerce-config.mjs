import {createDeliveryQuoter,storeTerms} from './store-policy.mjs';
import {pennsylvaniaCandleTax} from './candle-tax.mjs';
import {storeMailConfig} from './store-mail.mjs';
// Collect PA state/local tax from the declared delivery county. Other states
// require an explicit no-collection decision; missing configuration is closed.
export function commerceConfig(env){
 let config;try{config=JSON.parse(env.KTTS_FULFILLMENT_JSON||'null');}catch{}
 const regions=config?.shippingRegions,noTax=config?.confirmedNoTaxRegions;
 const paTax=config?.taxMode==='PA_DESTINATION';
 const valid=Boolean(config?.reviewed===true&&typeof config.shipFromPostalCode==='string'&&/^\d{5}$/.test(config.shipFromPostalCode)&&typeof config.shipFromState==='string'&&/^[A-Z]{2}$/.test(config.shipFromState)&&Array.isArray(regions)&&regions.length&&regions.length<=60&&regions.every(s=>typeof s==='string'&&/^[A-Z]{2}$/.test(s))&&Array.isArray(noTax)&&regions.every(s=>s==='PA'&&paTax||noTax.includes(s)&&!(s==='PA'&&config.shipFromState==='PA'))&&typeof config.taxDecisionReference==='string'&&config.taxDecisionReference.trim());
 const mode=env.VERCEL_ENV==='preview'?'sandbox':'live';
 const credentials=mode==='sandbox'?{clientId:env.PAYPAL_SANDBOX_CLIENT_ID,secret:env.PAYPAL_SANDBOX_CLIENT_SECRET}:{clientId:env.PAYPAL_LIVE_CLIENT_ID,secret:env.PAYPAL_LIVE_CLIENT_SECRET};
 const paymentFlag=mode==='sandbox'?env.KTTS_COMMERCE_SANDBOX==='1'&&env.KTTS_PRODUCTION!=='1':env.KTTS_LIVE_CHECKOUT==='1'&&env.KTTS_PRODUCTION==='1';
 const enabled=Boolean(valid&&paymentFlag&&credentials.clientId&&credentials.secret&&env.DATABASE_URL&&(mode==='sandbox'||storeMailConfig(env).enabled&&env.PAYPAL_LIVE_WEBHOOK_ID&&/^[a-f0-9]{64}$/.test(env.CRON_SECRET||'')));
 const quoter=createDeliveryQuoter({countries:valid?['US']:[],taxQuote:valid?async({customer,cart,shippingCents})=>{
  const region=customer.address.region.toUpperCase();
  if(!regions.includes(region))throw Object.assign(Error('Shipping is not available for this state or territory yet. Use its two-letter postal abbreviation.'),{status:422});
  if(!/^\d{5}(?:-\d{4})?$/.test(customer.address.postalCode))throw Object.assign(Error('Check your ZIP code.'),{status:422});
  if(region==='PA'&&paTax)return pennsylvaniaCandleTax({customer,cart,shippingCents});
  return {reviewed:true,taxCents:0,reference:config.taxDecisionReference};
 }:undefined});
 return {mode,enabled,credentials,countries:valid?['US']:[],terms:storeTerms,receiptSecret:env.KTTS_RECEIPT_SECRET,quoteDelivery:quoter};
}
