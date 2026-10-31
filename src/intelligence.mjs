// Deterministic creator signals. No LLM calls, YouTube requests, or hidden API costs.
const HOUR=3600000, DAY=24*HOUR;
const safe=(v,max=180)=>String(v||'').replace(/\s+/g,' ').trim().slice(0,max);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function earlySignals(videos=[],now=Date.now()) {
  return videos.filter(v=>v&&!v.isVod&&v.views>=250&&v.views<5000&&
    Number.isFinite(v.publishedAt)&&v.publishedAt<=now&&now-v.publishedAt<12*HOUR)
    .map(v=>{
      const hours=Math.max(0.5,(now-v.publishedAt)/HOUR);
      // Use observed growth when available; otherwise estimate average since upload.
      const measured=Number.isFinite(v.growth?.perHour)&&v.growth?.kind?.startsWith('measured');
      const velocity=measured?v.growth.perHour:Math.round(v.views/hours);
      const score=Math.round(clamp((Math.log1p(velocity)/Math.log1p(1500))*80+
        (12-hours)/12*20,0,100));
      return {...v,earlyVelocity:velocity,earlySignalScore:score,earlyMethod:measured?'measured':'estimated average since upload'};
    }).filter(v=>v.earlyVelocity>=100)
    .sort((a,b)=>b.earlySignalScore-a.earlySignalScore||b.earlyVelocity-a.earlyVelocity)
    .slice(0,16);
}
export function trendHistory(idea,history=[],now=Date.now()) {
  const key=idea.id, rows=history.filter(r=>r.topic_id===key&&now-r.updated_at<=31*DAY)
    .sort((a,b)=>b.updated_at-a.updated_at);
  const day=new Date(now).toISOString().slice(0,10);
  const previous=rows.find(r=>r.day!==day);
  const current=Number(idea.opportunityScore||0),prior=previous?Number(previous.score):null;
  return {daysTracked:new Set(rows.map(r=>r.day)).size,
    priorScore:prior,
    change:prior===null?null:current-prior,
    movement:prior===null?'new':current-prior>=8?'rising':prior-current>=8?'cooling':'steady'};
}
export function opportunityGaps(idea) {
  // No transcripts, so these are research questions, NEVER claims about video contents.
  const sources=Array.isArray(idea.sources)?idea.sources:[];
  const totalChannels=new Set(sources.filter(x=>x.sourceType==='YouTube').map(x=>x.channelName||x.id)).size;
  const official=sources.some(x=>x.official);
  const hasDescriptions=sources.some(x=>typeof x.description==='string'&&x.description.length>30);
  const questions=[];
  if(!official)questions.push('Find an official or primary source before repeating reported changes.');
  if(totalChannels>1)questions.push('Compare competing videos for missing evidence, counterarguments or gameplay demonstrations.');
  if(!hasDescriptions)questions.push('Check video descriptions or original footage before making claims about what competing videos cover.');
  if(idea.category==='Classes'||idea.category==='Balance')questions.push('Check whether a controlled spec or before/after gameplay test adds value.');
  else if(idea.category==='News')questions.push('Verify the original announcement, timeline and unresolved details.');
  else if(idea.category==='PvP')questions.push('Look for actual match evidence, tournament rules and counterplay instead of anecdotal conclusions.');
  else questions.push('Look for a practical test, guide or dissenting perspective absent from the source headlines.');
  return {questions:questions.slice(0,3),
    evidenceLevel:official?'Primary source among headlines':'Source headlines only',
    coverageNote:'Possible gaps inferred from titles and metadata. Full competitor coverage has NOT been inspected.',
    coverageChannels:totalChannels};
}
export function editorialDigest({ideas=[],stories=[],early=[],now=Date.now()}={}) {
  const top=ideas.slice(0,5).map(x=>({id:x.id,title:safe(x.title),score:x.opportunityScore,
    reason:safe(x.summary,240),sourceUrl:x.sourceUrl,trend:x.trend?.movement||'new'}));
  const official=stories.filter(s=>s.source==='Official').slice(0,5).map(s=>({
    id:s.id,title:safe(s.title),summary:safe(s.summary,260),url:s.url,publishedAt:s.publishedAt
  }));
  return {generatedAt:now,kind:'rule-based-digest',top,official,
    early:early.slice(0,4).map(v=>({title:safe(v.title),url:v.url,views:v.views,velocity:v.earlyVelocity,
      method:v.earlyMethod})),
    note:'Research leads from collected sources; titles and summaries are not independent fact verification.'};
}
export function creatorRelevance(idea,profile={}) {
  const interests=Array.isArray(profile.interests)?profile.interests.filter(x=>typeof x==='string').slice(0,15):[];
  const world=String(profile.world||'all').toLowerCase();
  const text=(idea.title+' '+idea.subject+' '+idea.category+' '+(idea.sources||[]).map(x=>x.title).join(' ')).toLowerCase();
  const matching=interests.filter(x=>text.includes(x.toLowerCase()));
  const worldBonus=world==='all'||world==='wow'||idea.world===world?0: -18;
  return clamp(Math.round(Number(idea.opportunityScore||0)+matching.length*11+worldBonus),0,100);
}
