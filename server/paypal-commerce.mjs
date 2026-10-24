const fail=message=>{throw Object.assign(Error(message),{status:502});};
const amount=cents=>(cents/100).toFixed(2);
export function paypalApproval(payload,mode){
 const link=payload.links?.find(link=>['payer-action','approve'].includes(link.rel));
 if(!link)fail('PayPal approval is not ready.');
 const url=new URL(link.href),hosts=mode==='sandbox'?['www.sandbox.paypal.com','sandbox.paypal.com']:['www.paypal.com','paypal.com'];
 if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.username||url.password||url.port||url.hash||url.searchParams.get('token')!==payload.id)fail('PayPal returned an unexpected approval address.');
 return url.href;
}
export function createPaypalCommerce({mode,clientId,secret,origin,request=fetch}){
 if(!['sandbox','live'].includes(mode)||!clientId||!secret)throw Error('Configure PayPal privately.');
 const site=new URL(origin);if(site.origin!==origin||site.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(site.hostname))throw Error('Configure the exact checkout origin.');
 const base=mode==='sandbox'?'https://api-m.sandbox.paypal.com':'https://api-m.paypal.com';
 let cached,until=0,pending;
 async function token(){
  if(cached&&until>Date.now()+60000)return cached;
  if(!pending)pending=(async()=>{
   const result=await request(base+'/v1/oauth2/token',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(clientId+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials',signal:AbortSignal.timeout(15000)});
   if(!result.ok)fail('PayPal is temporarily unavailable.');
   const data=await result.json();if(!data.access_token||!Number.isFinite(data.expires_in))fail('PayPal is temporarily unavailable.');
   cached=data.access_token;until=Date.now()+data.expires_in*1000;return cached;
  })().finally(()=>pending=undefined);
  return pending;
 }
 async function api(path,{method='GET',body,id}={}){
  const response=await request(base+path,{method,headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json',Prefer:'return=representation',...(id?{'PayPal-Request-Id':id}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)fail('PayPal could not confirm this step. Check your order before trying again.');
  return response.json();
 }
 const validId=id=>{if(!/^[A-Z0-9]{10,32}$/.test(id||''))fail('Invalid PayPal reference.');return id;};
 return {
  async create(order){
   const q=order.quote_json,c=order.customer_json,a=c.address;
   const back=origin+'/checkout.html?order='+encodeURIComponent(order.id);
   const payload=await api('/v2/checkout/orders',{method:'POST',id:'create-'+order.id,body:{intent:'CAPTURE',purchase_units:[{
    reference_id:order.id,custom_id:order.id,invoice_id:order.id,
    description:'Key to the Soul ritual candles',
    amount:{currency_code:'USD',value:amount(q.totalCents),breakdown:{item_total:{currency_code:'USD',value:amount(q.subtotalCents)},shipping:{currency_code:'USD',value:amount(q.shippingCents)},tax_total:{currency_code:'USD',value:amount(q.taxCents)}}},
    items:q.lines.map(line=>({name:(line.name+(line.number?' '+line.number:'')+' · '+line.size+' '+line.weight).slice(0,127),sku:line.sku,quantity:String(line.quantity),category:'PHYSICAL_GOODS',unit_amount:{currency_code:'USD',value:amount(line.unitCents)}})),
    shipping:{name:{full_name:c.name},address:{address_line_1:a.line1,...(a.line2?{address_line_2:a.line2}:{}),admin_area_2:a.city,admin_area_1:a.region,postal_code:a.postalCode,country_code:a.country}}
   }],payment_source:{paypal:{experience_context:{brand_name:'Key to the Soul',shipping_preference:'SET_PROVIDED_ADDRESS',user_action:'PAY_NOW',return_url:back+'&result=approved',cancel_url:back+'&result=canceled'}}}}});
   validId(payload.id);paypalApproval(payload,mode);return payload;
  },
  read:id=>api('/v2/checkout/orders/'+validId(id)),
  readCapture:id=>api('/v2/payments/captures/'+validId(id)),
  readRefund:id=>api('/v2/payments/refunds/'+validId(id)),
  refund:(order,attempt)=>api('/v2/payments/captures/'+validId(order.capture_id)+'/refund',{method:'POST',id:attempt.id,body:{amount:{currency_code:'USD',value:amount(attempt.amount_cents)},invoice_id:attempt.id,note_to_payer:'Key to the Soul candle order refund.'}}),
  capture:order=>api('/v2/checkout/orders/'+validId(order.paypal_id)+'/capture',{method:'POST',body:{},id:'capture-'+order.id})
 };
}
