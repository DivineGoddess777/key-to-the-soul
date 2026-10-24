import {products,getProduct,getIntention} from './storefront-state.js';
import {getSize,money,sizeLabel,candleSizes} from './candle-sizes.js';
export const BAG_STORAGE_KEY='ktts-ritual-bag-v4';
export const PREVIOUS_BAG_KEY='ktts-ritual-bag-v3';
export const OLDER_BAG_KEY='ktts-ritual-bag-v2';
export const LEGACY_BAG_KEY='ktts-ritual-bag';
export function normalizeNote(value){
 return typeof value==='string'?Array.from(value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,'')).slice(0,240).join(''):'';
}
export function lineKey(productId,sizeId='unselected'){return productId+'::'+sizeId;}
export function getBagLine(key){
 if(typeof key!=='string')return null;
 const parts=key.split('::');if(parts.length>2)return null;
 const product=getProduct(parts[0]);if(!product)return null;
 const sizeId=parts.length===1?'unselected':parts[1];
 const size=getSize(sizeId);
 if(!['unselected','legacy-deluxe'].includes(sizeId)&&!size)return null;
 return {key:lineKey(product.id,size?.id||(sizeId==='legacy-deluxe'?'legacy-deluxe':'unselected')),product,size:size||null,legacyDeluxe:sizeId==='legacy-deluxe'};
}
export function normalizeLineItems(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const result={};
 for(const [key,qty] of Object.entries(raw)){
  const line=getBagLine(key);
  if(!line||typeof qty!=='number'||!Number.isInteger(qty)||qty<1)continue;
  result[line.key]=Math.min(9,(result[line.key]||0)+qty);
 }
 return result;
}
export function normalizeRitualBag(raw){
 const object=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const versioned=Object.hasOwn(object,'items');
 let rawItems=versioned?object.items:object;
 if(object.version===3&&rawItems&&typeof rawItems==='object'&&!Array.isArray(rawItems)){
  rawItems=Object.fromEntries(Object.entries(rawItems).map(([key,qty])=>[key.endsWith('::deluxe')?key.slice(0,-8)+'::legacy-deluxe':key,qty]));
 }
 return {version:4,items:normalizeLineItems(rawItems),note:versioned?normalizeNote(object.note):''};
}
export function restoreRitualBag(read){
 for(const key of [BAG_STORAGE_KEY,PREVIOUS_BAG_KEY,OLDER_BAG_KEY,LEGACY_BAG_KEY]){
  const value=read(key);if(value===null)continue;
  try{let parsed=JSON.parse(value);if(key===PREVIOUS_BAG_KEY&&parsed&&typeof parsed==='object')parsed={...parsed,version:3};return normalizeRitualBag(parsed);}catch{}
 }
 return normalizeRitualBag(null);
}
export function bagLines(raw){
 const items=normalizeLineItems(raw),order=new Map(products.map((p,index)=>[p.id,index]));
 return Object.entries(items).map(([key,qty])=>({...getBagLine(key),qty})).sort((a,b)=>{
  const productOrder=order.get(a.product.id)-order.get(b.product.id);if(productOrder)return productOrder;
  return (a.size?candleSizes.indexOf(a.size)+1:0)-(b.size?candleSizes.indexOf(b.size)+1:0);
 });
}
export function changeBagLine(raw,key,delta){
 const items=normalizeLineItems(raw),line=getBagLine(key);
 if(!line||![-1,1].includes(delta))return items;
 const qty=Math.max(0,Math.min(9,(items[line.key]||0)+delta));
 if(qty)items[line.key]=qty;else delete items[line.key];return items;
}
export function addBagItem(raw,productId,sizeId){
 if(!getProduct(productId)||!getSize(sizeId))return normalizeLineItems(raw);
 return changeBagLine(raw,lineKey(productId,sizeId),1);
}
export function resizeBagLine(raw,key,sizeId){
 const items=normalizeLineItems(raw),line=getBagLine(key),size=getSize(sizeId);
 if(!line||!size||!items[line.key])return {items,changed:false,error:'invalid-selection'};
 const target=lineKey(line.product.id,size.id);
 if(target===line.key)return {items,changed:false,error:null};
 if((items[target]||0)+items[line.key]>9)return {items,changed:false,error:'quantity-limit'};
 items[target]=(items[target]||0)+items[line.key];delete items[line.key];
 return {items,changed:true,error:null};
}
export function summarizeBag(raw){
 const lines=bagLines(raw);
 return {count:lines.reduce((sum,line)=>sum+line.qty,0),types:new Set(lines.map(line=>line.product.id)).size,lineCount:lines.length,
  intentions:[...new Set(lines.map(line=>line.product.intention))],
  subtotalCents:lines.reduce((sum,line)=>sum+(line.size?line.qty*line.size.priceCents:0),0),
  unpricedCount:lines.reduce((sum,line)=>sum+(line.size?0:line.qty),0)};
}
export function formatBagSummary(raw){
 const {items,note}=normalizeRitualBag(raw),summary=summarizeBag(items);
 const lines=['KEY TO THE SOUL','YOUR RITUAL BAG','',summary.count+' candle'+(summary.count===1?'':'s')+' saved for later',''];
 for(const line of bagLines(items)){
  const p=line.product;
  lines.push(line.qty+' × '+p.name+(p.number?' '+p.number:''),line.size?'  '+sizeLabel(line.size)+' / '+money(line.size.priceCents)+' each':'  Size not chosen — excluded from subtotal','  '+getIntention(p.intention).name,'  Includes herbs and crystals','');
 }
 if(summary.count>summary.unpricedCount)lines.push((summary.unpricedCount?'PARTIAL CANDLE SUBTOTAL: ':'CANDLE SUBTOTAL: ')+money(summary.subtotalCents));
 if(summary.unpricedCount)lines.push(summary.unpricedCount+' candle(s) still need a size.');
 lines.push('Shipping and any applicable tax are not included. Online checkout is not yet available.','');
 if(note.trim())lines.push('MY INTENTION',note.trim(),'');
 lines.push('Online ordering opens soon.','This is a saved selection, not an order or stock reservation.','','Come as you are. Leave a little lighter.');
 return lines.join('\n');
}
