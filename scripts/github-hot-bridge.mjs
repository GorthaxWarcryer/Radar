import { hotVelocity, HOUR_MS, DAY_MS } from '../site-integration/hot-hourly.mjs';
import { writeFile } from 'node:fs/promises';
import { isOfficialYouTubeChannel } from '../src/official-youtube.mjs';

// Independent GitHub HOT companion. The native ChatGPT Site remains read-only.
const SOURCE = 'https://azeroth-radar-petro.gorthax.chatgpt.site/api/feed?view=dashboard';
const PATH = 'docs/hot/latest.json';
const DISCOVERY_PATH = 'docs/hot/discovered.json';
const MAX_VIDEOS = 500;
const PER_REQUEST = 50;
const HISTORY_LIMIT = 24;
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const valid = (s,p,now) => s && Number.isFinite(s.capturedAt) &&
  Number.isSafeInteger(s.views) && s.views >= 0 && s.capturedAt >= p && s.capturedAt <= now;

/** Merge two separately observed discovery sources, preserving the latest genuine
 * view-count timestamp and aspect information. Either source may be unavailable.
 */
export function combineSources(site={},independent={},now=Date.now()) {
  const map=new Map();
  for(const source of [site,independent])for(const video of source.videos||[]) {
    if(!VIDEO_ID.test(video?.id||'')||!Number.isFinite(video.publishedAt)||
       video.publishedAt>now||now-video.publishedAt>=48*HOUR_MS)continue;
    const earlier=map.get(video.id);
    if(!earlier){map.set(video.id,video);continue;}
    const previousAt=earlier.hotMeasuredAt||earlier.lastSeen||earlier.observedAt||0;
    const currentAt=video.hotMeasuredAt||video.lastSeen||video.observedAt||0;
    const dimensions=Number.isFinite(earlier.width)&&Number.isFinite(earlier.height)?
      {width:earlier.width,height:earlier.height}:Number.isFinite(video.width)&&Number.isFinite(video.height)?
        {width:video.width,height:video.height}:{};
    const channelId=video.channelId||earlier.channelId||null;
    map.set(video.id,currentAt>=previousAt?
      {...earlier,...video,...dimensions,channelId}:
      {...video,...earlier,...dimensions,channelId});
  }
  return {videos:[...map.values()],lastScan:site.lastScan||null,
    independentDiscoveryAt:independent.generatedAt||null,
    originalSiteAvailable:Array.isArray(site.videos)};
}

export function selectCandidates(feed, now = Date.now(), maxVideos = MAX_VIDEOS) {
  if (!Number.isInteger(maxVideos) || maxVideos < 1 || maxVideos > MAX_VIDEOS)
    throw Error('Invalid HOT candidate cap (1-500)');
  return (Array.isArray(feed?.videos) ? feed.videos : [])
    .filter(v => v && typeof v.id==='string' && v.id.length>0 && Number.isFinite(v.publishedAt) &&
      v.publishedAt <= now && now - v.publishedAt < DAY_MS &&
      !v.excluded && !v.blocked && !v.isVod && !v.isLivestream)
    .sort((a,b) => {
      const aOver = (a.views||0)>=5000, bOver=(b.views||0)>=5000;
      return Number(bOver)-Number(aOver) || b.publishedAt-a.publishedAt;
    })
    .slice(0,maxVideos);
}

export function selectPopularCandidates(feed,now=Date.now(),maxVideos=MAX_VIDEOS) {
  if(!Number.isInteger(maxVideos)||maxVideos<1||maxVideos>MAX_VIDEOS)throw Error('Invalid Popular cap');
  return (Array.isArray(feed?.videos)?feed.videos:[])
    .filter(v=>v && VIDEO_ID.test(v.id||'') && Number.isFinite(v.publishedAt) &&
      v.publishedAt<=now && now-v.publishedAt<48*HOUR_MS &&
      !v.excluded&&!v.blocked&&!v.isVod&&!v.isLivestream)
    .sort((a,b)=>(b.views||0)-(a.views||0)||b.publishedAt-a.publishedAt)
    .slice(0,maxVideos);
}

