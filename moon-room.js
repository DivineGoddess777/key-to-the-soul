import {gardenLayout,createGarden,resizeGarden,dropMoon,settleMoon,createSession,startSession,tickSession,pauseSession,timeLabel} from './zen-state.js';
const $=selector=>document.querySelector(selector);
const canvas=$('#zen-canvas'),ctx=canvas.getContext('2d'),stage=$('.room-stage'),status=$('#zen-status');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
if(new URLSearchParams(location.search).has('embed'))document.body.classList.add('embed');
const phaseNames=['New moon','Waxing crescent','First quarter','Waxing gibbous','Full moon','Waning gibbous','Last quarter','Waning crescent'];
let width=1,height=1,layout=gardenLayout(1,1),tokens=[],selected=0,mode='garden',drag=null;
let still=reduced.matches,visible=true,frame=0,ripples=[],lastRipple=0,session=createSession(),interval=null;
const seal=new Image();seal.src='logos/ember-copper-compact.svg';seal.onload=()=>draw();
const now=()=>performance.now();
function announce(text){status.textContent=text;}
function point(event){const r=canvas.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
function clearFrame(){cancelAnimationFrame(frame);frame=0;}
function requestDraw(){if(!frame&&visible&&!document.hidden)frame=requestAnimationFrame(draw);}
function ripple(x=width/2,y=height/2){ripples.push({x:x/width,y:y/height,born:now()});ripples=ripples.slice(-36);requestDraw();}
function moon(x,y,r,phase,alpha=1){
 if(!ctx)return;
 ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;
 ctx.fillStyle='#22161d';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
 ctx.strokeStyle='#c18b6088';ctx.lineWidth=.8;ctx.stroke();
 if(phase!==0){
  const gradient=ctx.createLinearGradient(-r,-r,r,r);gradient.addColorStop(0,'#f1c8a3');gradient.addColorStop(.5,'#c18b60');gradient.addColorStop(1,'#75462e');ctx.fillStyle=gradient;
  ctx.shadowBlur=9;ctx.shadowColor='#c18b6028';
  if(phase===4){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();}
  else{
   const waxing=phase<4,shape=waxing?phase:8-phase,bend=shape===1?r*.95:shape===2?0:-r*.95;
   if(!waxing)ctx.scale(-1,1);
   ctx.beginPath();ctx.moveTo(0,-r);ctx.arc(0,0,r,-Math.PI/2,Math.PI/2);
   ctx.bezierCurveTo(bend*1.33,r*.5,bend*1.33,-r*.5,0,-r);ctx.closePath();ctx.fill();
  }
 }
 ctx.restore();
}
function draw(timestamp=now()){
 frame=0;if(!ctx||!visible||document.hidden)return;
 ctx.clearRect(0,0,width,height);
 const glow=ctx.createRadialGradient(width/2,height*.46,5,width/2,height*.46,Math.max(width,height)*.65);
 glow.addColorStop(0,'#382331');glow.addColorStop(.55,'#1a131c');glow.addColorStop(1,'#110d12');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
 for(let i=0;i<34;i++){
  const x=((i*127+41)%997)/997*width,y=((i*193+83)%911)/911*height*.9;
  ctx.fillStyle=i%5===0?'#d7a88265':'#c19c8130';ctx.beginPath();ctx.arc(x,y,i%5===0?1.1:.65,0,Math.PI*2);ctx.fill();
 }
 if(mode==='garden'){
  const coreRadius=layout.radius*.49;
  const core=ctx.createRadialGradient(layout.cx-coreRadius*.35,layout.cy-coreRadius*.45,1,layout.cx,layout.cy,coreRadius);
  core.addColorStop(0,'#654332');core.addColorStop(.35,'#38252a');core.addColorStop(.85,'#21161d');core.addColorStop(1,'#835238');
  ctx.save();ctx.shadowColor='#08050b';ctx.shadowBlur=20;ctx.shadowOffsetY=9;
  ctx.fillStyle=core;ctx.beginPath();ctx.arc(layout.cx,layout.cy,coreRadius,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.strokeStyle='#e2ad8560';ctx.lineWidth=.9;ctx.beginPath();ctx.arc(layout.cx,layout.cy,coreRadius-.7,-Math.PI*.93,-Math.PI*.14);ctx.stroke();
  ctx.strokeStyle='#c18b603b';ctx.lineWidth=.8;ctx.beginPath();ctx.arc(layout.cx,layout.cy,layout.radius,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#c18b6014';ctx.beginPath();ctx.arc(layout.cx,layout.cy,layout.radius+8,0,Math.PI*2);ctx.stroke();
  if(seal.complete&&seal.naturalWidth){const h=layout.radius*.93;ctx.globalAlpha=.83;ctx.save();ctx.shadowColor='#e4ab7160';ctx.shadowBlur=8;ctx.drawImage(seal,layout.cx-h*130/220/2,layout.cy-h/2,h*130/220,h);ctx.restore();ctx.globalAlpha=1;}
  for(const token of tokens){
   const target=layout.targets[token.id],x=target.x*layout.width,y=target.y*layout.height;
   if(!token.settled){
    moon(x,y,layout.tokenRadius,token.id,selected===token.id?.45:.17);
    ctx.setLineDash([2,5]);ctx.strokeStyle=selected===token.id?'#dba67c90':'#c18b6045';ctx.beginPath();ctx.arc(x,y,layout.tokenRadius+6,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
   }
  }
  for(const token of tokens){
   const position=token.settled?layout.targets[token.id]:token;
   moon(position.x*layout.width,position.y*layout.height,layout.tokenRadius,token.id,token.settled?.8:1);
   if(token.id===selected&&!token.settled){
    ctx.strokeStyle='#e4b18488';ctx.beginPath();ctx.arc(position.x*layout.width,position.y*layout.height,layout.tokenRadius+5,0,Math.PI*2);ctx.stroke();
   }
  }
 }else if(mode==='water'){
  for(let i=1;i<5;i++){ctx.strokeStyle='#c18b6010';ctx.beginPath();ctx.ellipse(width/2,height*.48,Math.min(width,height)*i*.12,Math.min(width,height)*i*.085,0,0,Math.PI*2);ctx.stroke();}
  moon(width/2,height*.38,Math.min(width,height)*.06,4,.72);
  ctx.strokeStyle='#c18b6020';
  for(let i=0;i<9;i++){const line=24+i*5;ctx.beginPath();ctx.moveTo(width/2-line/2,height*.49+i*6);ctx.lineTo(width/2+line/2,height*.49+i*6);ctx.stroke();}
 }else{
  const pulse=still||!session.running?0:Math.sin(timestamp/2600)*6;
  ctx.strokeStyle='#c18b6028';ctx.lineWidth=1;
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(width/2,height/2,Math.min(width,height)*.28+i*10+pulse,0,Math.PI*2);ctx.stroke();}
  ctx.strokeStyle='#d9a478';ctx.lineWidth=1.6;ctx.beginPath();
  ctx.arc(width/2,height/2,Math.min(width,height)*.28,-Math.PI/2,-Math.PI/2+Math.PI*2*(session.remainingMs/session.durationMs));ctx.stroke();
 }
 if(!still)ripples=ripples.filter(r=>timestamp-r.born<4200);
 for(const item of ripples){
  const age=still?700:timestamp-item.born,progress=age/4200;
  for(let i=0;i<3;i++){
   const radius=Math.max(2,age*.046-i*15);ctx.strokeStyle='rgba(218,164,119,'+Math.max(0,(1-progress)*.36-i*.07)+')';ctx.lineWidth=.8;
   ctx.beginPath();ctx.arc(item.x*width,item.y*height,radius,0,Math.PI*2);ctx.stroke();
  }
 }
 if(!still&&(ripples.length||(mode==='time'&&session.running)))requestDraw();
}
function resize(){
 const box=canvas.getBoundingClientRect();if(!box.width||!box.height)return;
 width=box.width;height=box.height;const ratio=Math.min(devicePixelRatio||1,1.5);
 canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);ctx?.setTransform(ratio,0,0,ratio,0,0);
 const previous=layout;layout=gardenLayout(width,Math.max(1,height-46));tokens=tokens.length?resizeGarden(tokens,previous,layout):createGarden(layout.width,layout.height);requestDraw();
}
const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
function selectNext(){selected=tokens.find(token=>!token.settled)?.id??0;}
function applyDrop(result){
 tokens=result.tokens;drag=null;stage.classList.remove('dragging');
 if(result.placed){
  const target=layout.targets[selected];ripple(target.x*layout.width,target.y*layout.height);
  const count=tokens.filter(token=>token.settled).length;
  announce(result.complete?'Your circle is complete. Stay awhile, or begin again.':count+' of 8 moons have found their place. No rush.');
  selectNext();
 }else announce('Take your time. The matching moon in the inner circle is your guide.');
 $('#settle-moon').disabled=result.complete;requestDraw();
}
function settleSelected(){
 const token=tokens.find(t=>t.id===selected&&!t.settled)||tokens.find(t=>!t.settled);
 if(!token)return;selected=token.id;applyDrop(settleMoon(tokens,layout,selected));
}
function cancelDrag(){
 if(!drag)return;const original=drag.original;tokens=tokens.map(t=>t.id===original.id?original:t);
 const pointer=drag.pointer;drag=null;stage.classList.remove('dragging');if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);requestDraw();
}
canvas.addEventListener('pointerdown',event=>{
 if(event.button!==0||mode==='time'||drag)return;
 const p=point(event);
 if(mode==='water'){ripple(p.x,p.y);lastRipple=now();canvas.setPointerCapture(event.pointerId);return;}
 const hit=tokens.filter(t=>!t.settled).map(t=>({token:t,d:Math.hypot(t.x*layout.width-p.x,t.y*layout.height-p.y)})).sort((a,b)=>a.d-b.d)[0];
 if(!hit||hit.d>layout.tokenRadius*1.9)return;
 selected=hit.token.id;drag={pointer:event.pointerId,original:{...hit.token}};canvas.setPointerCapture(event.pointerId);stage.classList.add('dragging');canvas.focus({preventScroll:true});requestDraw();
});
canvas.addEventListener('pointermove',event=>{
 const p=point(event);
 if(mode==='water'&&canvas.hasPointerCapture(event.pointerId)&&now()-lastRipple>70){ripple(p.x,p.y);lastRipple=now();return;}
 if(!drag||drag.pointer!==event.pointerId)return;
 tokens=tokens.map(t=>t.id===selected?{...t,x:p.x/layout.width,y:p.y/layout.height}:t);requestDraw();
});
canvas.addEventListener('pointerup',event=>{
 if(drag?.pointer===event.pointerId){const p=point(event);applyDrop(dropMoon(tokens,selected,{x:p.x/layout.width,y:p.y/layout.height},layout));}
 if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
});
canvas.addEventListener('pointercancel',cancelDrag);
canvas.addEventListener('lostpointercapture',cancelDrag);
canvas.addEventListener('keydown',event=>{
 if(mode==='garden'&&['ArrowLeft','ArrowRight','Enter',' '].includes(event.key)){
  event.preventDefault();cancelDrag();
  if(event.key==='Enter'||event.key===' ')settleSelected();
  else{
   const available=tokens.filter(t=>!t.settled);if(!available.length)return;
   const index=available.findIndex(t=>t.id===selected),direction=event.key==='ArrowLeft'?-1:1;
   selected=available[(index+direction+available.length)%available.length].id;
   announce(phaseNames[selected]+' selected. Press Enter to settle it.');requestDraw();
  }
 }else if(mode==='water'&&['Enter',' '].includes(event.key)){event.preventDefault();ripple();}
});
$('#settle-moon').addEventListener('click',settleSelected);
$('#garden-reset').addEventListener('click',()=>{cancelDrag();tokens=createGarden(layout.width,layout.height);selected=0;ripples=[];$('#settle-moon').disabled=false;announce('A fresh circle. Begin wherever you feel drawn.');requestDraw();});
$('#make-ripple').addEventListener('click',()=>{ripple();announce('A little movement. Room to settle.');});
$('#water-reset').addEventListener('click',()=>{ripples=[];announce('The water is still.');requestDraw();});
function drawClock(){
 $('#zen-clock').textContent=timeLabel(session.remainingMs);
 $('#zen-clock').setAttribute('aria-label',Math.ceil(session.remainingMs/1000)+' seconds remaining');
 $('#session-toggle').textContent=session.running?'Pause my time':session.remainingMs===0?'Begin again ↗':session.remainingMs<session.durationMs?'Resume ↗':'Begin my time ↗';requestDraw();
}
function stopInterval(){clearInterval(interval);interval=null;}
function pauseTime(message){
 if(!session.running)return;
 session=pauseSession(session,now());stopInterval();drawClock();if(message)announce(message);
}
function tick(){
 const wasRunning=session.running;session=tickSession(session,now());drawClock();
 if(wasRunning&&!session.running){stopInterval();announce('Your moment is complete. Carry a little of this quiet with you.');}
}
$('#session-toggle').addEventListener('click',()=>{
 if(session.running){pauseTime('Your moment can wait for you.');return;}
 session=startSession(session,now());stopInterval();interval=setInterval(tick,250);
 announce('Nothing to do. Just a little room for yourself.');drawClock();
});
function resetTime(){stopInterval();session=createSession(Number($('#session-length').value));drawClock();announce('A fresh moment, whenever you’re ready.');}
$('#session-length').addEventListener('change',resetTime);$('#session-reset').addEventListener('click',resetTime);
const descriptions={
 garden:['Interactive Moon Garden','Drag each moon to its matching place in the inner circle. Arrow keys choose a moon; Enter settles it. Or use “Settle a moon.”','A circle. A cycle. A little return to you.'],
 water:['Interactive Still Water','Touch or trace the water to create copper ripples. Press Enter on the pool, or use “Make a ripple.”','Even the ripples find their way back to stillness.'],
 time:['Quiet Time meditation timer','Choose one, three, or five minutes. You can pause or begin again whenever you like.','Observe the light, or simply rest here.']
};
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
 cancelDrag();pauseTime();mode=button.dataset.mode;ripples=[];
 document.querySelectorAll('[data-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
 for(const id of ['garden','water','time'])$('#'+id+'-controls').hidden=id!==mode;
 $('#zen-clock-wrap').hidden=mode!=='time';stage.classList.toggle('water',mode==='water');
 canvas.setAttribute('aria-label',descriptions[mode][0]);$('#zen-instructions').textContent=descriptions[mode][1];$('#stage-whisper').textContent=descriptions[mode][2];
 announce(mode==='garden'?'Take it at your own pace.':mode==='water'?'Let a little movement become stillness.':'Your time belongs to you.');drawClock();
}));
function syncMotion(){ $('#zen-motion').setAttribute('aria-pressed',String(still));$('#zen-motion').textContent=still?'Resume motion':'Pause motion';clearFrame();requestDraw(); }
$('#zen-motion').addEventListener('click',()=>{still=!still;ripples=[];syncMotion();});
reduced.addEventListener('change',()=>{still=reduced.matches;ripples=[];syncMotion();});syncMotion();
const note=$('#release-thought'),release=$('#release-thought-button');
note.addEventListener('input',()=>{release.disabled=!note.value.trim();});
release.addEventListener('click',()=>{note.value='';release.disabled=true;ripple(width*.47,height*.48);ripple(width*.53,height*.48);announce('Let that thought pass. This moment is yours.');});
document.addEventListener('keydown',event=>{
 if(event.key!=='Escape')return;
 if(drag){event.preventDefault();event.stopPropagation();cancelDrag();return;}
 if(parent!==window)parent.postMessage({type:'ktts-close-room'},location.origin);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag();pauseTime('Your moment is paused. Return when you’re ready.');clearFrame();}else requestDraw();});
const visibility=new IntersectionObserver(entries=>{
 visible=entries[0].isIntersecting;
 if(!visible){cancelDrag();pauseTime('Your moment is paused. Return when you’re ready.');clearFrame();}else requestDraw();
});visibility.observe(canvas);
addEventListener('pagehide',()=>{stopInterval();clearFrame();observer.disconnect();visibility.disconnect();note.value='';release.disabled=true;},{once:true});
$('#zen-instructions').textContent=descriptions.garden[1];drawClock();
if(!ctx)announce('The canvas is unavailable in this browser. Quiet Time and the reflection space are still here for you.');
