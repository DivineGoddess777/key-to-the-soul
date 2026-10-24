import test from 'node:test';
import assert from 'node:assert/strict';
import {gardenLayout,createGarden,resizeGarden,dropMoon,settleMoon,createSession,startSession,tickSession,pauseSession,timeLabel} from '../zen-state.js';

test('the eight moons can settle independently without mutating the previous garden',()=>{
 const layout=gardenLayout(700,420),original=createGarden(700,420);
 let tokens=original;
 for(let id=7;id>=0;id--){
  const result=settleMoon(tokens,layout,id);assert.equal(result.placed,true);
  assert.equal(result.complete,id===0);tokens=result.tokens;
  assert.deepEqual({x:tokens[id].x,y:tokens[id].y},layout.targets[id]);
 }
 assert.equal(original.some(token=>token.settled),false);
 assert.equal(settleMoon(tokens,layout).placed,false);
 assert.deepEqual(settleMoon(tokens,layout).tokens,tokens);
});

test('nearby drops snap gently and distant drops stay available',()=>{
 const layout=gardenLayout(600,400),tokens=createGarden(600,400),target=layout.targets[3];
 const nearby=dropMoon(tokens,3,{x:target.x+10/600,y:target.y},layout);
 assert.equal(nearby.placed,true);assert.equal(nearby.tokens[3].settled,true);
 const outside=dropMoon(tokens,3,{x:-2,y:4},layout);
 assert.equal(outside.placed,false);assert.equal(outside.complete,false);
 assert.equal(outside.tokens[3].x,.04);assert.equal(outside.tokens[3].y,.96);
 const fixed=dropMoon(nearby.tokens,3,{x:.8,y:.8},layout);
 assert.deepEqual(fixed.tokens[3],nearby.tokens[3]);
});

test('the orbit and moon positions fit both mobile and desktop stages',()=>{
 for(const [width,height] of [[320,344],[900,444],[380,284]]){
  const layout=gardenLayout(width,height),tokens=createGarden(width,height);
  for(const point of [...layout.targets,...tokens]){
   assert.ok(point.x>0&&point.x<1);assert.ok(point.y>0&&point.y<1);
  }
  assert.ok(layout.tokenRadius>=11);assert.equal(layout.targets.length,8);
 }
});

test('quiet time supports only the offered lengths',()=>{
 for(const seconds of [60,180,300])assert.equal(createSession(seconds).durationMs,seconds*1000);
 assert.equal(createSession(12).durationMs,60000);
 assert.equal(timeLabel(60000),'01:00');assert.equal(timeLabel(1),'00:01');assert.equal(timeLabel(0),'00:00');
});

test('pause preserves the remaining time and resume uses a fresh deadline',()=>{
 const initial=createSession(180),running=startSession(initial,1000);
 const paused=pauseSession(running,31000);
 assert.equal(paused.remainingMs,150000);assert.equal(paused.running,false);
 assert.deepEqual(tickSession(paused,1000000),paused);
 const resumed=startSession(paused,200000);
 assert.equal(resumed.deadline,350000);
 assert.equal(tickSession(resumed,349999).remainingMs,1);
 const complete=tickSession(resumed,351000);
 assert.equal(complete.remainingMs,0);assert.equal(complete.running,false);assert.equal(complete.deadline,null);
 assert.equal(startSession(complete,500000).remainingMs,180000);
 assert.equal(initial.remainingMs,180000);
});

test('rotation preserves the circular orbit and already settled moons',()=>{
 const portrait=gardenLayout(375,314),landscape=gardenLayout(760,174);
 const initial=createGarden(portrait.width,portrait.height);
 const placed=settleMoon(initial,portrait,2).tokens;
 const resized=resizeGarden(placed,portrait,landscape);
 for(const token of resized){
  if(token.settled){assert.deepEqual({x:token.x,y:token.y},landscape.targets[token.id]);continue;}
  const radius=Math.hypot(token.x*landscape.width-landscape.cx,token.y*landscape.height-landscape.cy);
  assert.ok(Math.abs(radius-174*.42)<.0001);
 }
 assert.deepEqual(placed[2],settleMoon(initial,portrait,2).tokens[2]);
});
