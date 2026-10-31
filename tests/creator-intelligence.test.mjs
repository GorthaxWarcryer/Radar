import test from 'node:test';
import assert from 'node:assert/strict';
import {earlySignals,trendHistory,opportunityGaps,editorialDigest,creatorRelevance} from '../src/intelligence.mjs';
import {developDailyDigest,automaticallyGenerateDigest,MAX_AI_PER_DAY,FREE_MODEL} from '../cloudflare/ai-ideas.mjs';
const now=Date.parse('2026-10-31T10:00:00Z'),H=3600000;
const vid=(id,views,age=2)=>({id,title:'WoW Forever Paladin Test '+id,url:'https://www.youtube.com/watch?v='+id,
  channelName:'Creator',kind:'long',publishedAt:now-age*H,views,isVod:false});
const idea={id:'opportunity:forever:paladin',title:'Paladin changes',subject:'Paladin changes',category:'Classes',
  world:'forever',opportunityScore:70,sources:[{id:'x',title:'WoW Forever Paladin Update',sourceType:'YouTube',channelName:'A'}]};
test('early signals remain separate from the 5k+ HOT rule and clearly label estimates',()=>{
 const results=earlySignals([vid('a',600),vid('b',5200),vid('c',400,20),{...vid('d',1000),isVod:true}],now);
 assert.equal(results.length,1);
 assert.equal(results[0].id,'a');
 assert.match(results[0].earlyMethod,/estimated/);
 assert.equal(results[0].earlyVelocity,300);
});
test('explicitly measured early growth is preferred to estimate',()=>{
 const [x]=earlySignals([{...vid('a',2400),growth:{perHour:800,kind:'measured-hourly'}}],now);
 assert.equal(x.earlyVelocity,800);
 assert.equal(x.earlyMethod,'measured');
});
test('trend history derives changes from prior days only',()=>{
 const history=[{topic_id:idea.id,day:'2026-10-30',score:53,updated_at:now-24*H},
  {topic_id:idea.id,day:'2026-10-31',score:60,updated_at:now-H}];
 const x=trendHistory(idea,history,now);
 assert.equal(x.change,17);
 assert.equal(x.movement,'rising');
 assert.equal(x.daysTracked,2);
});
test('coverage gaps remain open research questions, not claims about competitor videos',()=>{
 const g=opportunityGaps(idea);
 assert.match(g.coverageNote,/NOT been inspected/);
 assert.ok(g.questions.some(x=>x.includes('primary source')));
 assert.ok(!JSON.stringify(g).includes('competitors missed'));
});
test('creator preferences affect ranking without changing source opportunity score',()=>{
 const profile={world:'forever',interests:['Paladin']};
 assert.ok(creatorRelevance(idea,profile)>creatorRelevance(idea,{world:'classic',interests:[]}));
 assert.equal(idea.opportunityScore,70);
});
test('rule-based digest preserves original source links and marks limits',()=>{
 const d=editorialDigest({ideas:[{...idea,sourceUrl:'https://worldofwarcraft.blizzard.com/en-us/news'}],
   stories:[{id:'official:1',source:'Official',title:'News',url:'https://worldofwarcraft.blizzard.com/en-us/news'}],
   early:earlySignals([vid('a',600)],now),now});
 assert.equal(d.top.length,1);
 assert.equal(d.official.length,1);
 assert.equal(d.early.length,1);
 assert.match(d.note,/not independent fact verification/);
});
test('daily AI uses the same inexpensive Cloudflare binding and bounded metadata',async()=>{
 let calls=0;
 const env={AI:{async run(model,args){
   calls++;assert.equal(model,FREE_MODEL);
   assert.ok(args.max_tokens<=390);
   return {response:JSON.stringify({headline:'Today in WoW',priorities:[{title:'Verify update',reason:'An official announcement is new'}],
     verifiedLimit:'Check first-party sources'})};
 }}};
 const feed={contentCreation:{items:[idea]},stories:[],emerging:[]};
 const brief=await developDailyDigest(feed,env,now);
 assert.equal(brief.aiGenerated,true);
 assert.equal(brief.priorities.length,1);
 assert.equal(calls,1);
});
test('daily AI brief is cached and shares the six-inference cap',async()=>{
 const records=new Map(),used=new Map();
 let calls=0;
 const db={prepare(sql){let params=[];return{bind(...x){params=x;return this;},
   async all(){if(sql.startsWith('SELECT id FROM ai_briefs'))return {results:records.has(params[0])?[{id:params[0]}]:[]};throw Error(sql);},
   async run(){if(sql.startsWith('INSERT INTO ai_daily_usage')){
     const [day,limit]=params,n=used.get(day)||0;
     if(n>=limit)return {meta:{changes:0}};
     used.set(day,n+1);return {meta:{changes:1}};
   }if(sql.startsWith('INSERT INTO ai_briefs')){records.set(params[0],params[2]);return {meta:{changes:1}};}
   throw Error(sql);}
 }}};
 const env={DB:db,AI:{async run(){calls++;return{response:JSON.stringify({
   headline:'Daily news',priorities:[{title:'Research balance',reason:'Several titles mention balance'}]})};}}};
 const feed={contentCreation:{items:[idea]},stories:[],emerging:[]};
 const result=await automaticallyGenerateDigest(env,feed,now);
 const again=await automaticallyGenerateDigest(env,feed,now+60000);
 assert.equal(result.status,'complete');
 assert.equal(again.status,'cached');
 assert.equal(calls,1);
 assert.equal(used.get('2026-10-31'),1);
 assert.equal(MAX_AI_PER_DAY,6);
});