/** 1 quota unit per batch (up to 50 video IDs) with statistics only.
 * Fetch snippet.channelId in the SAME 1-unit video details request as statistics,
 * so Official Source is assigned from YouTube's verified owner ID.
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
    url.searchParams.set('part','statistics,snippet');
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
        observations.push({id:item.id,capturedAt,views,source:'youtube-data-api',
          channelId:String(item.snippet?.channelId||''),
          channelTitle:String(item.snippet?.channelTitle||'')});
    }
  }
  return {status:ids.length?'connected':'no-eligible-ids', observations, requests,
    attempted:ids.length, observedAt:clock()};
}

export function calculate(feed,previous={},now=Date.now(),apiRead={status:'missing-key',observations:[],requests:0}) {
  const before=Object.fromEntries([...(previous.catalog||[]),...(previous.videos||[])].filter(v=>v?.id).map(v=>[v.id,v]));
  const candidates=selectCandidates(feed,now);
  const raw=Array.isArray(feed.videos)?feed.videos:[];
  const apiById=new Map();
  for (const s of apiRead.observations||[]) {
    if (!apiById.has(s.id)) apiById.set(s.id,[]);
    apiById.get(s.id).push(s);
  }
  const watchSamples={};
  const out=[];
  const catalog=[];
  const catalogCandidates=selectPopularCandidates(feed,now);
  for(const v of catalogCandidates){
    const observations=(apiById.get(v.id)||[]).filter(x=>valid(x,v.publishedAt,now));
    const apiLatest=observations.at(-1);
    const siteAt=v.hotMeasuredAt||v.lastSeen||v.observedAt||null;
    const sourceViews=Number.isSafeInteger(Number(v.hotLatestViews))?Number(v.hotLatestViews):Number(v.views);
    const prior=before[v.id];
    const priorAt=prior?.latestObservedAt||prior?.hotMeasuredAt||null;
    const records=[...(apiLatest?[{views:apiLatest.views,at:apiLatest.capturedAt}]:[]),
      {views:sourceViews,at:siteAt},
      ...(prior&&Number.isSafeInteger(prior.views)?[{views:prior.views,at:priorAt}]:[])].filter(x=>
      Number.isSafeInteger(x.views)&&x.views>=0&&Number.isFinite(x.at)&&x.at>=v.publishedAt&&x.at<=now)
      .sort((a,b)=>b.at-a.at);
    const latest=records[0];
    if(!latest)continue;
    const channelId=apiLatest?.channelId||v.channelId||prior?.channelId||null;
    catalog.push({id:v.id,channelId,officialSource:isOfficialYouTubeChannel(channelId),
      publishedAt:v.publishedAt,views:latest.views,
      hotLatestViews:latest.views,hotMeasuredAt:latest.at,latestObservedAt:latest.at,
      title:v.title||'Untitled',channel:v.channelTitle||v.channel||apiLatest?.channelTitle||'',
      isShort:Number.isFinite(v.width)&&Number.isFinite(v.height)?v.height>v.width:v.isShort===true,
      videoDurationSeconds:v.videoDurationSeconds??null,
      source:'github-youtube-api',samples:[{capturedAt:latest.at,views:latest.views,source:'youtube-data-api'}]});
  }
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
    const short=(Number.isFinite(v.width)&&Number.isFinite(v.height))?
      v.height>v.width:v.isShort===true;
    const channelId=(apiById.get(v.id)||[]).find(s=>s.channelId)?.channelId||v.channelId||before[v.id]?.channelId||null;
    out.push({
      id:v.id,channelId,officialSource:isOfficialYouTubeChannel(channelId),
      title:v.title||'Untitled',channel:v.channelTitle||v.channel||'',
      publishedAt:v.publishedAt,views:h.latestViews,
      url:'https://www.youtube.com/watch?v='+encodeURIComponent(v.id),
      thumbnail:'https://i.ytimg.com/vi/'+encodeURIComponent(v.id)+'/mqdefault.jpg',
      isShort:short,velocityType:h.kind,vph:h.vph,estimate:h.kind==='estimated-since-upload',
      intervalMinutes:h.intervalMinutes,latestObservedAt:h.measuredAt,samples:sequence
    });
  }
  out.sort((a,b)=>b.vph-a.vph || b.views-a.views || b.publishedAt-a.publishedAt);
  const status=apiRead.status||'missing-key';
  return {schemaVersion:2,generatedAt:now,sourceLastScan:feed.lastScan||feed.independentDiscoveryAt||null,sourceFeed:SOURCE,independentDiscoveryAt:feed.independentDiscoveryAt||null,
    originalSiteAvailable:feed.originalSiteAvailable!==false,
    youtubeApi:{status,requests:apiRead.requests||0,observations:(apiRead.observations||[]).length,
      attempted:apiRead.attempted||0,lastCheckedAt:apiRead.observedAt||null},
    disclaimer:status==='connected'
      ? 'GitHub polls YouTube API hourly; discovery now also runs independently on GitHub, and can supplement the original Site.'
      : 'YouTube Data API is not connected; GitHub only re-ranks the original Site view snapshots.',
    counts:{tracked:raw.length,within24h:raw.filter(v=>Number.isFinite(v?.publishedAt)&&
      v.publishedAt<=now&&now-v.publishedAt<DAY_MS).length,
      eligible:out.length,estimated:out.filter(v=>v.estimate).length,
      measured:out.filter(v=>!v.estimate).length,
      shorts:out.filter(v=>v.isShort).length,longForm:out.filter(v=>!v.isShort).length},
    popular48h:{total:catalog.length,tracked24to48:catalog.filter(v=>now-v.publishedAt>=DAY_MS).length},
    rankings:{hot:out.filter(v=>!v.isShort).map(v=>v.id),
      shortsHot:out.filter(v=>v.isShort).map(v=>v.id)},
    watchSamples,videos:out,catalog};
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
      ? 'GitHub collects genuine view-count snapshots. Independent YouTube discovery is active when the discovery file is available.\n\n'
      : '**No new YouTube view-count measurements were collected.** Configure the YOUTUBE_API_KEY repository secret for real hourly polling.\n\n')+
    '## Long-form HOT\n\n'+listing(data.videos.filter(v=>!v.isShort))+
    '\n## Shorts HOT\n\n'+listing(data.videos.filter(v=>v.isShort));
}

async function github(token,repo,method,sha,data,path=PATH) {
  const url='https://api.github.com/repos/'+repo+'/contents/'+path;
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
  const previous=(token&&repo)?await github(token,repo,'GET'):{sha:null,data:{}};
  const discovered=(token&&repo)?await github(token,repo,'GET',null,null,DISCOVERY_PATH):
    {data:{videos:[]}};
  let site={videos:[]},originalSiteAvailable=false;
  try {
    const r=await fetch(SOURCE,{headers:{'User-Agent':'AzerothRadar-GitHubCompanion/3.0',
      Accept:'application/json'},signal:AbortSignal.timeout(16000)});
    if(r.ok) {
      const d=await r.json();
      if(Array.isArray(d.videos)) {site=d;originalSiteAvailable=true;}
    }
  } catch { /* Independent GitHub discovery must continue if original Site is offline. */ }
  const feed=combineSources(originalSiteAvailable?site:{},discovered.data,Date.now());
  const ids=new Set(feed.videos.map(v=>v.id));
  for(const older of previous.data.catalog||[]) if(!ids.has(older.id)&&
    Number.isFinite(older.publishedAt)&&Date.now()-older.publishedAt<48*HOUR_MS&&
    Date.now()>=older.publishedAt){feed.videos.push(older);ids.add(older.id);}
  if(!feed.videos.length&&!originalSiteAvailable)
    throw Error('No original Site feed and independent GitHub discovery is empty');
  if(!originalSiteAvailable)
    console.log('::warning::Original Site feed unavailable; using independent GitHub discovery');
  const selected=selectPopularCandidates(feed,Date.now());
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
