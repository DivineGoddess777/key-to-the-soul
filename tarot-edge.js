export class EdgeTask{
 constructor(kind,{progress=()=>{},token=()=>{}}={}){
  this.worker=new Worker(new URL('./vendor/edge/'+kind+'-worker.js',import.meta.url),{type:'module'});
  this.progress=progress;this.token=token;this.id=crypto.randomUUID();this.finished=false;
 }
 run(payload){
  if(globalThis.navigator?.locks)return navigator.locks.request('ktts-local-inference',{ifAvailable:true},lock=>{
   if(!lock){this.close();throw Error('A local model is running in another tab. Finish or cancel it there, then try again.');}
   if(this.finished)throw Error('Paused here. Your written reading is ready whenever you are.');
   return this.execute(payload);
  });
  return this.execute(payload);
 }
 execute(payload){
  return new Promise((resolve,reject)=>{
   this.reject=reject;
   this.timeout=setTimeout(()=>{this.close();reject(Error('This device needs more time. Your card reading is still available; you can try again.'));},600000);
   this.worker.addEventListener('error',()=>{this.close();reject(Error('The local model could not start on this device. Your written reading is still here.'));},{once:true});
   this.worker.addEventListener('message',event=>{
    const data=event.data;if(this.finished||data.id!==this.id)return;
    if(data.type==='done'){this.close();resolve(data);}
    else if(data.type==='error'){console.warn('Local model runtime:',data.debug);this.close();reject(Error(data.message));}
    else if(data.type==='token')this.token(data.text);
    else this.progress(data);
   });
   this.worker.postMessage({id:this.id,...payload});
  });
 }
 close(){if(this.finished)return;this.finished=true;clearTimeout(this.timeout);this.worker.terminate();}
 cancel(){this.close();this.reject?.(Error('Paused here. Your written reading is ready whenever you are.'));}
}
export async function clearEdgeCache(){
 if(!('caches' in globalThis))return;
 for(const name of await caches.keys())if(name==='ktts-edge-v1'||name==='kokoro-voices')await caches.delete(name);
}
