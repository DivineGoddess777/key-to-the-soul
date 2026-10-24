import {KokoroTTS} from 'kokoro-js';
import {configureLocalModels} from './config.js';
import {splitSpeech,wavBytes} from '../tarot-state.js';
let running=false,tts;
self.addEventListener('message',async event=>{
 const {id,text}=event.data||{};if(running||!id||typeof text!=='string'||text.length>16000)return;running=true;
 try{
  await configureLocalModels();
  let device='wasm';
  try{const adapter=await navigator.gpu?.requestAdapter();if(adapter?.features.has('shader-f16'))device='webgpu';}catch{}
  const load=mode=>KokoroTTS.from_pretrained('voice',{device:mode,dtype:mode==='webgpu'?'fp16':'q8',progress_callback:progress=>self.postMessage({id,type:'progress',...progress})});
  try{tts=await load(device);}catch(error){if(device!=='webgpu')throw error;device='wasm';self.postMessage({id,type:'fallback'});tts=await load(device);}
  const chunks=splitSpeech(text),parts=[];let count=0;
  for(let i=0;i<chunks.length;i++){
   self.postMessage({id,type:'voicing',device,completed:i,total:chunks.length});
   let audio;try{audio=await tts.generate(chunks[i],{voice:'af_heart',speed:.95});}catch(error){if(device!=='webgpu')throw error;await tts.model.dispose();device='wasm';self.postMessage({id,type:'fallback'});tts=await load(device);audio=await tts.generate(chunks[i],{voice:'af_heart',speed:.95});}parts.push(audio.audio);count+=audio.audio.length;
  }
  const samples=new Float32Array(count);let offset=0;
  for(const part of parts){samples.set(part,offset);offset+=part.length;}
  const bytes=wavBytes(samples,24000);
  await tts.model.dispose();tts=null;
  self.postMessage({id,type:'done',audio:bytes,seconds:count/24000},[bytes]);
 }catch(error){self.postMessage({id,type:'error',debug:String(error?.message||error).slice(0,1000),message:'Natural narration could not finish on this device. You can still read and keep the full reading.'});}
 finally{if(tts){try{await tts.model.dispose();}catch{}tts=null;}running=false;}
});
