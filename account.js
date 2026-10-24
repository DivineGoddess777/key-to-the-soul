const $=selector=>document.querySelector(selector),forms=['login','email','forgot','verify','reset'];
const fragment=new URLSearchParams(location.hash.slice(1)),action=fragment.has('verify')?'verify':fragment.has('reset')?'reset':null;
let linkToken=action?fragment.get(action):null,enabled=false;
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
async function call(prefix,action,data){const response=await fetch('/api/'+prefix+'/'+action,{credentials:'same-origin',cache:'no-store',...(data?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'Your account is temporarily unavailable.');return result;}
const message=text=>$('#account-message').textContent=text;
function clearPasswords(){document.querySelectorAll('input[type=password]').forEach(input=>input.value='');}
async function refresh(){
 forms.forEach(name=>$('#account-'+name).hidden=true);
 enabled=(await call('account','config')).enabled;
 if(!enabled){$('#account-state').textContent='Email recovery is being prepared. Contact support@keytothesoul.com for account help.';return;}
 if(action&&linkToken){
  if(!/^[a-f0-9]{64}$/.test(linkToken)){linkToken=null;$('#account-state').textContent='This link is incomplete. Request a fresh email.';$('#account-restart').hidden=false;return;}
  $('#account-state').textContent=action==='verify'?'CONFIRM YOUR EMAIL':'RESET YOUR PASSWORD';$('#account-'+action).hidden=false;return;
 }
 const {user}=await call('members','me');
 if(user){const status=await call('account','status');$('#account-state').textContent='Signed in as '+user.username;$('#verified-email').textContent=status.verified?'Confirmed recovery email: '+status.email:'Add an email you can always reach.';$('#account-email').hidden=false;}
 else{$('#account-state').textContent='Your account, safely within reach.';$('#account-login').hidden=false;$('#account-forgot').hidden=false;}
}
function submit(name,handler){$('#account-'+name).addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;message('One moment…');try{await handler(Object.fromEntries(new FormData(event.currentTarget)));}catch(error){message(error.message);}finally{button.disabled=false;clearPasswords();}});}
submit('login',async data=>{await call('members','login',data);message('Welcome back.');await refresh();});
submit('email',async data=>message((await call('account','request-verification',data)).message));
submit('forgot',async data=>message((await call('account','request-reset',data)).message));
submit('verify',async()=>{const result=await call('account','verify',{token:linkToken});linkToken=null;$('#account-verify').hidden=true;message(result.message);$('#account-restart').hidden=false;});
submit('reset',async data=>{if(data.password!==data.confirmPassword)throw Error('The new passwords do not match.');const result=await call('account','reset',{...data,token:linkToken});linkToken=null;$('#account-reset').hidden=true;message(result.message);$('#account-restart').hidden=false;});
$('#account-logout').addEventListener('click',async()=>{try{await call('members','logout',{});clearPasswords();message('You have been signed out.');await refresh();}catch(error){message(error.message);}});
addEventListener('pagehide',()=>{clearPasswords();linkToken=null;},{once:true});
refresh().catch(()=>{$('#account-state').textContent='Your account is temporarily unavailable. Contact support@keytothesoul.com if you need help.';});
