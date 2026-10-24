import {AutoTokenizer,AutoModelForCausalLM,TextGenerationPipeline} from '@huggingface/transformers';
import {configureLocalModels} from './config.js';
let running=false,generator;
self.addEventListener('message',async event=>{
 const {id,messages}=event.data||{};
 if(running||!id||!Array.isArray(messages))return;running=true;
 try{
  await configureLocalModels();
  let device='wasm';
  try{const adapter=await navigator.gpu?.requestAdapter();if(adapter?.features.has('shader-f16'))device='webgpu';}catch{}
  self.postMessage({id,type:'device',device});
  const options={device,dtype:'q4f16',progress_callback:progress=>self.postMessage({id,type:'progress',...progress})};
  const [tokenizer,model]=await Promise.all([AutoTokenizer.from_pretrained('reading-qwen3',options),AutoModelForCausalLM.from_pretrained('reading-qwen3',options)]);
  generator=new TextGenerationPipeline({task:'text-generation',tokenizer,model});
  self.postMessage({id,type:'generating',device});
  const result=await generator(messages,{tokenizer_encode_kwargs:{enable_thinking:false},max_new_tokens:128,do_sample:true,temperature:.7,top_p:.8,top_k:20,repetition_penalty:1.05});
  const text=result[0].generated_text.at(-1).content;
  await generator.dispose();generator=null;
  self.postMessage({id,type:'done',text});
 }catch(error){self.postMessage({id,type:'error',debug:String(error?.message||error).slice(0,1000),message:'The local reader could not finish on this device. Your card reading is still ready.'});}
 finally{if(generator){try{await generator.dispose();}catch{}generator=null;}running=false;}
});
