import { buildFeed, fromGithubVideo, normalizeIncomingStory, safeUrl } from './transform.mjs';
import { synchronizeOfficial, officialSourceStatus } from './official.mjs';

const GITHUB_HOT='https://raw.githubusercontent.com/GorthaxWarcryer/Radar/main/docs/hot/latest.json';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const reply=(body,status=200,extra={})=>new Response(JSON.stringify(body),{status,headers:{...headers,...extra}});
const error=(message,status)=>reply({error:message},status);
const LIMIT=1200;
const parsePayload=rows=>rows.flatMap(row=>{try {return [JSON.parse(row.payload)];}catch{return [];}});
const fail=e=>String(e?.message||'Unexpected failure').slice(0,220);
async function verifyAdmin(req,env) {
  const expected=env.ADMIN_TOKEN;
  const got=req.headers.get('x-admin-token');
  if(typeof expected!=='string'||expected.length<32||!got)return false;
  const encoder=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(expected)),
    crypto.subtle.digest('SHA-256',encoder.encode(got))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);
  let different=0;for(let i=0;i<x.length;i++)different|=x[i]^y[i];
  return different===0;
}
async function bodyJson(req) {
  const text=await req.text();
  if(text.length>1000000)throw new Error('Request body exceeds 1 MB');
  return JSON.parse(text||'{}');
}
async function sourceHot(fetcher=fetch) {
  // Cache-bust only every five minutes, so reader traffic does not trigger repeated GitHub fetches.
  const windowId=Math.floor(Date.now()/300000);
  const r=await fetcher(GITHUB_HOT+'?t='+windowId,{headers:{accept:'application/json','user-agent':'AzerothRadar-Cloudflare/1.0'}});
  if(!r.ok)throw new Error('Public GitHub HOT feed HTTP '+r.status);
  const d=await r.json();
  if(!Array.isArray(d.videos)||!Number.isFinite(d.generatedAt))throw new Error('Invalid public GitHub HOT feed');
  return d;
}
export async function synchronize(env,fetcher=fetch,now=Date.now()) {
  if(!env.DB)throw new Error('D1 database binding missing');
  const d=await sourceHot(fetcher);
  const videos=d.videos.map(v=>fromGithubVideo(v,now)).filter(Boolean);
  const samples=new Map();
  for (const [id,entries] of Object.entries(d.watchSamples||{})) {
    if(!/^[a-zA-Z0-9_-]{11}$/.test(id)||!Array.isArray(entries))continue;
    for (const s of entries) if(Number.isFinite(s?.capturedAt)&&Number.isSafeInteger(s?.views)&&
      s.views>=0 && s.capturedAt<=now && now-s.capturedAt<72*3600000)
      samples.set(id+':'+s.capturedAt,{id,at:s.capturedAt,views:s.views,source:s.source||'github'});
  }
  for(const v of d.videos)for(const s of v.samples||[])
    if(/^[a-zA-Z0-9_-]{11}$/.test(v.id||'')&&Number.isFinite(s?.capturedAt)&&
      Number.isSafeInteger(s?.views)&&s.views>=0&&s.capturedAt<=now&&now-s.capturedAt<72*3600000)
      samples.set(v.id+':'+s.capturedAt,{id:v.id,at:s.capturedAt,views:s.views,source:s.source||'github'});
  // D1 Free allows 50 database queries per invocation. Use bulk multi-row inserts.
  // Keep the newest genuine timestamp per video for this sync; previous hours persist in D1.
  const latest=new Map();
  for(const sample of samples.values()) {
    const previous=latest.get(sample.id);
    if(!previous||sample.at>previous.at)latest.set(sample.id,sample);
  }
  const keepVideos=videos.slice(0,500);
  const videoRows=keepVideos.map(v=>[v.id,JSON.stringify(v),v.observedAt||d.generatedAt]);
  const sampleRows=[...latest.values()].slice(0,500).map(x=>[x.id,x.at,x.views,String(x.source).slice(0,40)]);
  const stmts=[];
  function insertMany(prefix,rows,width,suffix='') {
    const chunkSize=Math.min(25,Math.floor(100/width)); // D1: max 100 bound parameters
    for(let i=0;i<rows.length;i+=chunkSize){
      const block=rows.slice(i,i+chunkSize);
      const placeholders='('+Array(width).fill('?').join(',')+')';
      const sql=prefix+Array(block.length).fill(placeholders).join(',')+suffix;
      stmts.push(env.DB.prepare(sql).bind(...block.flat()));
    }
  }
  insertMany('INSERT INTO videos(id,payload,last_seen) VALUES ',videoRows,3,
    ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen');
  insertMany('INSERT OR IGNORE INTO video_samples(id,at,views,source) VALUES ',sampleRows,4);
  stmts.push(
    env.DB.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('githubLastGeneratedAt',String(d.generatedAt)),
    env.DB.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('lastCloudflareSyncAt',String(now)),
    env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)').bind(now,'github','complete',keepVideos.length,''),
    env.DB.prepare('DELETE FROM video_samples WHERE at < ?').bind(now-72*3600000),
    env.DB.prepare('DELETE FROM videos WHERE last_seen < ?').bind(now-72*3600000)
  );
  if(stmts.length>50)throw new Error('D1 free-tier per-invocation query cap exceeded');
  await env.DB.batch(stmts);
  return {status:'complete',videos:keepVideos.length,samples:sampleRows.length,
    writes:videoRows.length+sampleRows.length,queries:stmts.length,
    sourceGeneratedAt:d.generatedAt,syncedAt:now};
}

