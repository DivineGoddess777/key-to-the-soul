import test from 'node:test';
import assert from 'node:assert/strict';
import {tarotDeck} from '../tarot-deck.js';
import {spreads,createSpread,chooseCard,shuffleDeck,secureIndex,spreadComplete,buildReading,readingText,reflectionMessages,cleanReflection,splitSpeech,wavBytes} from '../tarot-state.js';
test('the original deck contains 22 major and 56 minor cards with distinct meanings',()=>{
 assert.equal(tarotDeck.length,78);assert.equal(new Set(tarotDeck.map(card=>card.id)).size,78);
 assert.equal(tarotDeck.filter(card=>card.arcana==='major').length,22);
 for(const suit of ['wands','cups','swords','pentacles'])assert.equal(tarotDeck.filter(card=>card.suit===suit).length,14);
 for(const card of tarotDeck){assert.ok(card.upright.length>35);assert.ok(card.reversed.length>35);assert.ok(card.question.endsWith('?'));}
});
test('shuffling preserves all 78 cards and rejects biased random overflow',()=>{
 assert.equal(new Set(shuffleDeck(max=>max-1)).size,78);
 let calls=0;const source={getRandomValues(buffer){buffer[0]=calls++===0?4294967295:8;}};
 assert.equal(secureIndex(3,source),2);assert.equal(calls,2);
});
test('all three reading lengths enforce unique choices and complete spreads',()=>{
 for(const [kind,spread] of Object.entries(spreads)){
  const start=createSpread(kind,'self',()=>0);let state=start;
  assert.throws(()=>buildReading(state));
  for(let i=0;i<spread.count;i++){state=chooseCard(state,state.deck[i],i===0);assert.equal(state.selected.length,i+1);}
  assert.equal(spreadComplete(state),true);assert.equal(chooseCard(state,state.deck[10]),state);
  assert.equal(start.selected.length,0);
  const reading=buildReading(state);assert.equal(reading.sections.length,spread.count);
  assert.equal(reading.sections[0].reversed,true);assert.ok(readingText(reading).includes('reversed.'));
  const prompt=reflectionMessages(reading).at(-1).content;
  for(const card of reading.sections){assert.ok(prompt.includes(card.body));};
 }
});
test('a repeated or unknown card cannot enter a spread',()=>{
 let state=createSpread('deep','becoming',()=>0);state=chooseCard(state,state.deck[0]);
 assert.equal(chooseCard(state,state.deck[0]),state);assert.equal(chooseCard(state,'injected-card'),state);
});
test('local reflections are plain complete sentences and reject invented cards or guarantees',()=>{
 const start=createSpread('quick','self',()=>0),reading=buildReading(chooseCard(start,'major-0'));
 assert.equal(cleanReflection('You are guaranteed to succeed. This is certain.',reading),null);
 assert.equal(cleanReflection('The Tower shows you that everything will change soon. What does it mean?',reading),null);
 assert.equal(cleanReflection('In your story, this ancient symbol represents wisdom around the world.',reading),null);
 assert.equal(cleanReflection('I am ready for a new chapter. I have been struggling lately.',reading),null);
 assert.equal(cleanReflection('Only one complete sentence appears in this answer. What would help?',reading),null);
 assert.equal(cleanReflection('You can ask a friend, "What would help today?" This moment shows that we can grow together.',reading),null);
 assert.equal(cleanReflection('A worry may be loosening as it becomes easier to name or share. A worry may be loosening as it becomes easier to name or share.',reading),null);
 assert.equal(cleanReflection('Letting go of expectation and embracing quiet moments of grace. Letting go of expectation and embracing moments of grace.',reading),null);
 assert.equal(cleanReflection('Remember what this chapter means for you. Let me take care of you now.',reading),null);
 const knight={...reading,sections:[{id:'cups-knight',body:'Move toward connection with openness and discernment. Let a heartfelt idea meet real attention.',question:'Where could feeling become a thoughtful action?'}]};
 assert.equal(cleanReflection('Let the heart and mind be free. Let the soul find peace.',knight),null);
 const safe=cleanReflection('<b>You can give this beginning a little room.</b> A small step may be enough for today. An unfinished',reading);
 assert.equal(safe,'You can give this beginning a little room. A small step may be enough for today. '+reading.sections[0].question);
 const grounded=cleanReflection('You can give this beginning a little room. A small step may be enough for today. What would generic courage look like?',reading);
 assert.ok(grounded.endsWith(reading.sections[0].question));
 const echo=cleanReflection('Coming back to me. Source notes: You can make room for a fresh beginning. A small step is enough for today.',reading);
 assert.ok(!echo.includes('Source notes'));assert.ok(!echo.includes('Coming back to me'));assert.ok(echo.endsWith(reading.sections[0].question));
});
test('long narration splits below the model limit and produces a valid PCM WAV',()=>{
 const chunks=splitSpeech('A calm moment. '.repeat(100));assert.ok(chunks.length>1);assert.ok(chunks.every(text=>text.length<=260));
 const bytes=wavBytes(new Float32Array([-1,0,1]),24000),view=new DataView(bytes);
 assert.equal(new TextDecoder().decode(bytes.slice(0,4)),'RIFF');assert.equal(view.getUint32(24,true),24000);assert.equal(view.getUint32(40,true),6);assert.equal(view.getInt16(46,true),0);
});
