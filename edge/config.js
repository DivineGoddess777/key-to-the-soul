import {env} from '@huggingface/transformers';
import manifest from '../models/manifest.json' with {type:'json'};
import {withPinnedModelLengths} from './model-fetch.js';
const modelFetch=withPinnedModelLengths(globalThis.fetch.bind(globalThis),manifest.files,globalThis.location?.origin);
export async function configureLocalModels(){
 env.allowRemoteModels=false;env.allowLocalModels=true;env.useFS=false;
 // Keep this path relative to the origin: v4 metadata discovery skips absolute local URLs when remote models are disabled.
 env.localModelPath='/models/';
 env.fetch=modelFetch;
 env.backends.onnx.wasm.wasmPaths=new URL('./',import.meta.url).href;
 env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
 env.useBrowserCache=false;env.cacheKey='ktts-edge-v1';
 try{env.customCache=await caches.open('ktts-edge-v1');env.useCustomCache=true;}catch{env.useCustomCache=false;}
}
