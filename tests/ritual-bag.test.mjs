import test from 'node:test';
import assert from 'node:assert/strict';
import {BAG_STORAGE_KEY,PREVIOUS_BAG_KEY,OLDER_BAG_KEY,LEGACY_BAG_KEY,normalizeNote,normalizeRitualBag,restoreRitualBag,summarizeBag,formatBagSummary,addBagItem,resizeBagLine,changeBagLine,lineKey} from '../ritual-bag.js';
test('old saved selections migrate without inventing a size',()=>{
 const saved=new Map([[LEGACY_BAG_KEY,JSON.stringify({'love-333':2,happy:1})]]);
 assert.deepEqual(restoreRitualBag(key=>saved.get(key)??null),{version:4,items:{'love-333::unselected':2,'happy::unselected':1},note:''});
});
test('version two preserves the intention note when migrating',()=>{
 const saved=new Map([[OLDER_BAG_KEY,JSON.stringify({version:2,items:{'release-1010':2},note:'A new chapter.'})]]);
 assert.deepEqual(restoreRitualBag(key=>saved.get(key)??null),{version:4,items:{'release-1010::unselected':2},note:'A new chapter.'});
});
test('current sized bag survives a save and reload',()=>{
 const bag={version:4,items:{'love-333::mini':2,'love-333::deluxe':1},note:'Choosing myself.'};
 const saved=new Map([[BAG_STORAGE_KEY,JSON.stringify(bag)]]);
 assert.deepEqual(restoreRitualBag(key=>saved.get(key)??null),bag);
});
test('damaged newest record can fall back to the previous bag',()=>{
 const saved=new Map([[BAG_STORAGE_KEY,'{broken'],[PREVIOUS_BAG_KEY,JSON.stringify({items:{happy:2},note:''})]]);
 assert.deepEqual(restoreRitualBag(key=>saved.get(key)??null).items,{'happy::unselected':2});
});
test('notes are bounded plain text and preserve whole emoji',()=>{
 assert.equal(normalizeNote(null),'');assert.equal(normalizeNote('a'+String.fromCharCode(0)+'b'),'ab');
 assert.equal(Array.from(normalizeNote('🌙'.repeat(300))).length,240);
 assert.equal(normalizeNote('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');
});
test('different sizes remain separate and exact subtotals use integer cents',()=>{
 let items=addBagItem({},'love-333','mini');items=addBagItem(items,'love-333','mini');items=addBagItem(items,'love-333','deluxe');
 const summary=summarizeBag(items);
 assert.equal(summary.count,3);assert.equal(summary.types,1);assert.equal(summary.lineCount,2);
 assert.equal(summary.subtotalCents,6000);assert.equal(summary.unpricedCount,0);
});
test('old unsized candles are excluded from the partial subtotal',()=>{
 const summary=summarizeBag({'love-333':2,'happy::signature':1});
 assert.equal(summary.count,3);assert.equal(summary.unpricedCount,2);
 assert.equal(summary.subtotalCents,2600);
});
test('changing size merges matching lines without dropping quantity',()=>{
 const moved=resizeBagLine({'love-333::mini':2,'love-333::signature':1},'love-333::mini','signature');
 assert.deepEqual(moved.items,{'love-333::signature':3});assert.equal(moved.changed,true);
 const full=resizeBagLine({'love-333::mini':2,'love-333::signature':8},'love-333::mini','signature');
 assert.equal(full.error,'quantity-limit');assert.deepEqual(full.items,{'love-333::mini':2,'love-333::signature':8});
});
test('size selection converts unsized saved candles without guessing',()=>{
 const result=resizeBagLine({'love-333':2},'love-333::unselected','deluxe');
 assert.deepEqual(result.items,{'love-333::deluxe':2});
 assert.equal(resizeBagLine(result.items,'love-333::deluxe','unknown').error,'invalid-selection');
});
test('invalid items and sizes cannot inject arbitrary prices',()=>{
 const bag=normalizeRitualBag({items:{'love-333::fake':9,'unknown::mini':4,'happy::mini':100},note:42,price:1});
 assert.deepEqual(bag,{version:4,items:{'happy::mini':9},note:''});
 assert.deepEqual(addBagItem({},'love-333','unknown'),{});
 assert.deepEqual(changeBagLine({'happy::mini':1},'happy::mini',-1),{});
});
test('download includes chosen sizes and an exact candle subtotal',()=>{
 const summary=formatBagSummary({items:{'love-333::mini':2,'love-333::deluxe':1},note:'Make room for myself.'});
 assert.ok(summary.includes('2 × Love 333'));assert.ok(summary.includes('Mini · 4 oz'));
 assert.ok(summary.includes('CANDLE SUBTOTAL: $60'));
 assert.ok(summary.includes('Make room for myself.'));assert.ok(summary.includes('not an order or stock reservation'));
});

test('old Deluxe preserves quantity and requires a new size choice',()=>{
 const previous={version:3,items:{'love-333::deluxe':2,'love-333::unselected':8,'love-333::mini':1},note:'Keep this intention.'};
 const saved=new Map([[PREVIOUS_BAG_KEY,JSON.stringify(previous)]]);
 const bag=restoreRitualBag(key=>saved.get(key)??null);
 assert.equal(bag.version,4);assert.equal(bag.items['love-333::legacy-deluxe'],2);assert.equal(bag.items['love-333::unselected'],8);assert.equal(bag.note,'Keep this intention.');
 const summary=summarizeBag(bag.items);assert.equal(summary.count,11);assert.equal(summary.unpricedCount,10);assert.equal(summary.subtotalCents,1200);
 const selected=resizeBagLine(bag.items,'love-333::legacy-deluxe','deluxe');assert.equal(selected.items['love-333::deluxe'],2);assert.equal(summarizeBag(selected.items).subtotalCents,8400);
});
