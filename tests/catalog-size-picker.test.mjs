import test from 'node:test';
import assert from 'node:assert/strict';
import {initCatalog} from '../catalog-ui.js';
import {candleSizes,money} from '../candle-sizes.js';
test('each of the six size choices enables the matching bag item and shows its exact price',()=>{
 const listeners=new Map();
 const select={addEventListener(){}};
 const dialog={addEventListener(event,callback){listeners.set(event,callback);}};
 const button={disabled:true,dataset:{},textContent:''};
 const confirmation={textContent:''};
 const elements=new Map([['#collection-intention-filter',select],['#product-dialog',dialog],['#product-dialog [data-add]',button],['#size-confirmation',confirmation]]);
 const previous=globalThis.document;
 globalThis.document={querySelector(selector){assert.ok(elements.has(selector),'Unexpected selector: '+selector);return elements.get(selector);}};
 try{
  initCatalog({showDialog(){}});
  for(const size of candleSizes){
   button.disabled=true;
   listeners.get('change')({target:{name:'candle-size',value:size.id}});
   assert.equal(button.disabled,false);assert.equal(button.dataset.size,size.id);
   assert.ok(confirmation.textContent.includes(money(size.priceCents)));
   assert.ok(confirmation.textContent.includes(size.weight));
   assert.ok(!confirmation.textContent.includes('estimated'));
  }
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
