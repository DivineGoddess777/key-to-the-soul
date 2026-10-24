import test from 'node:test';import assert from 'node:assert/strict';import {EdgeTask} from '../tarot-edge.js';
test('local inference is exclusive across tabs and releases its lock after completion or cancel',async()=>{
 const oldWorker=globalThis.Worker,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let held=false;const workers=[];
 class MockWorker{constructor(){this.events={};workers.push(this);}addEventListener(type,callback){this.events[type]=callback;}postMessage(data){this.data=data;}terminate(){this.terminated=true;}done(){this.events.message({data:{id:this.data.id,type:'done',text:'Ready'}});}}
 globalThis.Worker=MockWorker;Object.defineProperty(globalThis,'navigator',{configurable:true,value:{locks:{async request(name,options,callback){assert.equal(name,'ktts-local-inference');assert.equal(options.ifAvailable,true);if(held)return callback(null);held=true;try{return await callback({name});}finally{held=false;}}}}});
 try{
  const first=new EdgeTask('reader'),pending=first.run({messages:[]});assert.ok(workers[0].data);assert.equal(held,true);
  const second=new EdgeTask('voice');await assert.rejects(second.run({text:'Hello'}),/another tab/);assert.equal(workers[1].data,undefined);assert.equal(workers[1].terminated,true);
  workers[0].done();await pending;assert.equal(held,false);
  const third=new EdgeTask('voice'),cancelled=third.run({text:'Hello'});third.cancel();await assert.rejects(cancelled,/Paused/);assert.equal(held,false);
  const fourth=new EdgeTask('reader'),ready=fourth.run({messages:[]});workers[3].done();assert.equal((await ready).text,'Ready');
 }finally{globalThis.Worker=oldWorker;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});
test('browsers without Web Locks can still finish and clean up a local worker',async()=>{
 const oldWorker=globalThis.Worker,oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');let worker;
 globalThis.Worker=class{constructor(){worker=this;this.events={};}addEventListener(type,callback){this.events[type]=callback;}postMessage(data){queueMicrotask(()=>this.events.message({data:{id:data.id,type:'done',text:'Ready'}}));}terminate(){this.terminated=true;}};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});
 try{const task=new EdgeTask('reader');assert.equal((await task.run({messages:[]})).text,'Ready');assert.equal(worker.terminated,true);}
 finally{globalThis.Worker=oldWorker;if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;}
});
import {withPinnedModelLengths} from '../edge/model-fetch.js';
test('large models stream bounded ranges, retry a short part, and support servers without ranges',async()=>{
 const bytes=new Uint8Array([0,1,2,3,4,5,6,7,8,9]),calls=[];let interrupted=true;
 const fetcher=async(input,init)=>{
  const range=new Headers(init.headers).get('Range');calls.push(range);
  const [,start,end]=range.match(/bytes=(\d+)-(\d+)/).map(Number);
  const part=bytes.slice(start,end+1);
  if(start===4&&interrupted){interrupted=false;return new Response(part.slice(0,1),{status:206});}
  return new Response(part,{status:206});
 };
 const entries=[{path:'models/test.onnx',bytes:10}];
 const response=await withPinnedModelLengths(fetcher,entries,'https://store.example',{chunkBytes:4})('/models/test.onnx');
 assert.equal(response.status,200);assert.equal(response.headers.get('content-length'),'10');
 assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[...bytes]);
 assert.deepEqual(calls,['bytes=0-3','bytes=4-7','bytes=4-7','bytes=8-9']);
 const fallback=await withPinnedModelLengths(async()=>new Response(bytes),entries,'https://store.example',{chunkBytes:4})('/models/test.onnx');
 assert.deepEqual([...new Uint8Array(await fallback.arrayBuffer())],[...bytes]);
});
test('canceling a ranged download aborts its network request',async()=>{
 let signal;
 const fetcher=async(input,init)=>{signal=init.signal;return new Response(new Uint8Array([1,2]),{status:206});};
 const response=await withPinnedModelLengths(fetcher,[{path:'models/test.onnx',bytes:4}],'https://store.example',{chunkBytes:2})('/models/test.onnx');
 await response.body.cancel();assert.equal(signal.aborted,true);
});
test('CDN model streams use pinned decoded sizes, preserving other fetch responses',async()=>{
 const origin='https://store.example';
 const entries=[{path:'models/voice/onnx/model_q8.onnx',bytes:6}];
 const fetcher=async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3,4,5,6]));c.close();}}),{headers:{'content-encoding':'br','content-length':'3'}});
 const wrapped=withPinnedModelLengths(fetcher,entries,origin);
 const model=await wrapped('/models/voice/onnx/model_q8.onnx');
 assert.equal(model.headers.get('content-length'),'6');
 assert.equal(model.headers.has('content-encoding'),false);
 assert.deepEqual([...new Uint8Array(await model.arrayBuffer())],[1,2,3,4,5,6]);
 for(const url of ['/other','https://elsewhere.example/models/voice/onnx/model_q8.onnx']){
  const response=await wrapped(url);assert.equal(response.headers.get('content-length'),'3');
 }
 const denied=new Response('Member required',{status:403});
 assert.equal(await withPinnedModelLengths(async()=>denied,entries,origin)('/models/voice/onnx/model_q8.onnx'),denied);
});
