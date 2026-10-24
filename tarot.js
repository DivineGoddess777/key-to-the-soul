import {cardArtwork,cardBack} from './tarot-art.js';
import {EdgeTask,clearEdgeCache} from './tarot-edge.js';
import {initPersonalReadings} from './personal-readings.js';
import {initSubscriptions} from './subscriptions.js';
const $=selector=>document.querySelector(selector),escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let modelStarting=false,memberGeneration=0;
let engine,state,reading,member=null,focus='becoming',accountAction='login',task=null,reflection='',audioURL=null,version=0;
const dialog=$('#member-dialog'),note=$('#membership-note');
const personalReadings=initPersonalReadings({openMember});
const subscriptions=initSubscriptions({openMember,onChanged:refreshMember});
$('.display-one').innerHTML=cardArtwork({id:'display-star',arcana:'major',number:17,name:'The Star',art:'star'});
$('.display-two').innerHTML=cardArtwork({id:'display-moon',arcana:'major',number:18,name:'The Moon',art:'moon'});
$('.display-three').innerHTML=cardBack;
async function api(action,body){
 const response=await fetch('/api/members/'+action,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'The member room is unavailable for a moment.');return result;
}
function scrollTo(element){element.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});element.focus?.({preventScroll:true});}
function resetAudio(){stopDeviceVoice();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=null;$('#reading-audio').pause();$('#reading-audio').removeAttribute('src');$('#reading-audio').hidden=true;$('#audio-note').hidden=true;}
function resetReading(){
 version++;task?.cancel();task=null;reading=null;state=null;reflection='';resetAudio();
 $('#draw-room').hidden=true;$('#reading-room').hidden=true;$('#edge-output').textContent='';$('#edge-output').hidden=true;
 $('#edge-progress').hidden=true;$('#voice-progress').hidden=true;$('#edge-generate').disabled=false;$('#voice-generate').disabled=false;
 $('#edge-generate').textContent='Invite a local reflection ↗';$('#voice-generate').textContent='Prepare natural narration ↗';
}
async function applyMember(user){
 const generation=++memberGeneration,lost=member?.active&&!user?.active;member=user;if(lost)resetReading();
 note.classList.toggle('active',Boolean(member?.active));
 $('#member-open').textContent=member?'Your membership ↗':'Member sign in ↗';
 $('#member-form').hidden=Boolean(member);$('#redeem-form').hidden=!member;$('.member-tabs').hidden=Boolean(member);
 $('#member-account-name').textContent=member?'Signed in as '+member.username+'.':'';
 await personalReadings.refresh(user);
 if(generation!==memberGeneration)return;
 await subscriptions.refresh(user);
 if(generation!==memberGeneration)return;
 if(member?.active){
  note.textContent='Welcome, '+member.username+'. Your member access is active through '+new Date(member.memberUntil).toLocaleDateString()+'.';
  $('#member-status').textContent='Your room is ready. You can close this window and choose a reading.';
  if(!engine)engine=await import('./tarot-state.js');
 }else if(member){note.textContent=subscriptions.isEnabled()?'Your account is ready. Review monthly membership below, or use an invitation from Keianna.':'Your account is ready. Activate an invitation from Keianna to enter the tarot room.';$('#member-status').textContent=subscriptions.isEnabled()?'Your account is ready. Close this window to review membership, or use an invitation below.':'Your account is ready. Add your membership invitation below.';}
 else{note.textContent=subscriptions.isEnabled()?'Sign in or create your account to join the monthly room. An invitation from Keianna works too.':'An invitation-only member experience. Sign in, or create your account and use an invitation from Keianna.';}
}
async function refreshMember(){const result=await api('me');await applyMember(result.user);return Boolean(result.user?.active);}
function openMember(){if(!dialog.open)dialog.showModal();}
async function requireMember(){
 try{if(await refreshMember())return true;openMember();return false;}
 catch{note.textContent='Member sign-in is unavailable for a moment. Your saved candle bag is still in the collection.';return false;}
}
$('#member-open').addEventListener('click',openMember);$('#member-close').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{$('#member-password').value='';$('#member-code').value='';});
dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
document.querySelectorAll('[data-account]').forEach(button=>button.addEventListener('click',()=>{
 accountAction=button.dataset.account;document.querySelectorAll('[data-account]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 $('#member-submit').textContent=accountAction==='signup'?'Create my account ↗':'Sign in ↗';$('#member-password').autocomplete=accountAction==='signup'?'new-password':'current-password';$('#member-status').textContent='';
}));
$('#member-form').addEventListener('submit',async event=>{
 event.preventDefault();$('#member-submit').disabled=true;$('#member-status').textContent='Opening your quiet corner…';
  try{const result=await api(accountAction,{username:$('#member-username').value,password:$('#member-password').value});$('#member-password').value='';await applyMember(result.user);if(result.user?.active||subscriptions.isEnabled())dialog.close();await subscriptions.finishReturn();}
 catch(error){$('#member-status').textContent=error.message;}
 finally{$('#member-submit').disabled=false;}
});
$('#redeem-form').addEventListener('submit',async event=>{
 event.preventDefault();const button=$('#redeem-form button[type=submit]');button.disabled=true;
 try{const result=await api('redeem',{code:$('#member-code').value});$('#member-code').value='';await applyMember(result.user);dialog.close();}
 catch(error){$('#member-status').textContent=error.message;}finally{button.disabled=false;}
});
$('#member-logout').addEventListener('click',async()=>{
 try{await api('logout',{});resetReading();await applyMember(null);$('#member-status').textContent='You have been signed out.';}
 catch(error){$('#member-status').textContent=error.message;}
});
document.querySelectorAll('[data-focus]').forEach(button=>button.addEventListener('click',()=>{
 focus=button.dataset.focus;document.querySelectorAll('[data-focus]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));resetReading();
}));
document.querySelectorAll('input[name=spread]').forEach(input=>input.addEventListener('change',resetReading));
$('#allow-reversals').addEventListener('change',resetReading);
async function shuffle(){
 if(!(await requireMember()))return;resetReading();
 const kind=document.querySelector('input[name=spread]:checked').value;state=engine.createSpread(kind,focus);
 $('#deck-tray').innerHTML=state.deck.slice(0,12).map((id,index)=>'<button class="deck-card" data-draw="'+id+'" aria-label="Choose card '+(index+1)+'">'+cardBack+'</button>').join('');
 $('#chosen-spread').replaceChildren();$('#draw-guidance').textContent='Choose '+engine.spreads[kind].count+(kind==='quick'?' card.':' cards.');$('#open-reading').disabled=true;$('#draw-room').hidden=false;scrollTo($('#draw-title'));
}
$('#shuffle-deck').addEventListener('click',shuffle);$('#reshuffle').addEventListener('click',shuffle);
$('#deck-tray').addEventListener('click',event=>{
 const button=event.target.closest('[data-draw]');if(!button||!state||button.disabled)return;
 state=engine.chooseCard(state,button.dataset.draw,$('#allow-reversals').checked&&engine.secureIndex(2)===1);
 const complete=engine.spreadComplete(state);
 button.disabled=true;button.setAttribute('aria-label','Card chosen');
 // The selected card library is fetched only after the server confirms membership.
 renderChosen();const left=engine.spreads[state.kind].count-state.selected.length;
 $('#draw-guidance').textContent=complete?'Your cards are here. Open the reading when you are ready.':'Choose '+left+' more '+(left===1?'card.':'cards.');
 $('#open-reading').disabled=!complete;
});
async function renderChosen(){
 const {getTarotCard}=await import('./tarot-deck.js');
 if(!state)return;
 $('#chosen-spread').innerHTML=state.selected.map((draw,index)=>{
  const card=getTarotCard(draw.id);
  return '<figure class="chosen-card" style="margin:0">'+cardArtwork(card,draw.reversed)+'<span>'+escape(engine.spreads[state.kind].positions[index])+'</span><strong>'+escape(card.name)+'</strong><small>'+(draw.reversed?'Reversed · another perspective':'Upright')+'</small></figure>';
 }).join('');
}
$('#open-reading').addEventListener('click',async()=>{
 if(!(await requireMember())||!state||!engine.spreadComplete(state))return;
 reading=engine.buildReading(state);reflection='';
 $('#reading-meta').textContent=engine.spreads[state.kind].name+' · '+reading.sections.length+(reading.sections.length===1?' card':' cards')+' · '+engine.focuses[reading.focus].name+' · About '+reading.minutes+' '+(reading.minutes===1?'minute':'minutes')+' to read, with room to reflect';
 $('#reading-opening').textContent=reading.opening;$('#reading-closing').textContent=reading.closing;
 const {getTarotCard}=await import('./tarot-deck.js');
 $('#reading-sections').innerHTML=reading.sections.map((section,index)=>'<article class="reading-card"><header><div class="card-thumbnail">'+cardArtwork(getTarotCard(section.id),section.reversed)+'</div><div><p class="eyebrow">'+String(index+1).padStart(2,'0')+' / '+escape(section.position.toUpperCase())+'</p><h3>'+escape(section.name)+'</h3><p class="keywords">'+escape(section.keywords)+(section.reversed?' · Reversed':'')+'</p></div></header><p class="card-meaning">'+escape(section.body)+'</p><p>'+escape(section.context)+'</p><div class="card-question">'+escape(section.question)+'</div></article>').join('');
 $('#reading-room').hidden=false;scrollTo($('#reading-title'));
});
$('#save-reading').addEventListener('click',()=>{
 if(!reading)return;const url=URL.createObjectURL(new Blob([engine.readingText(reading,reflection)],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
 link.href=url;link.download='key-to-the-soul-'+reading.kind+'-tarot.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#new-reading').addEventListener('click',()=>{resetReading();scrollTo($('#setup-title'));});
function progress(kind,event){
 const meter=$('#'+kind+'-meter'),status=$('#'+kind+'-status');
 if(event.type==='generating'){meter.removeAttribute('value');status.textContent=event.device==='webgpu'?'Weaving a reflection with your device’s graphics…':'Weaving a reflection on this device. This can take a few minutes…';}
 else if(event.type==='fallback'){meter.removeAttribute('value');status.textContent='Opening the standard local voice pack for this device…';}
 else if(event.type==='voicing'){meter.value=event.completed/event.total*100;status.textContent='Preparing your voice · passage '+(event.completed+1)+' of '+event.total+(event.device==='webgpu'?' · using your device’s graphics.':'. You can cancel at any time.');}
 else if(event.status==='progress'&&event.file?.endsWith('.onnx')){meter.value=Number(event.progress)||0;status.textContent='Bringing the '+(kind==='edge'?'local reader':'natural voice')+' onto this device · '+Math.round(Number(event.progress)||0)+'%';}
 else if(event.status==='initiate'){meter.removeAttribute('value');status.textContent='Opening the self-hosted '+(kind==='edge'?'reader':'voice')+' pack…';}
}
async function runModel(kind){
 if(!reading||task||modelStarting)return;
 const current=version,snapshot=reading;modelStarting=true;
 const allowed=await requireMember();modelStarting=false;
 if(!allowed||current!==version||!reading)return;
 resetAudio();
 $('#edge-generate').disabled=true;$('#voice-generate').disabled=true;$('#'+kind+'-progress').hidden=false;$('#'+kind+'-cancel').hidden=false;$('#'+kind+'-status').textContent='Opening a little space on your device…';
 if(kind==='edge'){$('#edge-output').hidden=false;$('#edge-output').textContent='';}
 task=new EdgeTask(kind==='edge'?'reader':'voice',{progress:event=>{if(current===version)progress(kind,event);},token:()=>{}});
 try{
  const result=await task.run(kind==='edge'?{messages:engine.reflectionMessages(snapshot)}:{text:engine.readingText(snapshot,reflection)});
  if(current!==version)return;
  if(kind==='edge'){
   const clean=engine.cleanReflection(result.text,snapshot);
   if(clean){reflection=clean;$('#edge-output').textContent=clean;$('#edge-status').textContent='A reflection created here, on this device.';}
   else{$('#edge-output').hidden=true;$('#edge-output').textContent='';$('#edge-status').textContent='The small model did not produce a clear reflection this time. Your grounded card reading is ready above.';}
  }else{
   audioURL=URL.createObjectURL(new Blob([result.audio],{type:'audio/wav'}));$('#reading-audio').src=audioURL;$('#reading-audio').hidden=false;$('#audio-note').hidden=false;
   $('#audio-note').textContent='YOUR READING · '+Math.ceil(result.seconds/60)+(Math.ceil(result.seconds/60)===1?' MINUTE':' MINUTES')+' · CREATED ON THIS DEVICE';
   $('#voice-status').textContent='Your narration is ready. Press play whenever you like.';$('#voice-generate').textContent='Prepare narration again ↗';
  }
  $('#'+kind+'-meter').value=100;
 }catch(error){if(current===version){$('#'+kind+'-status').textContent=error.message;if(kind==='edge'){$('#edge-output').hidden=true;$('#edge-output').textContent='';}}}
 finally{if(current===version){task=null;$('#'+kind+'-cancel').hidden=true;$('#edge-generate').disabled=Boolean(reflection);$('#voice-generate').disabled=false;}}
}
$('#edge-generate').addEventListener('click',()=>runModel('edge'));$('#voice-generate').addEventListener('click',()=>runModel('voice'));
$('#edge-cancel').addEventListener('click',()=>task?.cancel());$('#voice-cancel').addEventListener('click',()=>task?.cancel());
$('#clear-model-cache').addEventListener('click',async()=>{task?.cancel();await clearEdgeCache();note.textContent='The local model cache has been removed. Your account and member access stay the same.';});
const check=setInterval(()=>{if(!document.hidden&&member)refreshMember().catch(()=>{});},60000);
addEventListener('pagehide',()=>{clearInterval(check);task?.cancel();resetAudio();$('#member-password').value='';$('#member-code').value='';},{once:true});
refreshMember().then(()=>subscriptions.finishReturn()).catch(()=>{note.textContent='Member sign-in is temporarily unavailable. Please try again shortly.';});

let localVoice=null,speechQueue=[],speechGeneration=0;
function stopDeviceVoice(){speechGeneration++;speechQueue=[];if('speechSynthesis' in window)speechSynthesis.cancel();$('#device-stop').hidden=true;$('#device-speak').disabled=false;}
function updateDeviceVoice(){
 if(!('speechSynthesis' in window))return;
 localVoice=speechSynthesis.getVoices().find(voice=>voice.localService&&/^en/i.test(voice.lang))||null;
 $('#device-voice-controls').hidden=!localVoice;
}
function speakNext(generation){
 if(generation!==speechGeneration)return;
 const text=speechQueue.shift();if(!text){stopDeviceVoice();return;}
 const utterance=new SpeechSynthesisUtterance(text);utterance.voice=localVoice;utterance.rate=.9;
 utterance.onend=()=>speakNext(generation);utterance.onerror=()=>stopDeviceVoice();speechSynthesis.speak(utterance);
}
$('#device-speak').addEventListener('click',()=>{
 if(!reading||!localVoice)return;stopDeviceVoice();$('#reading-audio').pause();
 speechQueue=engine.splitSpeech(engine.readingText(reading,reflection),220);$('#device-stop').hidden=false;$('#device-speak').disabled=true;speakNext(speechGeneration);
});
$('#device-stop').addEventListener('click',stopDeviceVoice);
$('#reading-audio').addEventListener('play',stopDeviceVoice);
if('speechSynthesis' in window){speechSynthesis.addEventListener('voiceschanged',updateDeviceVoice);updateDeviceVoice();}
