import { makeContentIdeas } from '../src/core.mjs';
import { hotVelocity, HOUR_MS } from '../site-integration/hot-hourly.mjs';

const DAY = 24*HOUR_MS;
const validId = id => typeof id==='string' && /^[\w-]{11}$/.test(id);
const goodDate = x => Number.isFinite(Number(x)) && Number(x)>0;
const allowedUrl = x => {
  try { const u=new URL(x); return u.protocol==='https:' && !u.username && !u.password ? u.href : ''; }
  catch {return '';}
};
export const isRecent=(ms,limit,now)=>goodDate(ms)&&Number(ms)<=now&&now-Number(ms)<limit;
export const safeUrl=allowedUrl;

/** Convert GitHub's publicly verified video to the existing full-dashboard feed shape.
 * Both original Site and live GitHub Data API observations have actual timestamps.
 */
export function fromGithubVideo(v,now=Date.now()) {
  if(!v || !validId(v.id) || !isRecent(v.publishedAt,48*HOUR_MS,now))return null;
  const samples=(Array.isArray(v.samples)?v.samples:[])
    .filter(s=>Number.isSafeInteger(s?.views)&&Number.isFinite(s.capturedAt)&&
      s.capturedAt>=v.publishedAt&&s.capturedAt<=now)
    .map(s=>({capturedAt:s.capturedAt,views:s.views}))
    .sort((a,b)=>a.capturedAt-b.capturedAt);
  const hot=hotVelocity({publishedAt:v.publishedAt,samples,now});
  const latest=samples.at(-1);
  const views=latest?.views??Number(v.views);
  if(!Number.isSafeInteger(views)||views<0)return null;
  const kind=v.isShort?'shorts':'long';
  const growth=hot.eligible?{
    perHour:hot.vph,
    sampleHours:hot.intervalMinutes?Math.round(hot.intervalMinutes/6)/10:null,
    kind:hot.kind, firstAt:samples[0]?.capturedAt, lastAt:hot.measuredAt
  }:null;
  return {
    id:v.id,kind,title:String(v.title||'Untitled').slice(0,400),
    channelName:String(v.channel||v.channelName||'').slice(0,160),
    thumbnail:'https://i.ytimg.com/vi/'+v.id+'/mqdefault.jpg',
    url:'https://www.youtube.com/watch?v='+v.id,
    publishedAt:Number(v.publishedAt),views,observedAt:latest?.capturedAt??null,
    durationSec:null,isVod:false, growth,
    velocitySource:hot.eligible?hot.kind:null
  };
}
export function normalizeIncomingStory(x,source,now=Date.now()) {
  if(!x||!x.id||!x.title||!allowedUrl(x.url)||!isRecent(x.publishedAt,48*HOUR_MS,now)) return null;
  if(source==='Reddit') {
    const evidence=x.listingEvidence?.[0]||{};
    const at=Number(x.observedAt||evidence.observedAt);
    const listing=String(x.listingUrl||evidence.url||'');
    const sort=x.sort||evidence.sort;
    if (!['top','hot'].includes(sort) ||
      !/^https:\/\/www\.reddit\.com\/r\/[a-z0-9_]+\/(top\/\?t=day|hot\/)$/i.test(listing)||
      !isRecent(at,2*HOUR_MS,now))return null;
  }
  return {...x,title:String(x.title).slice(0,400),summary:String(x.summary||'').slice(0,800),
    url:allowedUrl(x.url),source, publishedAt:Number(x.publishedAt)};
}
export function buildFeed({videos=[],reddit=[],official=[],saved=[],scans=[],now=Date.now(),githubAt=null,privateSaved=false}={}) {
  const eligible=videos.filter(x=>x&&!x.isVod&&Number(x.views)>=5000&&isRecent(x.publishedAt,48*HOUR_MS,now));
  const sortViews=(items)=>items.sort((a,b)=>b.views-a.views);
  const popular={long:sortViews(eligible.filter(v=>v.kind!=='shorts')),
    shorts:sortViews(eligible.filter(v=>v.kind==='shorts'))};
  const hotSort=(items)=>items.sort((a,b)=>b.growth.perHour-a.growth.perHour||b.views-a.views);
  const isHot=(v)=>isRecent(v.publishedAt,DAY,now)&&v.growth&&Number.isFinite(v.growth.perHour);
  const hot={long:hotSort(eligible.filter(v=>v.kind!=='shorts'&&isHot(v))),
    shorts:hotSort(eligible.filter(v=>v.kind==='shorts'&&isHot(v)))};
  const stories=[...reddit,...official].filter(s=>isRecent(s.publishedAt,48*HOUR_MS,now))
    .sort((a,b)=>b.publishedAt-a.publishedAt);
  const ideas=makeContentIdeas({videos:eligible,stories},now);
  const lastScan=githubAt||scans[0]?.at||null;
  return {generatedAt:now,isDemo:false,summary:{
    eligibleVideos:eligible.length,freshStories:stories.length,ideas:ideas.length,lastScan
  },hot,popular,stories,contentCreation:{items:ideas},
    saved:privateSaved?saved:[],savedPrivate:!privateSaved,
    channels:[],scans,sources:{youtube:'github-hourly',reddit:reddit.length?'imported':'unavailable',
      official:official.length?'imported':'unavailable'},
    note:'Independent Cloudflare D1 deployment. Original Site private database was not transferred.'};
}
