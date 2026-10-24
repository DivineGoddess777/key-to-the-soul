import {AutoTokenizer,AutoModelForCausalLM,TextGenerationPipeline,env} from '@huggingface/transformers';
import {reflectionMessages,buildReading,createSpread,chooseCard,cleanReflection} from '../tarot-state.js';
import {tarotDeck} from '../tarot-deck.js';
import fs from 'node:fs/promises';
env.allowRemoteModels=false;env.localModelPath=process.cwd()+'/models/';env.useFSCache=false;
const cases=[
 {kind:'quick',focus:'becoming',cards:[['The Fool',false]]},
 {kind:'quick',focus:'self',cards:[['Death',true]]},
 {kind:'quick',focus:'connection',cards:[['The Devil',false]]},
 {kind:'quick',focus:'purpose',cards:[['Nine of Swords',true]]},
 {kind:'standard',focus:'connection',cards:[['Two of Cups',false],['The Tower',true],['Queen of Cups',false]]},
 {kind:'standard',focus:'purpose',cards:[['Six of Pentacles',true],['Eight of Pentacles',false],['The World',false]]},
 {kind:'deep',focus:'self',cards:[['The Star',false],['Five of Cups',true],['Strength',false],['Four of Swords',false],['Ace of Wands',true]]}
];
const options={dtype:'q4f16',device:'cpu',session_options:{intra_op_num_threads:2,inter_op_num_threads:1}};
let generator;const reports=[];
try{
 const [tokenizer,model]=await Promise.all([AutoTokenizer.from_pretrained('reading-qwen3',options),AutoModelForCausalLM.from_pretrained('reading-qwen3',options)]);
 generator=new TextGenerationPipeline({task:'text-generation',model,tokenizer});
 for(const entry of cases){
  let state=createSpread(entry.kind,entry.focus,()=>0);
  for(const [name,reversed] of entry.cards){const card=tarotDeck.find(card=>card.name===name);if(!card)throw Error('Unknown QA card '+name);state=chooseCard(state,card.id,reversed);}
  const reading=buildReading(state),start=performance.now();
  const result=await generator(reflectionMessages(reading),{tokenizer_encode_kwargs:{enable_thinking:false},max_new_tokens:128,do_sample:true,temperature:.7,top_p:.8,top_k:20,repetition_penalty:1.05});
  const raw=result[0].generated_text.at(-1).content,clean=cleanReflection(raw,reading);
  const report={...entry,ms:Math.round(performance.now()-start),raw,accepted:Boolean(clean),reflection:clean,source:reading.sections.map(section=>({name:section.name,reversed:section.reversed,body:section.body,question:section.question}))};
  reports.push(report);
  await fs.writeFile('qa/edge-reader-final-review.json',JSON.stringify({model:'Qwen3-0.6B q4f16',device:'CPU',sampled:true,note:'Local QA of original card text; not visitor data. Manual semantic review required.',reports},null,2));
  console.log(JSON.stringify({kind:entry.kind,cards:entry.cards,ms:report.ms,accepted:report.accepted,reflection:clean||raw}));
 }
}finally{await generator?.dispose();}

