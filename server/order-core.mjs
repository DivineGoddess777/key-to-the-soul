import {createHash} from 'node:crypto';
import {getBagLine} from '../ritual-bag.js';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cents=value=>Number.isSafeInteger(value)&&value>=0&&value<=10000000;
const text=(value,label,max,optional=false)=>{
 if(optional&&(value===undefined||value===''))return '';
 if(typeof value!=='string')fail('Enter '+label+'.');
 const result=value.trim();
 if(!result||result.length>max||/[\u0000-\u001f\u007f]/.test(result))fail('Check '+label+'.');
 return result;
};

export function orderItems(items){
 if(!items||Array.isArray(items)||typeof items!=='object'||Object.keys(items).length<1||Object.keys(items).length>50)fail('Choose at least one candle and its size.');
 let subtotalCents=0,quantity=0;
 const lines=Object.entries(items).sort(([a],[b])=>a.localeCompare(b)).map(([sku,qty])=>{
  const line=getBagLine(sku);
  if(!line?.size||line.key!==sku||!Number.isInteger(qty)||qty<1||qty>9)fail('Each candle needs a confirmed size and quantity from 1 to 9.');
  quantity+=qty;subtotalCents+=qty*line.size.priceCents;
  return {sku,quantity:qty,name:line.product.name,number:line.product.number||null,size:line.size.short,weight:line.size.weight,unitCents:line.size.priceCents};
 });
 if(quantity>100||!cents(subtotalCents))fail('This bag is too large for online checkout.');
 return {lines,quantity,subtotalCents,itemsHash:digest(lines)};
}

export function orderCustomer(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Enter your contact and delivery details.');
 const email=text(raw.email,'your email address',254).toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Check your email address.');
 const source=raw.address;
 if(!source||typeof source!=='object'||Array.isArray(source))fail('Enter your delivery address.');
 const address={line1:text(source.line1,'address line 1',120),line2:text(source.line2,'address line 2',120,true),city:text(source.city,'your city',100),region:text(source.region,'your state or region',100),postalCode:text(source.postalCode,'your postal code',20),country:text(source.country,'your country',2).toUpperCase()};
 if(!/^[A-Z]{2}$/.test(address.country))fail('Choose your country.');
 if(address.country==='US')address.region=address.region.toUpperCase();
 if(source.county!==undefined&&source.county!=='')address.county=text(source.county,'your delivery county',100).toUpperCase();
 return {name:text(raw.name,'your name',100),email,address};
}
export const addressFingerprint=customer=>digest(customer.address);

// delivery must come from a trusted server-side shipping/tax quote. There is no
// HTTP endpoint accepting these amounts from a browser, and no guessed defaults.
export function createOrderQuote(items,rawCustomer,delivery,now=Date.now()){
 const cart=orderItems(items),customer=orderCustomer(rawCustomer);
 if(!delivery?.reviewed||!cents(delivery.shippingCents)||!cents(delivery.taxCents)||delivery.addressHash!==addressFingerprint(customer)||delivery.itemsHash!==cart.itemsHash||!Number.isSafeInteger(delivery.expiresAt)||delivery.expiresAt<=now||delivery.expiresAt>now+15*60*1000)fail('Shipping and tax must be confirmed for this bag and address before checkout.',503);
 const reference=text(delivery.reference,'the shipping/tax quote reference',120),policyVersion=text(delivery.policyVersion,'the store policy version',100),processingTime=text(delivery.processingTime,'the processing time',200);
 const totalCents=cart.subtotalCents+delivery.shippingCents+delivery.taxCents;
 if(!cents(totalCents)||totalCents<1)fail('This total cannot be checked out.');
 const quote={currency:'USD',lines:cart.lines,subtotalCents:cart.subtotalCents,shippingCents:delivery.shippingCents,taxCents:delivery.taxCents,totalCents,deliveryReference:reference,policyVersion,processingTime,expiresAt:delivery.expiresAt};
 const {expiresAt,deliveryReference,...fixedQuote}=quote;
 return {quote,customer,fingerprint:digest({quote:fixedQuote,customer})};
}

export function confirmedOrderCapture(payload,record){
 const units=payload?.purchase_units;
 const captures=Array.isArray(units)?units.flatMap(unit=>unit.payments?.captures||[]):[];
 if(payload?.id!==record.paypal_id||payload.status!=='COMPLETED'||units?.length!==1||units[0].custom_id!==record.id||captures.length!==1)fail('Payment does not match this order.',409);
 const capture=captures[0];
 if(capture.status!=='COMPLETED'||!/^[A-Z0-9]{6,32}$/.test(capture.id||'')||capture.final_capture===false||capture.amount?.currency_code!=='USD'||capture.amount.value!==(Number(record.total_cents)/100).toFixed(2))fail('Payment amount or status has not been confirmed.',409);
 return capture.id;
}
