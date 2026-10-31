// Free-tier Cloudflare Workers AI only. Never uses OpenAI API, AI Gateway,
// Work/Codex credits, subscription credentials or client-side LLM calls.
export const FREE_MODEL='@cf/meta/llama-3.2-3b-instruct';
export const MAX_AI_PER_DAY=6;
export const MAX_AI_PER_SCAN=1;
export const CACHE_HOURS=48;
const HOUR=3600000;
const clean=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
export const autoAIEnabled=env=>Boolean(env?.AI&&typeof env.AI.run==='function'&&env.FREE_AI_DISABLED!=='true');
export function sourceSignature(idea) {
  return (idea.sources||[]).slice(0,8).map(s=>String(s.id)+':'+String(s.publishedAt)).sort().join('|').slice(0,950);
}
export function normalizeBrief(output,idea,generatedAt=Date.now()) {
  const source=typeof output==='string'?output:output?.response||output?.result?.response||'';
  if(typeof source!=='string'||source.length>10000)throw Error('Unsupported Workers AI response');
  const a=source.indexOf('{'),b=source.lastIndexOf('}');
  if(a<0||b<=a)throw Error('Workers AI did not return JSON');
  let obj;try {obj=JSON.parse(source.slice(a,b+1));}catch{throw Error('Workers AI returned malformed JSON');}
  const arr=(xs,n,max)=>Array.isArray(xs)?[...new Set(xs.map(x=>clean(x,max)).filter(Boolean))].slice(0,n):[];
  const titles=arr(obj.titles,3,125),thumbnails=arr(obj.thumbnails,2,48);
  if(titles.length<2||thumbnails.length<1)throw Error('Workers AI returned incomplete creative brief');
  const angles=Array.isArray(obj.angles)?obj.angles.slice(0,3).filter(x=>x&&typeof x==='object')
    .map(x=>({type:clean(x.type,40),approach:clean(x.approach,220)}))
    .filter(x=>x.type&&x.approach):[];
  return {titles,thumbnails,angles,verification:clean(obj.verification,220)||'Verify original sources before making factual claims.',
    model:FREE_MODEL,generatedAt,aiGenerated:true,provider:'Cloudflare Workers AI',automated:true,
    sourceSignature:sourceSignature(idea)};
}
export async function developFreeIdea(idea,env,now=Date.now()) {
  if(!autoAIEnabled(env))throw Error('Cloudflare AI binding unavailable');
  if(!idea||!Array.isArray(idea.sources)||!idea.sources.length)throw Error('Evidence-linked topic required');
  const context={subject:clean(idea.subject||idea.title,90),category:clean(idea.category,30),world:idea.world,
    sources:idea.sources.slice(0,4).map(s=>({title:clean(s.title,150),origin:clean(s.sourceType,22),
      source:s.channelName||'',url:clean(s.url,240)}))};
  const system='You are a creative, evidence-conscious YouTube editor specializing in World of Warcraft. Use only the titles and URLs provided as research leads. Do NOT pretend you read the videos, comments or articles. Do not claim patch specifics or community consensus you cannot verify. Return a compact single JSON object with keys: titles (3 different compelling titles: one analysis, one gameplay test, one debate), thumbnails (2 bold 2-4 word ideas), angles (3 objects with type and approach), verification (one short caveat). Distinct angles, concise, no hype without evidence. Avoid the generic formula What X Means for WoW Players. No markdown, JSON only.';
  const response=await env.AI.run(FREE_MODEL,{
    messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(context)}],
    temperature:0.6,max_tokens:420,stream:false
  });
  return normalizeBrief(response,idea,now);
}
export async function automaticallyGenerate(env,ideas,now=Date.now()) {
  if(!autoAIEnabled(env)||!env.DB)return {status:'disabled',generated:0};
  const day=new Date(now).toISOString().slice(0,10);
  const list=Array.isArray(ideas)?ideas:[];
  // D1 rows are durable across Worker invocations. Original scan and user traffic
  // can never trigger AI without coming through this capped scheduler.
  const previous=await env.DB.prepare(
    'SELECT id,signature,generated_at FROM ai_briefs WHERE generated_at>=? LIMIT 100'
  ).bind(now-CACHE_HOURS*HOUR).all();
  const current=new Map((previous.results||[]).map(x=>[x.id,x]));
  const suppressed=await env.DB.prepare(
    "SELECT s.id FROM saved s INNER JOIN research r ON r.id=s.id WHERE s.kind='opportunity' AND r.status IN ('Published','Dismissed') LIMIT 500"
  ).all();
  const excluded=new Set((suppressed.results||[]).map(x=>x.id));
  let generated=0,skipped=0,failed=0;
  for(const idea of list) {
    if(generated>=MAX_AI_PER_SCAN)break;
    if(!idea?.id?.startsWith('opportunity:')||excluded.has(idea.id))continue;
    const signature=sourceSignature(idea),record=current.get(idea.id);
    if(record&&record.signature===signature&&now-Number(record.generated_at)<CACHE_HOURS*HOUR){skipped++;continue;}
    // Atomic quota reservation prevents parallel cron invocations from escaping
    // the hard application-level daily cap. A failed model call still consumes a slot.
    const ticket=await env.DB.prepare(
      'INSERT INTO ai_daily_usage(day,used) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET used=used+1 WHERE used<?'
    ).bind(day,MAX_AI_PER_DAY).run();
    if(Number(ticket?.meta?.changes||0)===0) return {status:'daily-cap',generated,skipped,failed,limit:MAX_AI_PER_DAY};
    try {
      const brief=await developFreeIdea(idea,env,now);
      await env.DB.prepare(
        'INSERT INTO ai_briefs(id,signature,payload,generated_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET signature=excluded.signature,payload=excluded.payload,generated_at=excluded.generated_at'
      ).bind(idea.id,signature,JSON.stringify(brief),now).run();
      generated++;
    }catch(e) {
      failed++;
      console.error('Free Workers AI generation failed:',String(e?.message||'unknown').slice(0,160));
    }
  }
  return {status:failed?'partial':'complete',generated,skipped,failed,limit:MAX_AI_PER_DAY};
}
