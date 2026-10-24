import test from 'node:test';
import assert from 'node:assert/strict';
import {products,intentions,getProduct,normalizeBag,changeBag} from '../storefront-state.js';
test('each ritual intention leads to an existing candle',()=>{
 for(const intention of intentions)assert.ok(products.some(p=>p.intention===intention.id));
 assert.equal(new Set(products.map(p=>p.id)).size,products.length);
});
test('saved bag rejects malformed values and unknown products',()=>{
 for(const value of [null,[],7,'bad'])assert.deepEqual(normalizeBag(value),{});
 assert.deepEqual(normalizeBag({'release-1010':2,'love-333':-1,happy:'4','unknown':8,'prosperity-888':1.5}),{'release-1010':2});
 const inherited=Object.create({'love-333':3});assert.deepEqual(normalizeBag(inherited),{});
});
test('restored quantities are bounded, and zero removes an item',()=>{
 assert.deepEqual(normalizeBag({'love-333':500}),{'love-333':9});
 assert.deepEqual(changeBag({'love-333':1},'love-333',-1),{});
 assert.deepEqual(changeBag({'love-333':9},'love-333',1),{'love-333':9});
});
test('bag changes preserve other selections without mutating the old bag',()=>{
 const original={'happy':2};const result=changeBag(original,'love-333',1);
 assert.deepEqual(original,{'happy':2});assert.deepEqual(result,{'happy':2,'love-333':1});
 assert.deepEqual(changeBag(result,'unknown',4),result);
 assert.deepEqual(changeBag(result,'happy',.5),result);
});
test('products use size pricing rather than a fabricated base price',()=>{
 for(const p of products){assert.equal(p.priceCents,null);assert.equal(p.ritual.length,3);assert.ok(getProduct(p.id));}
});
