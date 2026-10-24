import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const models=[
 {folder:'reading-qwen3',id:'Qwen/Qwen3-0.6B',revision:'c1899de289a04d12100db370d81485cdf75e47ca',files:['LICENSE']},
 {folder:'reading-qwen3',id:'onnx-community/Qwen3-0.6B-ONNX',revision:'58ca03a5e7b354b480b1a82b34bde8dc7b854cc0',files:['config.json','generation_config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_q4f16.onnx','README.md']},
 {folder:'voice',id:'onnx-community/Kokoro-82M-v1.0-ONNX',revision:'1939ad2a8e416c0acfeecc08a694d14ef25f2231',files:['config.json','tokenizer.json','tokenizer_config.json','onnx/model_quantized.onnx','onnx/model_fp16.onnx','voices/af_heart.bin','README.md']}
];
const manifest=[];
for(const model of models){
 const listing=await fetch('https://huggingface.co/api/models/'+model.id+'/tree/'+model.revision+'?recursive=true').then(r=>{if(!r.ok)throw Error('Model metadata '+r.status);return r.json();});
 for(const file of model.files){
  const metadata=listing.find(item=>item.path===file);if(!metadata)throw Error('Missing upstream file: '+file);
  const dest=path.join(root,'models',model.folder,file);await fs.mkdir(path.dirname(dest),{recursive:true});
  let bytes;try{bytes=await fs.readFile(dest);}catch{}
  if(!bytes||bytes.length!==metadata.size){
   const response=await fetch('https://huggingface.co/'+model.id+'/resolve/'+model.revision+'/'+file,{signal:AbortSignal.timeout(600000)});
   if(!response.ok)throw Error(model.folder+'/'+file+': '+response.status);
   bytes=Buffer.from(await response.arrayBuffer());
  }
  const hash=createHash('sha256').update(bytes).digest('hex');
  if(bytes.length!==metadata.size||metadata.lfs?.oid&&metadata.lfs.oid!==hash)throw Error('Integrity mismatch: '+file);
  await fs.writeFile(dest,bytes);
  manifest.push({path:'models/'+model.folder+'/'+file,bytes:bytes.length,sha256:hash,source:model.id,revision:model.revision});
  console.log(model.folder+'/'+file+' '+Math.round(bytes.length/1e6*10)/10+' MB verified');
 }
}
await fs.writeFile(path.join(root,'models','voice','LICENSE'),await fs.readFile(path.join(root,'models','reading-qwen3','LICENSE')));
await fs.writeFile(path.join(root,'models','manifest.json'),JSON.stringify({license:'Apache-2.0',files:manifest},null,2)+'\n');
console.log('Self-hosted model pack verified: '+Math.round(manifest.reduce((sum,f)=>sum+f.bytes,0)/1e6)+' MB.');