async function readRows(db,sql,params=[]) {
  const q=db.prepare(sql).bind(...params);
  return (await q.all()).results||[];
}
async function state(env,req,now=Date.now(),fetcher=fetch) {
  const isAdmin=await verifyAdmin(req,env);
  const [videoRows,redditRows,officialRows,savedRows,scans,meta]=await Promise.all([
    readRows(env.DB,'SELECT payload FROM videos WHERE last_seen>=? ORDER BY last_seen DESC LIMIT 1500',[now-7*86400000]),
    readRows(env.DB,'SELECT payload FROM reddit WHERE last_seen>=? ORDER BY last_seen DESC LIMIT 400',[now-2*3600000]),
    readRows(env.DB,'SELECT payload FROM official ORDER BY last_seen DESC LIMIT 150'),
    isAdmin?readRows(env.DB,'SELECT id,kind,title,url,note,saved_at AS savedAt FROM saved ORDER BY saved_at DESC LIMIT 1000'):[],
    readRows(env.DB,'SELECT at,provider,status,count,error FROM scans ORDER BY id DESC LIMIT 50'),
    readRows(env.DB,"SELECT key,value FROM meta WHERE key IN ('githubLastGeneratedAt','lastCloudflareSyncAt')")
  ]);
  const metaObj=Object.fromEntries(meta.map(x=>[x.key,x.value]));
  let videos=parsePayload(videoRows);
  if(!videos.length) {
    // Before first Cloudflare cron or admin sync, show working public GitHub data without mutating D1.
    try {const d=await sourceHot(fetcher);videos=d.videos.map(x=>fromGithubVideo(x,now)).filter(Boolean);metaObj.githubLastGeneratedAt=d.generatedAt;}
    catch {/* D1-only fallback */}
  }
  const official=parsePayload(officialRows);
  const recentOfficial=official.filter(p=>Number(p.publishedAt)<=now&&now-Number(p.publishedAt)<48*3600000);
  return buildFeed({videos,reddit:parsePayload(redditRows),official,
    officialSources:officialSourceStatus(scans,recentOfficial),
    saved:savedRows,scans,privateSaved:isAdmin,
    now,githubAt:Number(metaObj.githubLastGeneratedAt)||null});
}
async function adminRequired(req,env) {
  return await verifyAdmin(req,env)?null:error(env.ADMIN_TOKEN?'Administrator authorization required':'Administrator secret not configured',env.ADMIN_TOKEN?401:503);
}
async function upsertData(env,data,now=Date.now()) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid import');
  // Each import request is bounded and uses bulk SQL for Cloudflare Free's per-invocation limits.
  const list=x=>Array.isArray(x)?x:[];
  const total=list(data.videos).length+list(data.reddit).length+
    list(data.official).length+list(data.saved).length;
  if(total>200)throw new Error('Import limit 200 records/request; split larger exports into batches');
  const vids=list(data.videos).filter(x=>x&&/^[a-zA-Z0-9_-]{11}$/.test(x.id||'')&&
    x.title&&Number.isFinite(Number(x.publishedAt))&&
    Number.isSafeInteger(Number(x.views))&&Number(x.views)>=0);
  const reddit=list(data.reddit).map(x=>normalizeIncomingStory(x,'Reddit',now)).filter(Boolean);
  const official=list(data.official).map(x=>normalizeIncomingStory(x,'Official',now)).filter(Boolean);
  const saved=list(data.saved).filter(x=>x?.id&&x.title);
  const videoRows=vids.map(v=>{
    const observedAt=Number.isFinite(Number(v.observedAt))&&Number(v.observedAt)>0?
      Number(v.observedAt):null;
    const item={...v,id:v.id,title:String(v.title).slice(0,400),
      observedAt,views:Number(v.views),kind:v.kind==='shorts'?'shorts':'long',isVod:!!v.isVod};
    return [item.id,JSON.stringify(item),observedAt||now];
  });
  // Import dates are NOT observations. Only save an explicit source measurement timestamp.
  const sampleRows=vids.flatMap(v=>
    Number.isFinite(Number(v.observedAt))&&Number(v.observedAt)>=Number(v.publishedAt)&&
    Number(v.observedAt)<=now&&Number.isSafeInteger(Number(v.views))?
      [[v.id,Number(v.observedAt),Number(v.views),'admin-import']]:[]);
  const stmts=[];
  function pushBulk(prefix,rows,width,suffix='') {
    for(let i=0;i<rows.length;i+=20){
      const part=rows.slice(i,i+20);
      const placeholder='('+Array(width).fill('?').join(',')+')';
      stmts.push(env.DB.prepare(prefix+Array(part.length).fill(placeholder).join(',')+suffix)
        .bind(...part.flat()));
    }
  }
  pushBulk('INSERT INTO videos(id,payload,last_seen) VALUES ',videoRows,3,
    ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen');
  pushBulk('INSERT OR IGNORE INTO video_samples(id,at,views,source) VALUES ',sampleRows,4);
  for(const [table,items] of [['reddit',reddit],['official',official]])
    pushBulk('INSERT INTO '+table+'(id,payload,last_seen) VALUES ',
      items.map(x=>[String(x.id).slice(0,300),JSON.stringify(x),now]),3,
      ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen');
  pushBulk('INSERT INTO saved(id,kind,title,url,note,saved_at) VALUES ',
    saved.map(item=>[String(item.id).slice(0,300),String(item.kind||'video').slice(0,30),
      String(item.title).slice(0,400),safeUrl(item.url)||'',
      String(item.note||'').slice(0,3000),Number(item.savedAt)||now]),6,
    ' ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,note=excluded.note');
  if(stmts.length>50)throw new Error('D1 query limit exceeded, split imports into smaller batches');
  if(stmts.length)await env.DB.batch(stmts);
  return {videos:vids.length,reddit:reddit.length,official:official.length,saved:saved.length,
    importedMeasurementSamples:sampleRows.length,queries:stmts.length};
}
async function exportAll(env) {
  const [videos,reddit,official,saved]=await Promise.all([
    readRows(env.DB,'SELECT payload FROM videos ORDER BY last_seen DESC LIMIT 4000'),
    readRows(env.DB,'SELECT payload FROM reddit ORDER BY last_seen DESC LIMIT 1200'),
    readRows(env.DB,'SELECT payload FROM official ORDER BY last_seen DESC LIMIT 1200'),
    readRows(env.DB,'SELECT id,kind,title,url,note,saved_at AS savedAt FROM saved ORDER BY saved_at DESC LIMIT 4000')
  ]);
  return {exportedAt:Date.now(),videos:parsePayload(videos),reddit:parsePayload(reddit),
    official:parsePayload(official),saved};
}
export default {
  async fetch(req,env,ctx) {
    const url=new URL(req.url), path=url.pathname, now=Date.now();
    if(!path.startsWith('/api/'))return env.ASSETS?.fetch(req)||error('Asset not found',404);
    try {
      if(!env.DB)return error('Database unavailable; configure Cloudflare D1',503);
      if(req.method==='GET'&&path==='/api/health') {
        const meta=await readRows(env.DB,"SELECT key,value FROM meta WHERE key IN ('lastCloudflareSyncAt','githubLastGeneratedAt')");
        return reply({ok:true,platform:'cloudflare-workers',database:'d1',originalSiteConnected:false,
          meta:Object.fromEntries(meta.map(x=>[x.key,Number(x.value)])),time:now});
      }
      if(req.method==='GET'&&path==='/api/feed') {
        // Never cache authenticated responses or private notes.
        const anonymous=!req.headers.has('x-admin-token');
        const cache=anonymous&&typeof caches!=='undefined'?caches.default:null;
        const cacheKey=new Request(url.origin+'/api/feed',{method:'GET'});
        if(cache) {
          const hit=await cache.match(cacheKey);
          if(hit)return hit;
        }
        const res=reply(await state(env,req,now),200,
          anonymous?{'cache-control':'public, max-age=45'}:{'cache-control':'no-store'});
        if(cache&&ctx?.waitUntil)ctx.waitUntil(cache.put(cacheKey,res.clone()));
        return res;
      }
      if(req.method==='GET'&&path==='/api/scan/status'){
        const denied=await adminRequired(req,env);if(denied)return denied;
        const scans=await readRows(env.DB,'SELECT at,provider,status,count,error FROM scans ORDER BY id DESC LIMIT 1');
        return reply(scans[0]||{status:'not_started'});
      }
      if(req.method==='POST'&&path==='/api/scan'){
        const denied=await adminRequired(req,env);if(denied)return denied;
        const official=await synchronizeOfficial(env,fetch,now);
        return reply({...await synchronize(env,fetch,now),official},200);
      }
      if(req.method==='POST'&&path==='/api/save') {
        const denied=await adminRequired(req,env);if(denied)return denied;
        const s=await bodyJson(req);
        if(!s?.id||!s?.title)return error('id and title required',400);
        await env.DB.prepare('INSERT INTO saved(id,kind,title,url,note,saved_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,note=excluded.note')
          .bind(String(s.id).slice(0,300),String(s.kind||'video').slice(0,30),
            String(s.title).slice(0,400),safeUrl(s.url)||'',String(s.note||'').slice(0,3000),now).run();
        return reply({ok:true});
      }
      if(req.method==='DELETE'&&path.startsWith('/api/save/')) {
        const denied=await adminRequired(req,env);if(denied)return denied;
        await env.DB.prepare('DELETE FROM saved WHERE id=?').bind(decodeURIComponent(path.slice(10))).run();
        return reply({ok:true});
      }
      if(req.method==='POST'&&path==='/api/import') {
        const denied=await adminRequired(req,env);if(denied)return denied;
        return reply({ok:true,counts:await upsertData(env,await bodyJson(req),now)});
      }
      if(req.method==='GET'&&path==='/api/export') {
        const denied=await adminRequired(req,env);if(denied)return denied;
        return reply(await exportAll(env),200,{'content-disposition':'attachment; filename="azeroth-radar-cloudflare-export.json"'});
      }
      return error('Route not found',404);
    }catch(e) {
      console.error('Azeroth Radar Worker error:',fail(e));
      return error('Request failed. Check Worker logs.',500);
    }
  },
  async scheduled(event,env) {
    const now=Date.now();
    // Official Blizzard news continues through the night; YouTube remains on the agreed daytime schedule.
    try {console.log('Official Blizzard source sync:',JSON.stringify(await synchronizeOfficial(env,fetch,now)));}
    catch(e) {console.error('Official source sync failure:',fail(e));}
    const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',hourCycle:'h23'}).format(new Date(event.scheduledTime)));
    if(hour<5||hour>20)return;
    try{const result=await synchronize(env,fetch,now);console.log('Cloudflare scheduled sync:',JSON.stringify(result));}
    catch(e){console.error('Cloudflare scheduled sync failure:',fail(e));throw e;}
  }
};
