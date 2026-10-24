import {createHash} from 'node:crypto';
import {issueReceiptToken} from './receipt-token.mjs';
export function storeMailConfig(env){
 const username=env.KTTS_SMTP_USERNAME,password=env.KTTS_SMTP_PASSWORD,secret=env.KTTS_RECEIPT_SECRET;
 const enabled=Boolean(env.KTTS_STORE_EMAIL==='1'&&username==='keianna@saiyancorp.io'&&typeof password==='string'&&password.length>=12&&/^[a-f0-9]{64,128}$/.test(secret||''));
 return {enabled,username,password,receiptSecret:secret};
}
const money=cents=>'$'+(Number(cents)/100).toFixed(2),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderStoreMail(job,{origin,secret,now=Date.now()}){
 const order=job.payload_json,quote=order.quote,short=order.id.slice(0,8).toUpperCase();
 const sandbox=job.environment==='sandbox',testNotice='SANDBOX TEST — no real order, charge or shipment.';
 const title=job.message_type==='SHIPMENT'?'Your ritual is on its way.':job.message_type==='PAYMENT_ADJUSTED'?'An update to your payment.':order.status==='PAYMENT_REVIEW'?'Payment received; your order needs a little attention.':'Your ritual is confirmed.';
 const link=origin+'/checkout.html?receipt='+encodeURIComponent(issueReceiptToken(order.id,job.environment,secret,now));
 const rows=quote.lines.map(line=>line.quantity+' × '+line.name+(line.number?' '+line.number:'')+' · '+line.size+' '+line.weight+' — '+money(line.quantity*line.unitCents));
 const details=[...rows,'','Candles: '+money(quote.subtotalCents),'Shipping: '+money(quote.shippingCents),'Tax: '+money(quote.taxCents),'Total paid: '+money(quote.totalCents)];
 if(order.refundedCents)details.push('Refunded: '+money(order.refundedCents));
 if(order.paymentStatus&&order.paymentStatus!=='COMPLETED')details.push('Payment state: '+order.paymentStatus.replaceAll('_',' '));
 if(order.fulfillment)details.push('Shipment: '+order.fulfillment.carrier+' · '+order.fulfillment.trackingNumber);
 details.push('',quote.processingTime+'.','Contact support@keytothesoul.com if your candle arrives damaged or you need help.');
 const text=(sandbox?testNotice+'\n\n':'')+title+'\nKey to the Soul · Order '+short+'\n\n'+details.join('\n')+'\n\nView your private receipt (link valid for 30 days):\n'+link+'\n\nWith intention,\nKeianna\nKey to the Soul';
 const html='<div style="background:#151016;color:#e8d7c4;padding:35px 22px;font-family:Georgia,serif;max-width:600px;margin:auto"><p style="color:#c98b5b;letter-spacing:3px;font:11px Arial,sans-serif">KEY TO THE SOUL</p><h1 style="font-weight:400;font-size:34px;line-height:1.2">'+escape(title)+'</h1><p style="color:#c98b5b">Order '+escape(short)+'</p><div style="border-top:1px solid #754e36;padding:20px 0;font:14px/1.9 Arial,sans-serif">'+details.map(line=>'<p style="margin:6px 0">'+escape(line||' ')+'</p>').join('')+'</div><a style="display:inline-block;color:#151016;background:#ca8e5f;padding:15px 22px;text-decoration:none;font:14px Arial,sans-serif" href="'+escape(link)+'">View your private receipt ↗</a><p style="font:12px/1.8 Arial,sans-serif;color:#bba58e">This private link expires in 30 days. Keep it for yourself.</p><p style="font-size:23px">With intention,<br><em>Keianna</em></p></div>';
 return {from:{name:'Key to the Soul',address:'support@keytothesoul.com'},replyTo:'support@keytothesoul.com',to:{address:job.recipient},subject:(sandbox?'[Sandbox test] ':'')+'Key to the Soul · '+(job.message_type==='SHIPMENT'?'Shipment':job.message_type==='PAYMENT_ADJUSTED'?'Payment update':'Receipt')+' '+short,text,html:sandbox?html.replace('<h1 ','<p style="font:12px/1.6 Arial,sans-serif;color:#c98b5b">'+testNotice+'</p><h1 '):html,messageId:'<'+createHash('sha256').update(job.environment+':'+job.event_key).digest('hex')+'@keytothesoul.com>'};
}
export async function createWorkspaceMailer(env,{transportFactory}={}){
 const config=storeMailConfig(env);if(!config.enabled)throw Error('Store email is not configured.');
 const factory=transportFactory||(await import('nodemailer')).default.createTransport;
 const transport=factory({host:'smtp.gmail.com',port:465,secure:true,auth:{user:config.username,pass:config.password},tls:{minVersion:'TLSv1.2',servername:'smtp.gmail.com'},connectionTimeout:15000,greetingTimeout:10000,socketTimeout:30000,disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
 return {send:async message=>{
  const result=await transport.sendMail(message);
  if(result.rejected?.length||!result.accepted?.length)throw Error('Receipt delivery was not accepted.');return {accepted:true};
 },verify:()=>transport.verify(),close:()=>transport.close()};
}
