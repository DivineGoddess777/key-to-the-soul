import {usdCents,refundCaptureId} from './payment-adjustments.mjs';
export async function refundOrder({store,gateway,id,nonce,amountCents,clock=Date.now}){
 const {order,attempt}=await store.requestRefund(id,nonce,amountCents),claim=await store.claimRefund(attempt.id);
 try{
  if(!claim.attempt.refund_id&&claim.attempt.created_at<clock()-70*3600000)throw Object.assign(Error('This unfinished refund needs PayPal review before another request. Contact support rather than starting a second refund.'),{status:409});
  const refund=claim.attempt.refund_id?await gateway.readRefund(claim.attempt.refund_id):await gateway.refund(order,claim.attempt);
  if(!/^[A-Z0-9]{6,32}$/.test(refund?.id||'')||usdCents(refund.amount)!==amountCents||refundCaptureId(refund)!==order.capture_id)throw Object.assign(Error('The refund response needs payment review.'),{status:409});
  await store.bindRefund(attempt.id,claim.token,refund.id);
  const capture=await gateway.readCapture(order.capture_id),updated=await store.adjustPayment(id,{capture,refund});
  if(['COMPLETED','FAILED','CANCELLED'].includes(refund.status))await store.finishRefund(attempt.id,claim.token);
  return {order:updated,refund:{id:refund.id,status:refund.status,amountCents}};
 }finally{await store.releaseRefund(attempt.id,claim.token);}
}
