const $=selector=>document.querySelector(selector);
const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
export function initPersonalReadings({openMember}){
 let config,currentUser,nonce=crypto.randomUUID(),generation=0,busy=false;
 const status=message=>$('#personal-status').textContent=message;
 async function api(action,data){const response=await fetch('/api/personal-readings/'+action,{credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Your personal reading room is unavailable for a moment.');return result;}
 function clear(){ $('#personal-requests').replaceChildren();$('#personal-form').hidden=true;$('#personal-balance').textContent='';$('#personal-form').reset(); }
 async function refresh(user){
  const version=++generation;if(currentUser?.username!==user?.username){clear();nonce=crypto.randomUUID();}currentUser=user;
  try{
   if(!config)config=await api('config');if(version!==generation)return;
   $('#personal-signin').hidden=Boolean(user)||!config.enabled;
   if(!config.enabled){clear();status('Coming soon with the $11.11 monthly membership. Personal reading requests and paid enrollment are not open yet.');return;}
   if(!user){clear();status('Sign in to see your saved personal readings and unused credits.');return;}
   const data=await api('me');if(version!==generation)return;
   $('#personal-balance').textContent=data.credits+' / 15 unused personal reading'+(data.credits===1?'':'s');$('#personal-form').hidden=data.credits<1;
   $('#personal-requests').replaceChildren();
   for(const request of data.requests){
    const article=node('article',undefined,'personal-request');article.append(node('p',request.status.replaceAll('_',' ')+' · '+new Date(request.created_at).toLocaleDateString(),'eyebrow'),node('h3',request.question));
    if(request.response_text)article.append(node('p',request.response_text,'personal-response'));
    else article.append(node('p',request.payment_review?'The payment for this request needs review. Contact support@keytothesoul.com.':request.status==='IN_PROGRESS'?'Keianna is preparing your reading.':'Your request is saved for Keianna.','personal-waiting'));
    if(request.response_text&&request.payment_review)article.append(node('p','The payment for this saved reading has been adjusted. Contact support@keytothesoul.com with questions.','personal-waiting'));
    $('#personal-requests').append(article);
   }
   status(data.credits?'One request uses one personal reading credit. Your self-guided deck draws never use these credits.':'No unused personal reading credits right now. Your saved readings stay here.');
  }catch(error){if(version===generation){clear();status(error.message);}}
 }
 $('#personal-signin').addEventListener('click',openMember);
 $('#personal-refresh').addEventListener('click',()=>refresh(currentUser));
 $('#personal-form').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!currentUser)return;busy=true;const button=event.submitter,version=generation;button.disabled=true;status('Saving your request for Keianna…');
  try{
   const form=new FormData(event.target);await api('request',{nonce,email:form.get('email'),question:form.get('question')});
   if(version!==generation)return;nonce=crypto.randomUUID();event.target.reset();await refresh(currentUser);status('Your request is saved for Keianna. One personal reading credit was used.');
  }catch(error){if(version===generation)status(error.message);}finally{busy=false;button.disabled=false;}
 });
 return {refresh};
}
