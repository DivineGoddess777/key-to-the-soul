import {randomUUID} from 'node:crypto';
import {orderItems,orderCustomer,addressFingerprint} from './order-core.mjs';

// Confirmed by Keianna. Delivery destinations and tax treatment must be
// configured separately; an absent tax decision never means zero tax.
export const storeTerms=Object.freeze({
 version:'keianna-2026-10-18-v2',currency:'USD',shippingCents:895,
 freeShippingAboveCents:6000,freeShippingInclusive:true,
 flatRateRegions:Object.freeze('AL AZ AR CA CO CT DE DC FL GA ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ')),
 calculatedRateRegions:Object.freeze(['AK','HI','AS','GU','MP','PR','VI']),internationalShipping:false,
 carrier:'USPS Ground Advantage',transit:'Estimated 2–5 business days after dispatch',
 processingTime:'3–5 business days handling; orders ship twice a week',
 damage:'Damaged in transit: replacement or refund. Contact support@keytothesoul.com.',
 returns:'Used or burned candles cannot be returned.',
 tarot:Object.freeze({priceCents:1111,interval:'month',readingsPerPeriod:1,reader:'Keianna',unlimitedSelfGuided:true,maxUnusedReadings:15,cancelAnytime:true})
});
export function shippingCents(subtotal,terms=storeTerms){
 if(!Number.isSafeInteger(subtotal)||subtotal<1)throw Error('Invalid candle subtotal.');
 return (terms.freeShippingInclusive?subtotal>=terms.freeShippingAboveCents:subtotal>terms.freeShippingAboveCents)?0:terms.shippingCents;
}
export function createDeliveryQuoter({countries=[],taxQuote,terms=storeTerms,clock=Date.now}={}){
 const allowed=new Set(countries);
 if([...allowed].some(country=>!(/^[A-Z]{2}$/.test(country))))throw Error('Configure explicit delivery countries.');
 return async(items,rawCustomer)=>{
  const cart=orderItems(items),customer=orderCustomer(rawCustomer);
  if(!allowed.has(customer.address.country))throw Object.assign(Error('Delivery to this address is not available yet.'),{status:422});
  if(customer.address.country==='US'&&!terms.flatRateRegions.includes(customer.address.region.toUpperCase()))throw Object.assign(Error('Alaska, Hawaii and U.S. territories need a calculated shipping rate. That option is not available yet.'),{status:422});
  if(typeof taxQuote!=='function')throw Object.assign(Error('Tax setup must be confirmed before checkout opens.'),{status:503});
  const shipping=shippingCents(cart.subtotalCents,terms);
  const tax=await taxQuote({cart,customer,shippingCents:shipping});
  if(!tax?.reviewed||!Number.isSafeInteger(tax.taxCents)||tax.taxCents<0||typeof tax.reference!=='string'||!tax.reference.trim())throw Object.assign(Error('Tax could not be confirmed for this address.'),{status:503});
  return {reviewed:true,shippingCents:shipping,taxCents:tax.taxCents,addressHash:addressFingerprint(customer),itemsHash:cart.itemsHash,expiresAt:clock()+15*60000,reference:randomUUID()+':'+tax.reference.slice(0,70),policyVersion:terms.version,processingTime:terms.processingTime};
 };
}
