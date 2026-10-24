import test from 'node:test';
import assert from 'node:assert/strict';
import {gardenLayout,createGarden} from '../zen-state.js';

test('Moon Room controls, keyboard, pointer drops, timer, motion and private release work together',async()=>{
 const handlers=new Map(),frames=new Map(),intervals=new Map();let clock=1000,sequence=0;
 class Element{
  constructor(){this.listeners={};this.attributes={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.classes=new Set();this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:(...names)=>names.forEach(n=>this.classes.delete(n)),contains:n=>this.classes.has(n),toggle:(n,force)=>{const value=force??!this.classes.has(n);if(value)this.classes.add(n);else this.classes.delete(n);return value;}};}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  fire(type,data={}){const event={button:0,pointerId:1,preventDefault(){},stopPropagation(){},...data};for(const fn of this.listeners[type]??[])fn(event);}
  setAttribute(name,value){this.attributes[name]=value;} focus(){}
 }
 const ids=['zen-canvas','zen-status','settle-moon','garden-reset','make-ripple','water-reset','zen-clock','session-toggle','session-length','session-reset','garden-controls','water-controls','time-controls','zen-clock-wrap','zen-instructions','stage-whisper','zen-motion','release-thought','release-thought-button'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const stage=new Element(),body=new Element(),modes=['garden','water','time'].map(mode=>{const element=new Element();element.dataset.mode=mode;return element;});
 const canvas=elements['zen-canvas'];let captured=null,draws=0;
 const context=new Proxy({createRadialGradient:()=>({addColorStop(){}}),createLinearGradient:()=>({addColorStop(){}}),clearRect:()=>draws++},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
 canvas.getContext=()=>context;canvas.getBoundingClientRect=()=>({left:0,top:0,width:600,height:420});
 canvas.setPointerCapture=id=>captured=id;canvas.hasPointerCapture=id=>captured===id;canvas.releasePointerCapture=()=>{captured=null;canvas.fire('lostpointercapture');};
 const doc={body,hidden:false,querySelector:selector=>selector==='.room-stage'?stage:elements[selector.slice(1)],querySelectorAll:selector=>selector==='[data-mode]'?modes:[],addEventListener(type,fn){(handlers.get(type)||handlers.set(type,[]).get(type)).push(fn);}};
 const emit=(type,event={})=>{for(const fn of handlers.get(type)??[])fn(event);};
 const preference={matches:true,addEventListener(){}};
 const windowObject={postMessage(){}};
 const replacements={document:doc,window:windowObject,parent:windowObject,location:{search:'?embed=1',origin:'http://localhost'},devicePixelRatio:1,matchMedia:()=>preference,
 performance:{now:()=>clock},requestAnimationFrame:fn=>{const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
 setInterval:fn=>{const id=++sequence;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
 addEventListener:(type,fn)=>(handlers.get(type)||handlers.set(type,[]).get(type)).push(fn),
 Image:class{complete=true;naturalWidth=130;},ResizeObserver:class{constructor(fn){this.fn=fn;}observe(){this.fn();}disconnect(){}},
 IntersectionObserver:class{constructor(fn){this.fn=fn;}observe(){this.fn([{isIntersecting:true}]);}disconnect(){}}};
 const saved=new Map(Object.keys(replacements).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(replacements))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 const flush=()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(clock);};
 try{
  elements['session-length'].value='60';
  await import('../moon-room.js');
  flush();assert.ok(draws>0);assert.equal(frames.size,0,'reduced motion leaves no animation loop');
  assert.equal(elements['zen-motion'].attributes['aria-pressed'],'true');
  assert.ok(body.classes.has('embed'));
  canvas.fire('keydown',{key:'ArrowRight'});assert.match(elements['zen-status'].textContent,/Waxing crescent selected/);
  canvas.fire('keydown',{key:'Enter'});assert.match(elements['zen-status'].textContent,/1 of 8/);
  const layout=gardenLayout(600,374),tokens=createGarden(600,374),token=tokens[0],target=layout.targets[0];
  canvas.fire('pointerdown',{clientX:token.x*600,clientY:token.y*374});
  canvas.fire('pointermove',{clientX:target.x*600,clientY:target.y*374});
  canvas.fire('pointerup',{clientX:target.x*600,clientY:target.y*374});
  assert.match(elements['zen-status'].textContent,/2 of 8/);
  for(let i=0;i<6;i++)elements['settle-moon'].fire('click');
  assert.equal(elements['settle-moon'].disabled,true);assert.match(elements['zen-status'].textContent,/circle is complete/);
  elements['garden-reset'].fire('click');assert.equal(elements['settle-moon'].disabled,false);
  modes[1].fire('click');assert.equal(elements['water-controls'].hidden,false);assert.equal(elements['garden-controls'].hidden,true);
  elements['make-ripple'].fire('click');flush();assert.equal(frames.size,0,'static ripples respect reduced motion');
  elements['water-reset'].fire('click');assert.match(elements['zen-status'].textContent,/water is still/);
  modes[2].fire('click');elements['session-length'].value='180';elements['session-length'].fire('change');
  assert.equal(elements['zen-clock'].textContent,'03:00');
  elements['session-toggle'].fire('click');clock+=30000;for(const fn of intervals.values())fn();
  assert.equal(elements['zen-clock'].textContent,'02:30','functional time continues with decorative motion paused');
  doc.hidden=true;emit('visibilitychange');assert.equal(intervals.size,0);
  clock+=20000;doc.hidden=false;emit('visibilitychange');
  assert.equal(elements['zen-clock'].textContent,'02:30');
  elements['session-toggle'].fire('click');clock+=150001;for(const fn of [...intervals.values()])fn();
  assert.equal(elements['zen-clock'].textContent,'00:00');assert.equal(intervals.size,0);assert.match(elements['zen-status'].textContent,/moment is complete/);
  elements['session-toggle'].fire('click');modes[0].fire('click');assert.equal(intervals.size,0,'changing modes pauses the timer');
  const note=elements['release-thought'],release=elements['release-thought-button'];
  note.value='Something private';note.fire('input');assert.equal(release.disabled,false);
  release.fire('click');assert.equal(note.value,'');assert.equal(release.disabled,true);
  note.value='Another private thought';emit('pagehide');assert.equal(note.value,'');assert.equal(intervals.size,0);assert.equal(frames.size,0);
 }finally{
  for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});
