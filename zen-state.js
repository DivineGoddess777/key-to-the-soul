export function gardenLayout(width,height){
 const unit=Math.max(1,Math.min(width,height)),cx=width/2,cy=height/2;
 return {width,height,cx,cy,radius:unit*.29,tokenRadius:Math.max(11,Math.min(21,unit*.035)),
 targets:Array.from({length:8},(_,id)=>{const angle=-Math.PI/2+id*Math.PI/4;return {x:(cx+Math.cos(angle)*unit*.29)/width,y:(cy+Math.sin(angle)*unit*.29)/height};})};
}
export function createGarden(width,height){
 const unit=Math.min(width,height);
 return Array.from({length:8},(_,id)=>{const angle=-Math.PI/2+id*Math.PI/4+.24;return {id,x:(width/2+Math.cos(angle)*unit*.42)/width,y:(height/2+Math.sin(angle)*unit*.42)/height,settled:false};});
}
export function resizeGarden(tokens,previous,next){
 const scale=Math.min(next.width,next.height)/Math.max(1,Math.min(previous.width,previous.height));
 return tokens.map(token=>token.settled?{...token,...next.targets[token.id]}:{
  ...token,
  x:Math.max(.04,Math.min(.96,(next.cx+(token.x*previous.width-previous.cx)*scale)/next.width)),
  y:Math.max(.04,Math.min(.96,(next.cy+(token.y*previous.height-previous.cy)*scale)/next.height))
 });
}
export function dropMoon(tokens,id,point,layout){
 let placed=false;
 const next=tokens.map(token=>{
  if(token.id!==id||token.settled)return {...token};
  const target=layout.targets[id];
  const distance=Math.hypot((point.x-target.x)*layout.width,(point.y-target.y)*layout.height);
  if(distance<=layout.tokenRadius*2.4){placed=true;return {...token,...target,settled:true};}
  return {...token,x:Math.max(.04,Math.min(.96,point.x)),y:Math.max(.04,Math.min(.96,point.y))};
 });
 return {tokens:next,placed,complete:next.every(token=>token.settled)};
}
export function settleMoon(tokens,layout,id=tokens.find(token=>!token.settled)?.id){
 if(id===undefined)return {tokens:tokens.map(token=>({...token})),placed:false,complete:tokens.every(token=>token.settled)};
 return dropMoon(tokens,id,layout.targets[id],layout);
}
export function createSession(seconds=60){
 const durationMs=[60,180,300].includes(seconds)?seconds*1000:60000;
 return {durationMs,remainingMs:durationMs,running:false,deadline:null};
}
export function startSession(session,now){
 const remainingMs=session.remainingMs>0?session.remainingMs:session.durationMs;
 return {...session,remainingMs,running:true,deadline:now+remainingMs};
}
export function tickSession(session,now){
 if(!session.running)return {...session};
 const remainingMs=Math.max(0,session.deadline-now);
 return {...session,remainingMs,running:remainingMs>0,deadline:remainingMs>0?session.deadline:null};
}
export function pauseSession(session,now){return {...tickSession(session,now),running:false,deadline:null};}
export function timeLabel(milliseconds){
 const seconds=Math.max(0,Math.ceil(milliseconds/1000));
 return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
}
