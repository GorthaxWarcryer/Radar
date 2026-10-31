import { writeFile } from 'node:fs/promises';
import { OFFICIAL_YOUTUBE_CHANNELS, isOfficialYouTubeChannel } from '../src/official-youtube.mjs';

const API='https://www.googleapis.com/youtube/v3/';
const DEST='docs/hot/discovered.json';
const QUERIES=['WoW Forever','World of Warcraft Forever','WoW Classic'];
const ID=/^[A-Za-z0-9_-]{11}$/;
const TOPICAL=/\b(wow|world of warcraft|warcraft|azeroth|classic wow|blizzard)\b/i;
const NON_ENGLISH_SCRIPT=/[¿¡\u00c0-\u024f\u0370-\u052f\u0590-\u0dff\u3040-\u30ff\u3400-\u9fff]/;
const PERIOD=50*3600000;
const MAX_SAVED=500;

export function durationSeconds(iso) {
  const m=/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso||'');
  if(!m)return null;
  return Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0);
}
export function normalizeDiscovery(entry,observedAt,followedIds=new Set()) {
  if(!ID.test(entry?.id||''))return null;
  const s=entry.snippet||{},stats=entry.statistics||{};
  const publishedAt=Date.parse(s.publishedAt||'');
  const views=Number(stats.viewCount);
  const title=String(s.title||''),channelTitle=String(s.channelTitle||'');
  const channelId=String(s.channelId||'');
  const relevant=TOPICAL.test(title)||TOPICAL.test(String(s.description||'').slice(0,700))||followedIds.has(channelId);
  const lang=s.defaultAudioLanguage||s.defaultLanguage||'';
  const duration=durationSeconds(entry.contentDetails?.duration);
  const live=!!entry.liveStreamingDetails||(s.liveBroadcastContent&&s.liveBroadcastContent!=='none');
  if(!title||(!relevant&&!isOfficialYouTubeChannel(s.channelId))||NON_ENGLISH_SCRIPT.test(title)||
    (lang&&!/^en(?:-|$)/i.test(lang))||!Number.isFinite(publishedAt)||
    publishedAt>observedAt||observedAt-publishedAt>PERIOD||
    !Number.isSafeInteger(views)||views<0||live)return null;
  const short=duration!==null&&duration<=180&&(duration<=90||/#shorts?\b/i.test(title));
  return {
    id:entry.id,title:title.slice(0,300),channelTitle:channelTitle.slice(0,140),channelId:channelId.slice(0,64),
    publishedAt,views,description:String(s.description||'').slice(0,750),
    tags:Array.isArray(s.tags)?s.tags.filter(x=>typeof x==='string').slice(0,12).map(x=>x.slice(0,40)):[],
    likes:Number.isFinite(Number(stats.likeCount))?Number(stats.likeCount):null,
    comments:Number.isFinite(Number(stats.commentCount))?Number(stats.commentCount):null,
    hotMeasuredAt:observedAt,hotLatestViews:views,
    lastSeen:observedAt,observedAt,videoDurationSeconds:duration,
    isShort:short,isLivestream:false,isVod:false,source:'github-youtube-discovery'
  };
}
async function youtube(endpoint,params,key,fetcher) {
  const url=new URL(API+endpoint);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,String(v));
  url.searchParams.set('key',key);
  let r;
  try{
    r=await fetcher(url.toString(),{headers:{Accept:'application/json',
      'User-Agent':'AzerothRadar-Discovery/1.0'},signal:AbortSignal.timeout(25000)});
  }catch{throw Error('YouTube connection failed; no credentials logged');}
  if(!r.ok)throw Error('YouTube '+endpoint+' HTTP '+r.status+'; check API quota and restrictions');
  const data=await r.json();
  if(!Array.isArray(data.items))throw Error('Malformed YouTube '+endpoint+' response');
  return data;
}
export async function discover(key,{fetcher=fetch,now=Date.now(),queries=QUERIES,channels=[],blockedChannels=[],hiddenVideos=[]}={}) {
  if(!key)throw Error('YOUTUBE_API_KEY GitHub secret missing');
  const ids=new Set();let searches=0,detailCalls=0,officialPlaylistCalls=0;
  const after=new Date(now-PERIOD).toISOString();
  for(const q of queries.slice(0,6)) {
    const data=await youtube('search',{part:'snippet',q,type:'video',order:'date',
      publishedAfter:after,relevanceLanguage:'en',maxResults:50},key,fetcher);
    searches++;
    for(const x of data.items)if(ID.test(x.id?.videoId||''))ids.add(x.id.videoId);
  }
  // Directly follow the verified official uploads playlist. YouTube's UU prefix
  // is the uploads playlist for its immutable UC channel ID; playlistItems costs
  // one quota unit per page, rather than another 100-unit search request.
  for(const source of OFFICIAL_YOUTUBE_CHANNELS) {
    try {
      const playlist=await youtube('playlistItems',{part:'contentDetails',
        playlistId:'UU'+source.id.slice(2),maxResults:50},key,fetcher);
      officialPlaylistCalls++;
      for(const item of playlist.items)if(ID.test(item.contentDetails?.videoId||''))ids.add(item.contentDetails.videoId);
    }catch{console.warn('Official channel upload listing unavailable');}
  }
  const followed=new Set(channels.filter(c=>/^UC[a-zA-Z0-9_-]{22}$/.test(c?.id||'')).slice(0,20).map(c=>c.id));
  for(const source of [...followed].filter(id=>!isOfficialYouTubeChannel(id))){
    try {
      const playlist=await youtube('playlistItems',{part:'contentDetails',
        playlistId:'UU'+source.slice(2),maxResults:50},key,fetcher);
      detailCalls++;
      for(const row of playlist.items)if(ID.test(row.contentDetails?.videoId||''))ids.add(row.contentDetails.videoId);
    } catch {console.warn('Tracked channel upload listing unavailable: '+source);}
  }
  const videos=[];
  const list=[...ids].slice(0,250);
  for(let i=0;i<list.length;i+=50) {
    const d=await youtube('videos',{part:'snippet,statistics,contentDetails,liveStreamingDetails',
      id:list.slice(i,i+50).join(',')},key,fetcher);
    detailCalls++;
    for(const x of d.items) {
      const v=normalizeDiscovery(x,now,followed);
      if(v&&!blockedChannels.includes(v.channelId)&&!hiddenVideos.includes(v.id))videos.push(v);
    }
  }
  return {videos,stats:{searches,officialPlaylistCalls,detailCalls,
    returned:ids.size,qualified:videos.length,
    officialUploads:videos.filter(v=>isOfficialYouTubeChannel(v.channelId)).length},now};
}
export function merge(previous={},current=[],now=Date.now()) {
  const ids=new Map();
  for(const v of previous.videos||[])
    if(v&&ID.test(v.id)&&Number.isFinite(v.publishedAt)&&now-v.publishedAt<PERIOD&&now>=v.publishedAt)
      ids.set(v.id,v);
  for(const v of current)if(v&&ID.test(v.id))ids.set(v.id,v);
  return {schemaVersion:1,generatedAt:now,source:'youtube-data-api',
    note:'Independent YouTube discovery from GitHub Actions. Search coverage is partial, not exhaustive.',
    videos:[...ids.values()].sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,MAX_SAVED)};
}
async function file(token,repo,method,data,sha) {
  const url='https://api.github.com/repos/'+repo+'/contents/'+DEST;
  const opts={method,headers:{Authorization:'Bearer '+token,
    Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}};
  if(method==='PUT'){
    opts.headers['Content-Type']='application/json';
    opts.body=JSON.stringify({message:'Update independent YouTube discovery [skip ci]',
      content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64'),
      ...(sha?{sha}:{})});
  }
  const r=await fetch(url,opts);
  if(method==='GET'&&r.status===404)return {data:{},sha:null};
  if(!r.ok)throw Error('GitHub Contents '+method+' HTTP '+r.status);
  if(method==='PUT')return;
  const x=await r.json();
  return {sha:x.sha,data:JSON.parse(Buffer.from(x.content.replace(/\s/g,''),'base64').toString())};
}
async function readPublicConfig(fetcher=fetch){
  const fallback={queries:QUERIES,channels:[],blockedChannels:[],hiddenVideos:[]};
  try {
    const r=await fetcher('https://azeroth-radar.azeroth-radar-gorthax.workers.dev/api/discovery/config',
      {headers:{accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)return fallback;
    const d=await r.json();
    return {
      queries:Array.isArray(d.queries)&&d.queries.length?
        d.queries.filter(x=>typeof x==='string'&&x.length>=3&&x.length<=80).slice(0,6):QUERIES,
      channels:Array.isArray(d.channels)?d.channels.slice(0,20):[],
      blockedChannels:Array.isArray(d.blockedChannels)?d.blockedChannels.slice(0,200):[],
      hiddenVideos:Array.isArray(d.hiddenVideos)?d.hiddenVideos.slice(0,500):[]
    };
  }catch{return fallback;}
}
async function main(){
  const key=process.env.YOUTUBE_API_KEY;
  const gh=process.env.GH_DISCOVERY_TOKEN,repo=process.env.GITHUB_REPOSITORY;
  if(!gh||!repo)throw Error('GitHub write identity missing');
  const prior=await file(gh,repo,'GET');
  const settings=await readPublicConfig();
  const result=await discover(key,{...settings});
  const joined=merge(prior.data,result.videos,result.now);
  await file(gh,repo,'PUT',joined,prior.sha);
  const status={outcome:'complete',source:'youtube-independent',...result.stats,
    retained:joined.videos.length,sourceGeneratedAt:joined.generatedAt};
  console.log(JSON.stringify(status));
  if(process.env.GITHUB_STEP_SUMMARY)
    await writeFile(process.env.GITHUB_STEP_SUMMARY,'## Independent YouTube discovery\n\n'+JSON.stringify(status,null,2)+'\n',{flag:'a'});
}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].split('/').pop()))
  main().catch(e=>{console.error('Discovery failed:',e.message);process.exitCode=1;});
