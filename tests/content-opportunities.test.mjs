import test from 'node:test';
import assert from 'node:assert/strict';
import {makeContentIdeas} from '../src/core.mjs';
import {autoAIEnabled,developFreeIdea,automaticallyGenerate,sourceSignature,MAX_AI_PER_DAY,FREE_MODEL} from '../cloudflare/ai-ideas.mjs';
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

const idea={id:'opportunity:forever:paladin',subject:'Paladin changes',category:'Classes',world:'forever',
  sourceCount:1,sources:[{id:'a',publishedAt:now-3600000,title:'WoW Forever Paladin Changes',
  url:'https://youtube.com/watch?v=abc',sourceType:'YouTube',channelName:'Blizzard'}]};
const response={response:JSON.stringify({titles:['Will Paladins Be Stronger?','Testing New Paladin Balance','The Paladin Changes Debate'],
  thumbnails:['NEW BALANCE?','TEST RESULTS'],angles:[{type:'Analysis',approach:'Verify the balance claim'}],
  verification:'Review primary evidence.'})};
test('automatic AI uses Cloudflare binding and rejects OpenAI keys as a provider',async()=>{
  assert.equal(autoAIEnabled({}),false);
  assert.equal(autoAIEnabled({OPENAI_API_KEY:'x'.repeat(80)}),false);
  assert.equal(autoAIEnabled({AI:{run(){}}}),true);
  assert.equal(autoAIEnabled({AI:{run(){}},FREE_AI_DISABLED:'true'}),false);
  await assert.rejects(()=>developFreeIdea(idea,{}),/binding unavailable/);
  let calls=0;
  const env={AI:{async run(model,payload){calls++;
    assert.equal(model,FREE_MODEL);
    assert.ok(payload.max_tokens<=420);
    assert.ok(payload.messages[1].content.includes('Paladin'));
    return response;
  }}};
  const result=await developFreeIdea(idea,env,now);
  assert.equal(result.provider,'Cloudflare Workers AI');
  assert.equal(result.titles.length,3);
  assert.equal(result.thumbnails.length,2);
  assert.equal(result.aiGenerated,true);
  assert.equal(calls,1);
});
function mockDB() {
  const cache=new Map(),usage=new Map(),suppressed=new Set();
  return {cache,usage,suppressed,prepare(sql){
    let params=[];
    return {bind(...args){params=args;return this;},
      async all(){
        if(sql.includes('FROM ai_briefs'))return {results:[...cache.entries()].map(([id,x])=>({id,...x}))};
        if(sql.includes('INNER JOIN research'))return {results:[...suppressed].map(id=>({id}))};
        throw Error('Unexpected SELECT: '+sql);
      },
      async run(){
        if(sql.startsWith('INSERT INTO ai_daily_usage')){
          const [day,limit]=params,used=usage.get(day)||0;
          if(used>=limit)return {meta:{changes:0}};
          usage.set(day,used+1);return {meta:{changes:1}};
        }
        if(sql.startsWith('INSERT INTO ai_briefs')){
          const [id,signature,payload,generated_at]=params;
          cache.set(id,{signature,payload,generated_at});return {meta:{changes:1}};
        }
        throw Error('Unexpected WRITE: '+sql);
      }
    };
  }};
}
test('scheduled AI creates a cached brief and never regenerates unchanged source set',async()=>{
  const db=mockDB();
  let calls=0;
  const env={DB:db,AI:{async run(){calls++;return response;}}};
  const first=await automaticallyGenerate(env,[idea],now);
  const second=await automaticallyGenerate(env,[idea],now+300000);
  assert.equal(first.generated,1);
  assert.equal(second.generated,0);
  assert.equal(calls,1);
  assert.equal(db.cache.get(idea.id).signature,sourceSignature(idea));
});
test('strict six-generation UTC cap, max two per scan, and owner dismissals',async()=>{
  const db=mockDB(),day=new Date(now).toISOString().slice(0,10);
  let calls=0;
  const env={DB:db,AI:{async run(){calls++;return response;}}};
  const many=Array.from({length:11},(_,i)=>({...idea,
    id:'opportunity:forever:paladin-'+i, sources:[{...idea.sources[0],id:'source-'+i}]}));
  const a=await automaticallyGenerate(env,many,now);
  assert.equal(a.generated,2);
  assert.equal(calls,2);
  await automaticallyGenerate(env,many,now+10000);
  const c=await automaticallyGenerate(env,many,now+20000);
  assert.equal(c.generated,2);
  assert.equal(db.usage.get(day),MAX_AI_PER_DAY);
  const done=await automaticallyGenerate(env,many,now+30000);
  assert.equal(done.status,'daily-cap');
  assert.equal(calls,6);
  const db2=mockDB();db2.suppressed.add(many[0].id);
  const env2={DB:db2,AI:{async run(){return response;}}};
  await automaticallyGenerate(env2,[many[0]],now);
  assert.equal(db2.cache.size,0);
});
test('invalid model output does not produce fabricated AI results',async()=>{
  const env={AI:{async run(){return {response:'invalid markdown'}}}};
  await assert.rejects(()=>developFreeIdea(idea,env,now),/not return JSON/);
});
