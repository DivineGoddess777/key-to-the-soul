const $=id=>document.getElementById(id);
export function initSubscriptions({openMember,onChanged}){
 let config,user,current,version=0,busy=false,nonce=crypto.randomUUID(),returnHandled=false;
 const note=text=>$('subscription-status').textContent=text;
 async function api(action,data){const response=await fetch('/api/subscriptions/'+action,{credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Membership billing is unavailable for a moment.');return result;}
 function controls(){
  const pending=current&&['CREATING','APPROVAL_PENDING','APPROVED'].includes(current.status),active=current&&['ACTIVE','SUSPENDED'].includes(current.status);
  $('subscription-consent').hidden=Boolean(active);$('subscription-join').hidden=Boolean(active)||current?.status==='APPROVED';$('subscription-cancel-open').hidden=!active;
  $('subscription-refresh').hidden=!user||!current;$('subscription-cancel-form').hidden=true;
  $('subscription-join').textContent=pending?'Continue PayPal approval ↗':user?'Join for $11.11/month ↗':'Sign in to join ↗';
  if(!user)note('Sign in or create your Key to the Soul account, then review the monthly membership.');
  else if(!current)note('One personal reading credit each paid month, plus unlimited self-guided deck access.');
  else if(current.status==='CANCELLED')note('PayPal confirmed cancellation. Monthly renewal has stopped. Your paid access lasts through its paid period; saved readings and unused credits stay in your account.');
  else if(current.status==='ACTIVE')note('Your monthly agreement is active.'+(current.nextBillingAt?' Next billing: '+new Date(current.nextBillingAt).toLocaleDateString()+'.':'')+' Deck access and your reading credit are based on confirmed payments.');
  else if(current.status==='SUSPENDED')note('PayPal paused this agreement after a payment problem. No new credit or access is added without a completed payment. You can still cancel renewal here.');
  else if(current.status==='EXPIRED')note('This PayPal agreement has ended. You can review the terms and join again.');
  else note('PayPal approval or payment confirmation is pending. Check membership after returning from PayPal.');
 }
 async function refresh(nextUser){
  const request=++version;if(user?.username!==nextUser?.username){current=null;nonce=crypto.randomUUID();$('subscription-accept').checked=false;$('subscription-cancel-confirm').checked=false;}user=nextUser;
  try{
   if(!config)config=await api('config');if(request!==version)return;
   $('subscription-panel').hidden=!config.enabled;if(!config.enabled)return;
   document.querySelector('.oracle-intro .eyebrow').textContent='THE MEMBERS’ TAROT ROOM · MONTHLY MEMBERSHIP';
   document.querySelector('.membership-offer').textContent='$11.11/month · one personal reading by Keianna each paid month + unlimited self-guided deck · bank up to 15 unused personal readings · cancel anytime.';
   $('subscription-mode').textContent=config.mode==='sandbox'?'SANDBOX TEST · NO REAL CHARGE':'YOUR MONTHLY MEMBERSHIP';
   if(user){const result=await api('me');if(request!==version)return;current=result.subscription;}else current=null;
   controls();
  }catch(error){if(request===version){current=null;$('subscription-cancel-form').hidden=true;note(error.message);}}
 }
 async function work(action){if(busy)return;busy=true;const request=version;for(const button of $('subscription-panel').querySelectorAll('button'))button.disabled=true;try{await action(request);}catch(error){if(request===version)note(error.message);}finally{busy=false;for(const button of $('subscription-panel').querySelectorAll('button'))button.disabled=false;}}
 $('subscription-join').addEventListener('click',()=>work(async request=>{
  if(!user){openMember();return;}if(!$('subscription-accept').checked){note('Please review and accept the monthly renewal terms first.');return;}
  note('Preparing your PayPal membership…');const result=await api('join',{nonce,consent:true,termsVersion:config.terms.version});if(request!==version)return;current=result.subscription;
  if(result.approvalUrl){const url=new URL(result.approvalUrl),hosts=config.mode==='sandbox'?['www.sandbox.paypal.com','sandbox.paypal.com']:['www.paypal.com','paypal.com'];if(url.protocol!=='https:'||!hosts.includes(url.hostname)||url.username||url.password||url.port)throw Error('PayPal returned an unexpected address.');location.assign(url.href);return;}
  await onChanged();
 }));
 $('subscription-refresh').addEventListener('click',()=>work(async()=>{if(!user||!current)return;note('Checking your PayPal agreement and completed payments…');await api('sync',{id:current.id});await onChanged();}));
 $('subscription-cancel-open').addEventListener('click',()=>{$('subscription-cancel-form').hidden=false;$('subscription-cancel-confirm').checked=false;$('subscription-cancel-confirm').focus();});
 $('subscription-cancel-back').addEventListener('click',()=>{$('subscription-cancel-form').hidden=true;});
 $('subscription-cancel-form').addEventListener('submit',event=>{event.preventDefault();work(async()=>{if(!user||!current||!$('subscription-cancel-confirm').checked)return;note('Asking PayPal to stop monthly renewal…');await api('cancel',{id:current.id,confirm:true});nonce=crypto.randomUUID();await onChanged();});});
 async function finishReturn(){
  const params=new URLSearchParams(location.search),id=params.get('membership');if(returnHandled||!config?.enabled||!user||!id)return;
  returnHandled=true;
  if(params.get('result')==='canceled'){note('PayPal approval was closed. No completed membership payment has been confirmed.');return;}
  await work(async()=>{note('Confirming your PayPal membership payment…');await api('sync',{id});await onChanged();history.replaceState(null,'',location.pathname+'#subscription-panel');});
 }
 return {refresh,finishReturn,isEnabled:()=>Boolean(config?.enabled)};
}
