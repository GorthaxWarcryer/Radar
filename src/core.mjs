const HOUR = 3600000;
const DAY = 24 * HOUR;
export { HOUR, DAY };
export const minViews = 5000;
export const TTL = 48 * HOUR;

export function withinHours(timestamp, hours, now = Date.now()) {
  const date = Number(timestamp);
  return Number.isFinite(date) && date > 0 && date <= now + 5 * 60 * 1000 && now - date < hours * HOUR;
}
export function isLikelyRussian(text = '') {
  return /[а-яё]/i.test(text) && !/[іїєґ]/i.test(text); // Conservative flag; language detection can be improved.
}
export function isExcludedRedditPost(p) {
  const title = String(p.title || '').toLowerCase();
  const flair = String(p.link_flair_text || p.flair || '').toLowerCase();
  return p.removed || p.over_18 || isLikelyRussian(title) || /\b(meme|shitpost|weekly questions|simple question)\b/i.test(flair) || /\b(what should i play|is it worth playing)\b/i.test(title);
}
export function parseDuration(value = '') {
  const m = String(value).match(/^P(?:([0-9]+)D)?T?(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)S)?$/);
  return m ? Number(m[1] || 0) * 86400 + Number(m[2] || 0) * 3600 + Number(m[3] || 0) * 60 + Number(m[4] || 0) : 0;
}
export function normalizeYouTubeVideo(v, now = Date.now()) {
  const t = Number(new Date(v.snippet?.publishedAt || 0));
  const durationSec = parseDuration(v.contentDetails?.duration || '');
  const vod = Boolean(v.liveStreamingDetails) || v.snippet?.liveBroadcastContent === 'live' || v.snippet?.liveBroadcastContent === 'upcoming';
  return {
    id: String(v.id), title: String(v.snippet?.title || 'Untitled'),
    description: String(v.snippet?.description || '').slice(0, 3000),
    thumbnail: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || '',
    channelName: String(v.snippet?.channelTitle || ''), channelId: String(v.snippet?.channelId || ''),
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(String(v.id))}`,
    publishedAt: Number.isFinite(t) ? t : 0,
    views: Math.max(0, Number(v.statistics?.viewCount || 0)),
    likes: Math.max(0, Number(v.statistics?.likeCount || 0)),
    comments: Math.max(0, Number(v.statistics?.commentCount || 0)),
    durationSec, kind: durationSec > 0 && durationSec <= 180 ? 'shorts' : 'long',
    isVod: vod, observedAt: now
  };
}
export function computeGrowth(samples, now = Date.now(), field = 'views') {
  const recent = samples.filter(s => Number(s.at) >= now - TTL && Number.isFinite(Number(s[field])))
    .sort((a, b) => a.at - b.at);
  if (recent.length < 2 || recent.at(-1).at <= recent[0].at) return null;
  const hours = (recent.at(-1).at - recent[0].at) / HOUR;
  return {
    perHour: Math.max(0, Math.round((Number(recent.at(-1)[field]) - Number(recent[0][field])) / hours)),
    gained: Math.max(0, Number(recent.at(-1)[field]) - Number(recent[0][field])),
    sampleHours: Math.round(hours * 10) / 10,
    firstAt: recent[0].at, lastAt: recent.at(-1).at
  };
}
export function eligibleVideo(v, now = Date.now()) {
  return !v.isVod && Number(v.views) >= minViews && withinHours(v.publishedAt, 48, now);
}
export function popular(videos, kind, now = Date.now()) {
  return videos.filter(v => eligibleVideo(v, now) && v.kind === kind).sort((a, b) => Number(b.views) - Number(a.views));
}
export function hot(videos, kind, now = Date.now()) {
  return videos.filter(v => eligibleVideo(v, now) && v.kind === kind && v.growth && Number.isFinite(v.growth.perHour))
    .sort((a, b) => b.growth.perHour - a.growth.perHour);
}
export function classifyStory(p, now = Date.now()) {
  return withinHours(p.publishedAt, 48, now) && !isExcludedRedditPost(p);
}
export function normalizeRedditPost(p, subreddit, sort, observedAt = Date.now()) {
  if (!p.id || !p.created_utc || !p.permalink) return null;
  const title = String(p.title || '').trim();
  const publishedAt = Math.round(Number(p.created_utc) * 1000);
  const post = { id: `reddit:${p.id}`, title, summary: String(p.selftext || '').slice(0, 600),
    subreddit, source: 'Reddit', sort, url: `https://www.reddit.com${p.permalink}`,
    score: Number.isFinite(Number(p.score)) ? Number(p.score) : null,
    comments: Number.isFinite(Number(p.num_comments)) ? Number(p.num_comments) : null,
    publishedAt, observedAt,
    listingUrl: `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/${sort === 'top' ? 'top/?t=day' : 'hot/'}`,
    flair: p.link_flair_text || '' };
  return classifyStory(post, observedAt) ? post : null;
}


