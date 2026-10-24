import fs from 'node:fs/promises';
const escape=value=>String(value).replace(/[&<>"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));
const entries=[
 ['Qwen3-0.6B model','models/reading-qwen3/LICENSE'],
 ['Kokoro voice model','models/voice/LICENSE'],
 ['Transformers.js','vendor/edge/huggingface-transformers-LICENSE.txt'],
 ['ONNX Runtime','vendor/edge/onnxruntime-web-LICENSE.txt'],
 ['Kokoro.js','vendor/edge/kokoro-js-LICENSE.txt'],
 ['Phonemizer','vendor/edge/phonemizer-LICENSE.txt'],
 ['Three.js','vendor/three/LICENSE'],
 ['Cormorant Garamond','vendor/fonts/cormorantgaramond-OFL.txt'],
 ['Manrope','vendor/fonts/manrope-OFL.txt']
];
let sections='';for(const [name,file]of entries){const text=await fs.readFile(file,'utf8');sections+='<details style="border-top:1px solid var(--line);padding:22px 0"><summary style="cursor:pointer;color:var(--bright)">'+escape(name)+'</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;line-height:1.8;margin-top:25px">'+escape(text)+'</pre></details>';}
const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open-source credits · Key to the Soul</title><link rel="stylesheet" href="tarot.css"></head><body><header class="oracle-header"><a class="oracle-brand" href="index.html"><img src="logos/ember-copper-compact.svg" width="27" height="45" alt=""><span>Key to the Soul<small>RETURN TO THE STORE ↗</small></span></a></header><main style="max-width:850px;padding:60px 6%"><p class="eyebrow">BUILT WITH CARE</p><h1 style="font-size:65px">Open-source<br><em>credits.</em></h1><p style="line-height:1.9;color:var(--muted)">Our custom store and ritual experiences are built here. These self-hosted tools, typefaces, and models retain their original licenses. Expand any item to read its notice.</p><p style="font-size:12px;line-height:1.8;color:var(--muted)">Model sources: <a href="https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX">Qwen3 ONNX ↗</a> · <a href="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX">Kokoro ONNX ↗</a>. PayPal provides its own checkout interface and terms.</p>'+sections+'</main></body></html>';
await fs.writeFile('licenses.html',html);
let tarot=await fs.readFile('tarot.html','utf8');if(!tarot.includes('href="licenses.html"'))tarot=tarot.replace('<footer class="oracle-footer">','<footer class="oracle-footer"><a href="licenses.html" style="font-family:var(--sans);font-size:11px">Open-source credits ↗</a>');await fs.writeFile('tarot.html',tarot);
let index=await fs.readFile('index.html','utf8');if(!index.includes('href="licenses.html"'))index=index.replace('</nav></div><div class="footer-bottom">','<a href="licenses.html">Open-source credits ↗</a></nav></div><div class="footer-bottom">');await fs.writeFile('index.html',index);

