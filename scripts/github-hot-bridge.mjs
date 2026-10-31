import { hotVelocity, HOUR_MS, DAY_MS } from '../site-integration/hot-hourly.mjs';
import { writeFile } from 'node:fs/promises';

// Read-only HOT companion. Never calls /api/refresh or the YouTube API.
const SOURCE = 'https://azeroth-radar-petro.gorthax.chatgpt.site/api/feed?view=dashboard';
const PATH = 'docs/hot/latest.json';

const valid = (s,p,now) => s && Number.isFinite(s.capturedAt) &&
  Number.isFinite(s.views) && s.views >= 0 && s.capturedAt >= p && s.capturedAt <= now;

export function calculate(feed, previous = {}, now = Date.now()) {
  const before = Object.fromEntries((previous.videos || []).map(v => [v.id,v]));
  const candidates = Array.isArray(feed.videos) ? feed.videos : [];
  const out = [];
  let within24h = 0;
  for (const v of candidates) {
    if (!v?.id || !Number.isFinite(v.publishedAt) || v.publishedAt > now ||
      now - v.publishedAt >= DAY_MS || v.excluded || v.blocked || v.isVod || v.isLivestream) continue;
    within24h++;
    const samples = new Map();
    for (const s of before[v.id]?.samples || []) {
      if (valid(s,v.publishedAt,now) && now-s.capturedAt < 48*HOUR_MS) samples.set(s.capturedAt,s.views);
    }
    for (const s of [
      {capturedAt:v.hotPriorAt,views:v.hotPriorViews},
      {capturedAt:v.hotMeasuredAt || v.lastSeen,views:Number.isFinite(v.hotLatestViews)?v.hotLatestViews:v.views}
    ]) if (valid(s,v.publishedAt,now)) samples.set(s.capturedAt,s.views);
    const sequence = [...samples].map(([capturedAt,views])=>({capturedAt,views}))
      .sort((a,b)=>a.capturedAt-b.capturedAt).slice(-32);
    const h = hotVelocity({publishedAt:v.publishedAt,samples:sequence,now});
    if (!h.eligible) continue;
    const short = Number.isFinite(v.width)&&Number.isFinite(v.height)&&v.height>v.width;
    out.push({
      id:v.id,title:v.title||'Untitled',channel:v.channelTitle||v.channel||'',
      publishedAt:v.publishedAt,views:h.latestViews,
      url:'https://www.youtube.com/watch?v='+encodeURIComponent(v.id),
      thumbnail:'https://i.ytimg.com/vi/'+encodeURIComponent(v.id)+'/mqdefault.jpg',
      isShort:short,velocityType:h.kind,vph:h.vph,estimate:h.kind==='estimated-since-upload',
      intervalMinutes:h.intervalMinutes,latestObservedAt:h.measuredAt,samples:sequence
    });
  }
  out.sort((a,b)=>b.vph-a.vph || b.views-a.views || b.publishedAt-a.publishedAt);
  return {schemaVersion:1,generatedAt:now,sourceLastScan:feed.lastScan||null,sourceFeed:SOURCE,
    disclaimer:'Github re-ranks source snapshots; no new YouTube view counts are collected here.',
    counts:{tracked:candidates.length,within24h,eligible:out.length,
      estimated:out.filter(v=>v.estimate).length,measured:out.filter(v=>!v.estimate).length,
      shorts:out.filter(v=>v.isShort).length,longForm:out.filter(v=>!v.isShort).length},
    rankings:{hot:out.filter(v=>!v.isShort).map(v=>v.id),shortsHot:out.filter(v=>v.isShort).map(v=>v.id)},
    videos:out};
}

const date = x => x ? new Date(x).toISOString().replace('T',' ').slice(0,16)+' UTC' : 'unknown';
export function summary(data) {
  const row = (v,i) => '| '+(i+1)+' | ['+String(v.title).replaceAll('|','/').replaceAll('\n',' ')+']('+v.url+') | '+
    v.views.toLocaleString()+' | '+v.vph.toLocaleString()+' | '+
    (v.estimate?'Estimated since upload':'Measured '+v.intervalMinutes+'m')+' | '+date(v.latestObservedAt)+' |';
  const listing = list => '| # | Video | Views | Views/hour | Method | Observed |'+'\n'+
    '|---|---|---:|---:|---|---|'+'\n'+list.slice(0,20).map(row).join('\n')+'\n';
  return '# Azeroth Radar — GitHub HOT companion\n\n'+
    '> Separate from the original ChatGPT Site. Does not override its UI or YouTube scanner.\n\n'+
    'Generated: '+date(data.generatedAt)+'; Latest source scan: '+date(data.sourceLastScan)+'\n\n'+
    '**HOT eligible: '+data.counts.eligible+' ('+data.counts.estimated+' estimated, '+data.counts.measured+' measured).**\n\n'+
    '**No new YouTube measurements are created by this workflow.**\n\n'+
    '## Long-form HOT\n\n'+listing(data.videos.filter(v=>!v.isShort))+
    '\n## Shorts HOT\n\n'+listing(data.videos.filter(v=>v.isShort));
}

async function github(token,repo,method,sha,data) {
  const url='https://api.github.com/repos/'+repo+'/contents/'+PATH;
  const opts={method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json',
    'X-GitHub-Api-Version':'2022-11-28'}};
  if(method==='PUT') {
    opts.headers['Content-Type']='application/json';
    opts.body=JSON.stringify({message:'Refresh GitHub HOT companion [skip ci]',
      content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64'),...(sha?{sha}:{})});
  }
  const r=await fetch(url,opts);
  if (r.status===404 && method==='GET') return {sha:null,data:{}};
  if (!r.ok) throw Error('GitHub API '+method+' HTTP '+r.status+' '+(await r.text()).slice(0,200));
  if (method==='PUT') return;
  const j=await r.json();
  return {sha:j.sha,data:JSON.parse(Buffer.from(String(j.content).replace(/\s/g,''),'base64').toString())};
}

async function main() {
  const token=process.env.GH_BRIDGE_TOKEN, repo=process.env.GITHUB_REPOSITORY, now=Date.now();
  const r=await fetch(SOURCE,{headers: {'User-Agent':'AzerothRadar-GitHubCompanion/1.0',
    Accept:'application/json'},signal:AbortSignal.timeout(45000)});
  if(!r.ok) throw Error('Original Site public feed HTTP '+r.status);
  const feed=await r.json();
  if(!Array.isArray(feed.videos)) throw Error('Original Site public feed missing videos');
  const previous=(token&&repo)?await github(token,repo,'GET'): {sha:null,data:{}};
  const data=calculate(feed,previous.data,now);
  console.log(JSON.stringify({outcome:'ranked-public-feed',counts:data.counts,
    lastScan:data.sourceLastScan}));
  if(process.env.GITHUB_STEP_SUMMARY)
    await writeFile(process.env.GITHUB_STEP_SUMMARY,summary(data),{flag:'a'});
  if(token&&repo) await github(token,repo,'PUT',previous.sha,data);
  else await writeFile('hot-companion-local.json',JSON.stringify(data,null,2)+'\n');
}
if (process.argv[1] && import.meta.url.endsWith('/'+process.argv[1].split('/').pop()))
  main().catch(e=>{console.error('HOT companion failed:',e.message);process.exitCode=1;});