const TOPIC_RULES = [
  ['triple-spec', /\b(triple[\s-]?spec|third spec)\b/i, 'Triple specialization', 'Systems'],
  ['paladin', /\bpaladin(s)?\b/i, 'Paladin changes', 'Classes'],
  ['warrior', /\bwarrior(s)?\b/i, 'Warrior changes', 'Classes'],
  ['shaman', /\bshaman(s)?\b/i, 'Shaman changes', 'Classes'],
  ['mage', /\bmage(s)?\b/i, 'Mage changes', 'Classes'],
  ['priest', /\bpriest(s)?\b/i, 'Priest changes', 'Classes'],
  ['hunter', /\bhunter(s)?\b/i, 'Hunter changes', 'Classes'],
  ['druid', /\bdruid(s)?\b/i, 'Druid changes', 'Classes'],
  ['rogue', /\brogue(s)?\b/i, 'Rogue changes', 'Classes'],
  ['warlock', /\bwarlock(s)?\b/i, 'Warlock changes', 'Classes'],
  ['racial', /\b(racials?|race\s+changes|blood fury|berserking|touch of the grave)\b/i, 'Racial balance', 'Balance'],
  ['raid', /\b(raids?|tier progression|raid release|raid schedule)\b/i, 'Raid progression', 'PvE'],
  ['pvp', /\b(pvp|arenas?|battlegrounds?|duels?|tournaments?)\b/i, 'PvP', 'PvP'],
  ['addon', /\b(addons?|weak\s?auras?|modding)\b/i, 'Addons', 'Systems'],
  ['launch', /\b(launch|release date|launch day|server opening)\b/i, 'Launch', 'News'],
  ['profession', /\b(professions?|engineering|blacksmithing|alchemy|herbalism)\b/i, 'Professions', 'Economy'],
  ['economy', /\b(gold making|auction house|economy|farming gold)\b/i, 'Economy', 'Economy'],
  ['mount', /\b(mounts?|cash shop|store mount|microtransactions?)\b/i, 'Mounts and monetization', 'Community'],
  ['nostalgia', /\b(nostalgia|nostalgic)\b/i, 'Warcraft nostalgia', 'Community'],
  ['talent', /\b(talents?|spec builds?|talent trees?)\b/i, 'Talents and builds', 'Classes']
];
const TOPIC_STOP = new Set('world warcraft forever classic blizzard wow new latest just huge big this that have does about and the with from into what how why where first look reacts reaction video trailer update changes change leaked datamined patch official news game gaming watch before after really more every player players we got getting means things'.split(' '));
const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
const cappedLog = (value,base,cap) => Math.round(clamp(Math.log1p(Math.max(0,value))/Math.log1p(base),0,1)*cap);
function sourceWorld(title='') {
  return /\bforever\b/i.test(title) ? 'forever' :
    /\b(classic|vanilla|era)\b/i.test(title) ? 'classic' :
    /\b(retail|midnight|the war within)\b/i.test(title) ? 'retail' : 'wow';
}
function topicWords(title) {
  return [...new Set(String(title).toLowerCase().replace(/[^a-z0-9 ]/g,' ')
    .split(/\s+/).filter(w=>w.length>=4&&!TOPIC_STOP.has(w)))];
}
function classifyOpportunity(title) {
  const world=sourceWorld(title);
  // Distinguish named class specs without splitting generic class headlines.
  // We only infer the spec when it is explicitly present in the headline.
  const specificSpec=/\b(holy|retribution|ret|protection|prot|elemental|enhancement|restoration|fire|frost|arcane|arms|fury|discipline|shadow|balance|feral|guardian|assassination|subtlety|destruction|affliction|demonology)\b/i.exec(title);
  const specific=TOPIC_RULES.find(([,re])=>re.test(title));
  if(specific) {
    const [key,,subject,category]=specific;
    if(specificSpec&&['paladin','warrior','shaman','mage','priest','druid','rogue','warlock','hunter'].includes(key)) {
      const spec=specificSpec[1].toLowerCase(),normalized=spec==='ret'?'Retribution':spec==='prot'?'Protection':spec[0].toUpperCase()+spec.slice(1);
      return {key:world+':'+key+':'+normalized.toLowerCase(),subject:normalized+' '+subject,category,world};
    }
    return {key:world+':'+key,subject,category,world};
  }
  const words=topicWords(title);
  const distinct=words.slice(0,4).sort().join('-')||'uncategorized';
  const subject=String(title).replace(/\s*\|.*$/,'').replace(/[!?]+$/,'').trim().slice(0,95);
  return {key:world+':'+distinct,subject,category:'Discussion',world};
}
function safeSource(s) {
  const sourceType=s.sourceType;
  return {id:String(s.id),title:String(s.title||''),url:String(s.url||''),
    sourceType,description:String(s.description||s.summary||'').slice(0,600),
    channelName:String(s.channelName||s.subreddit||''),
    publishedAt:Number(s.publishedAt)||0,
    views:sourceType==='YouTube'?Number(s.views)||0:null,
    growthPerHour:sourceType==='YouTube'&&Number.isFinite(s.growth?.perHour)?s.growth.perHour:null,
    growthKind:sourceType==='YouTube'?s.growth?.kind||null:null,
    score:sourceType==='Reddit'&&Number.isFinite(s.score)?s.score:null,
    comments:sourceType==='Reddit'&&Number.isFinite(s.comments)?s.comments:null,
    official:!!(s.officialSource||sourceType==='Official'||sourceType==='Blizzard')};
}
function creativeAngles(group) {
  const subject=group.subject, world=group.world==='forever'?'WoW Forever':'World of Warcraft';
  const name=subject==='PvP'?'PvP':subject;
  if(group.category==='Classes'||group.category==='Balance') return [
    {type:'Impact analysis',title:'How Much Could '+name+' Affect '+world+'?',approach:'Identify actual changes, then compare the consequences for relevant specs.'},
    {type:'Gameplay test',title:'Testing '+name+': What Actually Changes?',approach:'Create a reproducible in-game comparison after verifying the source claims.'},
    {type:'Debate',title:'Are These '+name+' Really a Good Idea?',approach:'Contrast the intended goals, trade-offs and player reactions without assuming consensus.'}
  ];
  if(group.category==='PvP') return [
    {type:'Gameplay test',title:'What Actually Wins in '+world+' '+name+'?',approach:'Test the cited PvP claim with observable matches or controlled duels.'},
    {type:'Analysis',title:'The Biggest Question About '+world+' '+name,approach:'Separate measured strengths from anecdotal wins.'},
    {type:'Counterpoint',title:'Is Everyone Overlooking This '+name+' Trade-Off?',approach:'Evaluate risks and counterarguments from the original discussion.'}
  ];
  if(group.category==='PvE'||group.category==='Systems') return [
    {type:'Analysis',title:'Could '+name+' Change How We Play '+world+'?',approach:'Explain the conditions and who benefits if the reported details hold up.'},
    {type:'Comparison',title:name+': The Upsides and the Trade-Offs',approach:'Compare current and proposed behavior using direct source evidence.'},
    {type:'Player guide',title:'What Should Players Do About '+name+'?',approach:'Give conditional, verifiable next steps instead of speculation presented as fact.'}
  ];
  if(group.category==='News') return [
    {type:'News breakdown',title:'What We Actually Know About '+world+' '+name,approach:'Build a short, source-linked timeline of verified announcements.'},
    {type:'Analysis',title:'The Biggest Open Questions Around '+name,approach:'Separate announcements from unresolved details.'},
    {type:'Checklist',title:'What to Check Before '+world+' '+name,approach:'Practical preparation checklist, clearly labelled as conditional.'}
  ];
  return [
    {type:'Reaction',title:'Why Is Everyone Talking About '+name+'?',approach:'Trace the original claim and the verified evidence for its spread.'},
    {type:'Analysis',title:'The Question Behind '+name,approach:'Explore the disagreement or player choice beyond the viral headline.'},
    {type:'Counterpoint',title:'What Might Be Missing From the '+name+' Discussion?',approach:'Offer a fair, evidence-linked alternative interpretation.'}
  ];
}
function opportunityScore(sources,now) {
  const yt=sources.filter(s=>s.sourceType==='YouTube');
  const newest=Math.max(...sources.map(s=>s.publishedAt));
  const ageHours=Math.max(0,(now-newest)/HOUR);
  const channels=new Set(sources.map(s=>s.channelName||s.id)).size;
  const peakViews=Math.max(0,...yt.map(s=>s.views||0));
  const peakVelocity=Math.max(0,...yt.map(s=>s.growthPerHour||0));
  const discussion=sources.filter(s=>s.sourceType==='Reddit');
  const discussionPoints=discussion.length?clamp(Math.round(Math.max(...discussion.map(s=>s.comments||0))/25),0,9):0;
  const parts={
    freshness:Math.round(clamp((48-ageHours)/48,0,1)*18),
    reach:cappedLog(peakViews,100000,16),
    velocity:peakVelocity>0?cappedLog(peakVelocity,3000,24):0,
    independentCoverage:clamp((channels-1)*7,0,21),
    official:sources.some(s=>s.official)?12:0,
    discussion:discussionPoints
  };
  const score=clamp(Object.values(parts).reduce((a,b)=>a+b,0),0,100);
  return {score,parts,channels,peakViews,peakVelocity,ageHours:Math.round(ageHours*10)/10};
}
export function makeContentIdeas({videos=[],stories=[]}, now=Date.now()) {
  const eligible=videos.filter(v=>eligibleVideo(v,now));
  const combined=[
    ...eligible.map(v=>safeSource({...v,sourceType:'YouTube'})),
    ...stories.filter(s=>withinHours(s.publishedAt,48,now))
      .map(s=>safeSource({...s,sourceType:s.source||s.sourceType||'Official'}))
  ].filter(s=>s.title&&s.url);
  const grouped=new Map();
  for(const s of combined) {
    const topic=classifyOpportunity(s.title);
    if(!grouped.has(topic.key))grouped.set(topic.key,{...topic,sources:[]});
    const g=grouped.get(topic.key);
    if(!g.sources.some(x=>x.id===s.id))g.sources.push(s);
  }
  const ideas=[...grouped.values()].map(g=>{
    g.sources.sort((a,b)=>(b.growthPerHour||0)-(a.growthPerHour||0)||
      (b.views||0)-(a.views||0)||b.publishedAt-a.publishedAt);
    const evidence=opportunityScore(g.sources,now);
    const source=g.sources[0],angles=creativeAngles(g);
    const signal=[
      evidence.peakVelocity>0?evidence.peakVelocity.toLocaleString('en-US')+' views/hour (source-reported measurement or estimate)':
        evidence.peakViews?evidence.peakViews.toLocaleString('en-US')+' video views':null,
      g.sources.length>1?g.sources.length+' linked sources':null,
      g.sources.some(s=>s.official)?'official source present':null
    ].filter(Boolean).join(' · ');
    const plural=g.sources.length===1?'one source':g.sources.length+' sources';
    return {
      id:'opportunity:'+g.key,title:g.subject,subject:g.subject,category:g.category,world:g.world,
      format:angles[0].type,priority:evidence.score>=65?'High':evidence.score>=40?'Rising':'Watch',
      opportunityScore:evidence.score,scoreBreakdown:evidence.parts,
      summary:signal||'Recent original source; additional evidence needed.',
      proposedTitle:angles[0].title,angles,angle:angles[0].approach,
      sourceUrl:source.url,sourceTitle:source.title,sourceType:source.sourceType,
      publishedAt:Math.max(...g.sources.map(s=>s.publishedAt)),
      evidence:g.sources.map(s=>s.id),sources:g.sources.slice(0,8),
      sourceCount:g.sources.length,independentChannels:evidence.channels,
      whyNow:'Recent '+g.category.toLowerCase()+' coverage: '+signal+'. Popularity is not verification.',
      viewerPayoff:'A specific player question or test grounded in the linked sources.',
      outline:['State the exact question and source claim','Verify dates and original reporting',
        angles[0].approach,'Show opposing evidence or limitations','Give a clear conditional viewer takeaway'],
      recordingPlan:['Review each linked original source','Verify claims before recording',
        'Gather in-game footage or direct screenshots where possible','Cite sources and label uncertainty'],
      coverage:{verifiedSources:g.sources.length,sourceLinks:g.sources.map(s=>s.url),
        note:'Source links are collected, not independently fact-checked. '+plural+' available.'}
    };
  }).sort((a,b)=>b.opportunityScore-a.opportunityScore||b.publishedAt-a.publishedAt);
  return ideas.slice(0,12);
}
