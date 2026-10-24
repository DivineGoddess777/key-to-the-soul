import {build} from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'vendor','edge');
await fs.mkdir(out,{recursive:true});
const upstream='https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/';
await build({absWorkingDir:root,entryPoints:['edge/reader-worker.js','edge/voice-worker.js'],outdir:out,entryNames:'[name]',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'eof',plugins:[{name:'self-host-kokoro-voice',setup(builder){builder.onLoad({filter:/kokoro-js[\\/]dist[\\/]kokoro\.js$/},async args=>{
 const source=await fs.readFile(args.path,'utf8');if(!source.includes(upstream))throw Error('Kokoro voice URL changed; review local-host patch.');
 return {contents:source.replaceAll(upstream,'../../models/voice/voices/'),loader:'js',resolveDir:path.dirname(args.path)};
});}}]});
for(const filename of (await fs.readdir(path.join(root,'node_modules','onnxruntime-web','dist'))).filter(file=>/^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(file))){
 await fs.copyFile(path.join(root,'node_modules','onnxruntime-web','dist',filename),path.join(out,filename));
}
for(const pkg of ['@huggingface/transformers','kokoro-js','phonemizer']){
 const label=pkg.replaceAll('/','-').replace('@','');
 await fs.copyFile(path.join(root,'node_modules',pkg,'LICENSE'),path.join(out,label+'-LICENSE.txt'));
}
await fs.copyFile(path.join(root,'edge','onnxruntime-LICENSE.txt'),path.join(out,'onnxruntime-web-LICENSE.txt'));
for(const file of await fs.readdir(out)){const stat=await fs.stat(path.join(out,file));console.log(file+' '+Math.round(stat.size/1e6*10)/10+' MB');}
