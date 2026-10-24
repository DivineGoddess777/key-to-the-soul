import {TextGenerationPipeline,AutoModelForCausalLM,env,StyleTextToSpeech2Model,AutoTokenizer} from '@huggingface/transformers';
import {KokoroTTS} from 'kokoro-js';
import {reflectionMessages,buildReading,createSpread,chooseCard,cleanReflection} from '../tarot-state.js';
import fs from 'node:fs/promises';
env.allowRemoteModels=false;env.localModelPath=process.cwd()+'/models/';env.useFSCache=false;
let start=performance.now();
const options={dtype:'q4f16',device:'cpu',session_options:{intra_op_num_threads:2,inter_op_num_threads:1}};
const [readerTokenizer,readerModel]=await Promise.all([AutoTokenizer.from_pretrained('reading-qwen3',options),AutoModelForCausalLM.from_pretrained('reading-qwen3',options)]);
const generator=new TextGenerationPipeline({task:'text-generation',model:readerModel,tokenizer:readerTokenizer});
const results=[];
for(const name of ['The Star','The Fool','Death']){
 const {tarotDeck}=await import('../tarot-deck.js');const card=tarotDeck.find(c=>c.name===name);
 const reading=buildReading(chooseCard(createSpread(),card.id));const t=performance.now();
 const result=await generator(reflectionMessages(reading),{tokenizer_encode_kwargs:{enable_thinking:false},max_new_tokens:128,do_sample:true,temperature:.7,top_p:.8,top_k:20,repetition_penalty:1.05});
 const output=result[0].generated_text.at(-1).content;
 const report={card:name,ms:Math.round(performance.now()-t),output,accepted:cleanReflection(output,reading)};results.push(report);console.log(JSON.stringify(report));
}
await generator.dispose();
await fs.writeFile('qa/edge-selected-quality.json',JSON.stringify({model:'Qwen3-0.6B q4f16',results},null,2));
start=performance.now();
const model=await StyleTextToSpeech2Model.from_pretrained('voice',{dtype:'q8',device:'cpu',session_options:{intra_op_num_threads:2,inter_op_num_threads:1}});
const tokenizer=await AutoTokenizer.from_pretrained('voice');const tts=new KokoroTTS(model,tokenizer);
const audio=await tts.generate('Take a breath. The moon invites you to pause, and make a little room for yourself.',{voice:'af_heart',speed:.95});
await audio.save('qa/local-voice.wav');
console.log(JSON.stringify({voiceSeconds:audio.audio.length/audio.sampling_rate,voiceMs:Math.round(performance.now()-start)}));
await model.dispose();
