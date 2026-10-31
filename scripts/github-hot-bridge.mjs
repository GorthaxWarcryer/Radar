import { hotVelocity, HOUR_MS, DAY_MS } from '../site-integration/hot-hourly.mjs';
import { writeFile } from 'node:fs/promises';

// Independent GitHub HOT companion. The native ChatGPT Site remains read-only.
const SOURCE = 'https://azeroth-radar-petro.gorthax.chatgpt.site/api/feed?view=dashboard';
const PATH = 'docs/hot/latest.json';
const MAX_VIDEOS = 500;
const PER_REQUEST = 50;
const HISTORY_LIMIT = 24;
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const valid = (s,p,now) => s && Number.isFinite(s.capturedAt) &&
  Number.isSafeInteger(s.views) && s.views >= 0 && s.capturedAt >= p && s.capturedAt <= now;

export function selectCandidates(feed, now = Date.now(), maxVideos = MAX_VIDEOS) {
  if (!Number.isInteger(maxVideos) || maxVideos < 1 || maxVideos > MAX_VIDEOS)
    throw Error('Invalid HOT candidate cap (1-500)');
  return (Array.isArray(feed?.videos) ? feed.videos : [])
    .filter(v => v && VIDEO_ID.test(v.id || '') && Number.isFinite(v.publishedAt) &&
      v.publishedAt <= now && now - v.publishedAt < DAY_MS &&
      !v.excluded && !v.blocked && !v.isVod && !v.isLivestream)
    .sort((a,b) => {
      const aOver = (a.views||0)>=5000, bOver=(b.views||0)>=5000;
      return Number(bOver)-Number(aOver) || b.publishedAt-a.publishedAt;
    })
    .slice(0,maxVideos);
}

/** 1 quota unit per batch (up to 50 video IDs) with statistics only.
 * Never log the API URL, API key, or raw credential-dependent error body.
 */
export async function pollYoutubeViews(videos,apiKey,{
  fetcher=fetch, clock=Date.now, maxVideos=MAX_VIDEOS
}={}) {
  if (!apiKey || !apiKey.trim()) return {status:'missing-key',observations:[],requests:0};
  const ids=[...new Set(videos.map(v=>v.id).filter(x=>VIDEO_ID.test(x)))].slice(0,maxVideos);
  const observations=[];
  let requests=0;
  for (let start=0;start<ids.length;start+=PER_REQUEST) {
    const batch=ids.slice(start,start+PER_REQUEST);
    const url=new URL('https://www.googleapis.com/youtube/v3/videos');
    url.searchParams.set('part','statistics');
    url.searchParams.set('id',batch.join(','));
    url.searchParams.set('key',apiKey);
    let response;
    try {
      response=await fetcher(url.toString(), {
        headers:{'Accept':'application/json','User-Agent':'AzerothRadar-GitHubHOT/1.0'},
        signal:AbortSignal.timeout(25000)
      });
    } catch {
      throw Error('YouTube Data API network error (no credentials logged)');
    }
    requests++;
    if (!response.ok)
      throw Error('YouTube Data API HTTP '+response.status+
        ' (check YOUTUBE_API_KEY, enabled API, restrictions and available quota)');
    let json;
    try { json=await response.json(); }
    catch { throw Error('YouTube Data API returned invalid JSON'); }
    if (!Array.isArray(json.items)) throw Error('YouTube Data API returned unexpected data');
    const capturedAt=clock();
    for (const item of json.items) {
      const count=item?.statistics?.viewCount;
      if (!VIDEO_ID.test(item?.id||'') || !batch.includes(item.id) ||
        typeof count!=='string' || !/^\d+$/.test(count)) continue;
      const views=Number(count);
      if (Number.isSafeInteger(views))
        observations.push({id:item.id,capturedAt,views,source:'youtube-data-api'});
    }
  }
  return {status:ids.length?'connected':'no-eligible-ids', observations, requests,
    attempted:ids.length, observedAt:clock()};
}

