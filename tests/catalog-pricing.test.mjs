import test from 'node:test';
import assert from 'node:assert/strict';
import {products} from '../storefront-state.js';
import {candleSizes,money} from '../candle-sizes.js';
import {zodiacSigns,angelNumbers,intentionNames} from '../catalog-collections.js';
test('six owner size tiers preserve exact weights and prices',()=>{
 assert.deepEqual(candleSizes.map(s=>[s.weight,s.priceCents]),[['4 oz',1200],['6 oz',1800],['8 oz',2600],['10 oz',3000],['12 oz',3600],['16 oz',4400]]);
 assert.equal(money(1200),'$12');
});
test('every provided intention name is represented',()=>{
 const candles=products.filter(p=>p.collections.includes('intention'));
 assert.equal(candles.length,intentionNames.length);
 for(const name of intentionNames)assert.ok(candles.some(p=>p.name===name));
});
test('all twelve Zodiac signs and angel numbers are represented',()=>{
 const zodiac=products.filter(p=>p.collections.includes('zodiac')),angel=products.filter(p=>p.collections.includes('angel'));
 assert.equal(zodiac.length,12);assert.equal(angel.length,12);
 for(const name of zodiacSigns)assert.ok(zodiac.some(p=>p.name===name));
 for(const number of angelNumbers)assert.ok(angel.some(p=>(p.number||p.name)===number));
});
test('collection artwork is not presented as missing real product photos',()=>{
 for(const p of products){assert.equal(p.includesHerbsAndCrystals,true);if(p.collections.includes('featured'))assert.ok(p.image);else assert.equal(p.image,null);}
 assert.equal(products.filter(p=>p.collections.includes('featured')).length,4);
});
