const fail=message=>{throw Object.assign(Error(message),{status:409});};
export function usdCents(amount){
 if(amount?.currency_code!=='USD'||!/^\d{1,7}\.\d{2}$/.test(amount.value||''))fail('Payment currency or amount is unconfirmed.');
 const [whole,fraction]=amount.value.split('.'),cents=Number(whole)*100+Number(fraction);if(!Number.isSafeInteger(cents)||cents<0||cents>10000000)fail('Payment amount is unconfirmed.');return cents;
}
export function refundCaptureId(refund){
 for(const link of refund?.links||[]){if(link.rel!=='up')continue;try{const url=new URL(link.href);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['api.paypal.com','api-m.paypal.com','api.sandbox.paypal.com','api-m.sandbox.paypal.com'].includes(url.hostname)){const match=url.pathname.match(/^\/v2\/payments\/captures\/([A-Z0-9]{6,32})$/);if(match)return match[1];}}catch{}}
 return null;
}
export function captureIdentity(payload,order){
 const units=payload?.purchase_units,captures=Array.isArray(units)?units.flatMap(unit=>unit.payments?.captures||[]):[];
 if(payload?.id!==order.paypal_id||payload.status!=='COMPLETED'||units?.length!==1||units[0].custom_id!==order.id||captures.length!==1)fail('Payment does not match this order.');
 const capture=captures[0];if(!/^[A-Z0-9]{6,32}$/.test(capture.id||'')||capture.final_capture===false||usdCents(capture.amount)!==Number(order.total_cents))fail('Payment amount has not been confirmed.');return capture;
}