export function calculate(feed,previous={},now=Date.now(),apiRead={status:'missing-key',observations:[],requests:0}) {
  const before=Object.fromEntries((previous.videos||[]).filter(v=>v?.id).map(v=>[v.id,v]));
  const candidates=selectCandidates(feed,now);
  const raw=Array.isArray(feed.videos)?feed.videos:[];
  const apiById=new Map();
  for (const s of apiRead.observations||[]) {
    if (!apiById.has(s.id)) apiById.set(s.id,[]);
    apiById.get(s.id).push(s);
  }
  const watchSamples={};
  const out=[];
  for (const v of candidates) {
    const samples=new Map();
    const inherited=previous.watchSamples?.[v.id]||before[v.id]?.samples||[];
    for (const s of inherited) {
      if (valid(s,v.publishedAt,now) && now-s.capturedAt<48*HOUR_MS)
        samples.set(s.capturedAt,s);
    }
    const site=[
      {capturedAt:v.hotPriorAt,views:v.hotPriorViews,source:'original-site'},
      {capturedAt:v.hotMeasuredAt||v.lastSeen,
        views:Number.isFinite(v.hotLatestViews)?v.hotLatestViews:v.views,source:'original-site'}
    ];
    for(const s of site) if(valid(s,v.publishedAt,now)) samples.set(s.capturedAt,s);
    for(const s of apiById.get(v.id)||[])
      if(valid(s,v.publishedAt,now)) samples.set(s.capturedAt,s);
    const sequence=[...samples.values()]
      .sort((a,b)=>a.capturedAt-b.capturedAt).slice(-HISTORY_LIMIT);
    if (sequence.length) watchSamples[v.id]=sequence;
    const h=hotVelocity({publishedAt:v.publishedAt,samples:sequence,now});
    if (!h.eligible) continue;
    const short=Number.isFinite(v.width)&&Number.isFinite(v.height)&&v.height>v.width;
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
  const status=apiRead.status||'missing-key';
  return {schemaVersion:2,generatedAt:now,sourceLastScan:feed.lastScan||null,sourceFeed:SOURCE,
    youtubeApi:{status,requests:apiRead.requests||0,observations:(apiRead.observations||[]).length,
      attempted:apiRead.attempted||0,lastCheckedAt:apiRead.observedAt||null},
    disclaimer:status==='connected'
      ? 'GitHub polls YouTube Data API directly for hourly view counts of videos already discovered by the original Site. Discovery remains on the Site schedule.'
      : 'YouTube Data API is not connected; GitHub only re-ranks the original Site view snapshots.',
    counts:{tracked:raw.length,within24h:raw.filter(v=>Number.isFinite(v?.publishedAt)&&
      v.publishedAt<=now&&now-v.publishedAt<DAY_MS).length,
      eligible:out.length,estimated:out.filter(v=>v.estimate).length,
      measured:out.filter(v=>!v.estimate).length,
      shorts:out.filter(v=>v.isShort).length,longForm:out.filter(v=>!v.isShort).length},
    rankings:{hot:out.filter(v=>!v.isShort).map(v=>v.id),
      shortsHot:out.filter(v=>v.isShort).map(v=>v.id)},
    watchSamples,videos:out};
}

const date=x=>x?new Date(x).toISOString().replace('T',' ').slice(0,16)+' UTC':'unknown';
export function summary(data) {
  const row=(v,i)=>'| '+(i+1)+' | ['+String(v.title).replaceAll('|','/').replaceAll('\n',' ')+']('+v.url+') | '+
    v.views.toLocaleString()+' | '+v.vph.toLocaleString()+' | '+
    (v.estimate?'Estimated since upload':'Measured '+v.intervalMinutes+'m')+' | '+date(v.latestObservedAt)+' |';
  const listing=list=>'| # | Video | Views | Views/hour | Method | Observed |'+'\n'+
    '|---|---|---:|---:|---|---|'+'\n'+list.slice(0,20).map(row).join('\n')+'\n';
  const api=data.youtubeApi||{};
  return '# Azeroth Radar — GitHub HOT companion\n\n'+
    '> Separate from the original ChatGPT Site. Does not override its UI or YouTube scanner.\n\n'+
    'Generated: '+date(data.generatedAt)+'; Latest source discovery scan: '+
    date(data.sourceLastScan)+'\n\n'+
    '**YouTube Data API status: '+(api.status||'unknown')+
    '** — '+(api.observations||0)+' real API observations, '+(api.requests||0)+
    ' requests this run.\n\n'+
    '**HOT eligible: '+data.counts.eligible+' ('+data.counts.estimated+
    ' estimated, '+data.counts.measured+' measured).**\n\n'+
    (api.status==='connected'
      ? 'The GitHub workflow now collects genuine view-count snapshots; new video discovery still comes from the original Site.\n\n'
      : '**No new YouTube view-count measurements were collected.** Configure the YOUTUBE_API_KEY repository secret for real hourly polling.\n\n')+
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
  if(r.status===404 && method==='GET') return {sha:null,data:{}};
  if(!r.ok) throw Error('GitHub Contents API '+method+' HTTP '+r.status);
  if(method==='PUT') return;
  const j=await r.json();
  return {sha:j.sha,data:JSON.parse(Buffer.from(String(j.content).replace(/\s/g,''),'base64').toString())};
}

async function main() {
  const token=process.env.GH_BRIDGE_TOKEN,repo=process.env.GITHUB_REPOSITORY;
  const apiKey=process.env.YOUTUBE_API_KEY||'';
  const r=await fetch(SOURCE,{headers:{'User-Agent':'AzerothRadar-GitHubCompanion/2.0',
    Accept:'application/json'},signal:AbortSignal.timeout(45000)});
  if(!r.ok) throw Error('Original Site public feed HTTP '+r.status);
  const feed=await r.json();
  if(!Array.isArray(feed.videos)) throw Error('Original Site public feed missing videos');
  const previous=(token&&repo)?await github(token,repo,'GET'):{sha:null,data:{}};
  const selected=selectCandidates(feed,Date.now());
  const apiRead=await pollYoutubeViews(selected,apiKey);
  const data=calculate(feed,previous.data,Date.now(),apiRead);
  console.log(JSON.stringify({outcome:'ranked-public-feed',youtubeApi:data.youtubeApi,
    counts:data.counts,lastScan:data.sourceLastScan}));
  if(apiRead.status==='missing-key') console.log(
    '::warning::YOUTUBE_API_KEY GitHub Actions secret not configured; no new YouTube view counts collected.');
  // Publish only after every API batch succeeds; do not claim success after partial failure.
  if(token&&repo) await github(token,repo,'PUT',previous.sha,data);
  else await writeFile('hot-companion-local.json',JSON.stringify(data,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)
    await writeFile(process.env.GITHUB_STEP_SUMMARY,summary(data),{flag:'a'});
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].split('/').pop()))
  main().catch(e=>{console.error('HOT companion failed:',e.message);process.exitCode=1;});
