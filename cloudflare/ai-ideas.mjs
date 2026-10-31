// Optional, owner-triggered creative development. No automatic model calls.
export function aiEnabled(env) {
  return env.AI_IDEAS_ENABLED==='true'&&typeof env.OPENAI_API_KEY==='string'&&env.OPENAI_API_KEY.length>20;
}
export async function developOpportunity(idea,env,fetcher=fetch) {
  if(!aiEnabled(env))throw new Error('Optional AI is not configured');
  if(!idea||!Array.isArray(idea.sources)||!idea.sources.length)throw new Error('Evidence-linked opportunity required');
  const sourceContext=idea.sources.slice(0,6).map(s=>({
    title:String(s.title||'').slice(0,180),origin:String(s.sourceType||'').slice(0,30),
    channel:String(s.channelName||'').slice(0,70),url:String(s.url||'').slice(0,300)
  }));
  const r=await fetcher('https://api.openai.com/v1/chat/completions',{
    method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+env.OPENAI_API_KEY},
    body:JSON.stringify({model:env.OPENAI_MODEL||'gpt-4.1-mini',temperature:0.7,
      max_completion_tokens:650,response_format:{type:'json_object'},messages:[
        {role:'system',content:'You are a careful video research editor for World of Warcraft creators. Return ONLY one JSON object with keys "titles" (3 short distinct compelling YouTube titles), "thumbnails" (2 short thumbnail text concepts), "angles" (3 objects each with "type" and "approach"), and "verification" (1 sentence). Use only provided titles and links as discovery evidence, not proof of what is inside the articles/videos. Do not invent quotes, patch details, viewer metrics, or community consensus. Use distinct storytelling frames: insight, gameplay test and debate. If an angle needs verification, phrase it conditionally. Avoid the formula "What X Means for WoW Players". No markdown.'},
        {role:'user',content:JSON.stringify({subject:idea.subject,category:idea.category,game:idea.world,
          sourceCoverage:idea.sourceCount,sources:sourceContext})}
      ]})
  });
  if(!r.ok)throw new Error('Creative generation provider unavailable (HTTP '+r.status+')');
  const data=await r.json();
  let parsed;
  try {parsed=JSON.parse(data.choices?.[0]?.message?.content||'{}');}catch{throw new Error('Unexpected creative-generation format');}
  const cleanArray=(items,max=3,maxLen=125)=>Array.isArray(items)?items.slice(0,max)
    .filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim().slice(0,maxLen)):[];
  const titles=cleanArray(parsed.titles,3,130);
  const thumbnails=cleanArray(parsed.thumbnails,2,65);
  const angles=Array.isArray(parsed.angles)?parsed.angles.slice(0,3).filter(x=>x&&typeof x==='object')
    .map(x=>({type:String(x.type||'Angle').slice(0,55),approach:String(x.approach||'').slice(0,260)})):[];
  if(titles.length<2||!angles.length)throw new Error('Creative generation returned incomplete output');
  return {titles,thumbnails,angles,verification:String(parsed.verification||'Verify every factual claim against original sources.').slice(0,240),
    generatedAt:Date.now(),model:env.OPENAI_MODEL||'gpt-4.1-mini',aiGenerated:true};
}
