import test from 'node:test';
import assert from 'node:assert/strict';
import {makeContentIdeas} from '../src/core.mjs';
import {aiEnabled,developOpportunity} from '../cloudflare/ai-ideas.mjs';
const now=Date.parse('2026-10-31T18:00:00Z');
function video(id,title,views=16000,growthPerHour=1300,offset=2) {
  return {id,title,url:'https://www.youtube.com/watch?v='+id,sourceType:'YouTube',
    publishedAt:now-offset*3600000,views,kind:'long',isVod:false,
    channelName:'channel-'+id,growth:{perHour:growthPerHour,kind:'measured-hourly'}};
}
test('related creators collapse into one topic; unrelated classes stay separate',()=>{
  const ideas=makeContentIdeas({videos:[
    video('a','WoW Forever Paladin Changes BREAKDOWN'),
    video('b','New Paladin Nerfs in WoW Forever',25000,2500),
    video('c','WoW Forever Warrior Changes',50000,5000)
  ],stories:[]},now);
  assert.equal(ideas.length,2);
  const paladin=ideas.find(x=>x.subject==='Paladin changes');
  assert.equal(paladin.sourceCount,2);
  assert.equal(paladin.sources.length,2);
  assert.equal(paladin.independentChannels,2);
  assert.equal(paladin.sources[0].views,25000);
  assert.ok(paladin.id.startsWith('opportunity:forever:paladin'));
});
test('distinct angle types, non-generic titles, original-source trail',()=>{
  const [x]=makeContentIdeas({videos:[video('a','World of Warcraft Forever Racial Balance')],stories:[]},now);
  assert.equal(x.angles.length,3);
  assert.equal(new Set(x.angles.map(a=>a.type)).size,3);
  assert.ok(x.angles.every(a=>!a.title.includes('Means for WoW Players')));
  assert.deepEqual(x.coverage.sourceLinks,['https://www.youtube.com/watch?v=a']);
  assert.match(x.coverage.note,/not independently fact-checked/);
});
test('opportunity scores reflect added evidence and real measured velocity',()=>{
  const solo=makeContentIdeas({videos:[video('a','WoW Forever Paladin Changes',6000,0)],stories:[]},now)[0];
  const multi=makeContentIdeas({videos:[
    video('a','WoW Forever Paladin Changes',6000,0),
    video('b','Paladin Nerfs WoW Forever',15000,2000)
  ],stories:[]},now)[0];
  assert.ok(multi.opportunityScore>solo.opportunityScore);
  assert.ok(multi.scoreBreakdown.independentCoverage>0);
  assert.equal(solo.scoreBreakdown.velocity,0);
});
test('excluded old, low-view and VOD videos do not become ideas',()=>{
  const ideas=makeContentIdeas({videos:[
    video('a','WoW Forever Paladin Changes',3000),
    {...video('b','WoW Forever Warrior'),isVod:true},
    video('c','WoW Forever Shaman',12000,200,50)
  ],stories:[]},now);
  assert.equal(ideas.length,0);
});
test('official Story can create a topic but never invent views or votes',()=>{
  const ideas=makeContentIdeas({videos:[],stories:[{
    id:'official:one',title:'WoW Forever Launch Update',source:'Official',
    url:'https://worldofwarcraft.blizzard.com/en-us/news/example',publishedAt:now-3600000
  }]},now);
  assert.equal(ideas.length,1);
  assert.equal(ideas[0].sources[0].views,null);
  assert.equal(ideas[0].sources[0].score,null);
  assert.equal(ideas[0].scoreBreakdown.official,12);
});
test('AI is opt-in only and does not run without explicit configuration',async()=>{
  assert.equal(aiEnabled({}),false);
  assert.equal(aiEnabled({OPENAI_API_KEY:'x'.repeat(50)}),false);
  await assert.rejects(()=>developOpportunity({sources:[{title:'Test'}]},{}),/not configured/);
});
test('AI prompt uses source metadata and validates structured response',async()=>{
  const env={AI_IDEAS_ENABLED:'true',OPENAI_API_KEY:'x'.repeat(50)};
  let calls=0;
  const result=await developOpportunity({
    subject:'Paladin changes',category:'Classes',world:'forever',sourceCount:1,
    sources:[{title:'WoW Forever Paladin Changes',url:'https://youtube.com/watch?v=abc',sourceType:'YouTube'}]
  },env,async (url,opts)=>{
    calls++;
    assert.equal(url,'https://api.openai.com/v1/chat/completions');
    const sent=JSON.parse(opts.body);
    assert.match(sent.messages[0].content,/Do not invent quotes/);
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      titles:['Can Paladin Changes Save This Spec?','Testing the New Paladin Changes','The Paladin Balance Question'],
      thumbnails:['BIG CHANGE','TESTED'],angles:[{type:'Analysis',approach:'Compare changed skills'}],verification:'Verify changes in patch notes.'
    })}}]})};
  });
  assert.equal(calls,1);
  assert.equal(result.titles.length,3);
  assert.equal(result.thumbnails.length,2);
  assert.equal(result.aiGenerated,true);
});
