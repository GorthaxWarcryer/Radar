import { buildFeed, fromGithubVideo, normalizeIncomingStory, safeUrl } from './transform.mjs';

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
  const stmts=[];
  for(const v of videos) stmts.push(env.DB.prepare(
    'INSERT INTO videos(id,payload,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen'
  ).bind(v.id,JSON.stringify(v),v.observedAt||d.generatedAt));
  for(const s of samples.values())stmts.push(env.DB.prepare(
    'INSERT OR IGNORE INTO video_samples(id,at,views,source) VALUES(?,?,?,?)'
  ).bind(s.id,s.at,s.views,String(s.source).slice(0,40)));
  let writes=0;
  for(let i=0;i<stmts.length;i+=80) {await env.DB.batch(stmts.slice(i,i+80));writes+=Math.min(80,stmts.length-i);}
  await env.DB.batch([
    env.DB.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('githubLastGeneratedAt',String(d.generatedAt)),
    env.DB.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind('lastCloudflareSyncAt',String(now)),
    env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)').bind(now,'github','complete',videos.length,''),
    env.DB.prepare('DELETE FROM video_samples WHERE at < ?').bind(now-72*3600000),
    env.DB.prepare('DELETE FROM videos WHERE last_seen < ?').bind(now-72*3600000)
  ]);
  return {status:'complete',videos:videos.length,samples:samples.size,writes,
    sourceGeneratedAt:d.generatedAt,syncedAt:now};
}

async function readRows(db,sql,params=[]) {
  const q=db.prepare(sql).bind(...params);
  return (await q.all()).results||[];
}
async function state(env,req,now=Date.now(),fetcher=fetch) {
  const [videoRows,redditRows,officialRows,savedRows,scans,meta]=await Promise.all([
    readRows(env.DB,'SELECT payload FROM videos WHERE last_seen>=? ORDER BY last_seen DESC LIMIT 1500',[now-7*86400000]),
    readRows(env.DB,'SELECT payload FROM reddit WHERE last_seen>=? ORDER BY last_seen DESC LIMIT 400',[now-2*3600000]),
    readRows(env.DB,'SELECT payload FROM official ORDER BY last_seen DESC LIMIT 150'),
    verifyAdmin(req,env).then(ok=>ok?readRows(env.DB,'SELECT id,kind,title,url,note,saved_at AS savedAt FROM saved ORDER BY saved_at DESC LIMIT 1000'):[]),
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
  return buildFeed({videos,reddit:parsePayload(redditRows),official:parsePayload(officialRows),
    saved:savedRows,scans,privateSaved:savedRows.length>0&&await verifyAdmin(req,env),
    now,githubAt:Number(metaObj.githubLastGeneratedAt)||null});
}
async function adminRequired(req,env) {
  return await verifyAdmin(req,env)?null:error(env.ADMIN_TOKEN?'Administrator authorization required':'Administrator secret not configured',env.ADMIN_TOKEN?401:503);
}
async function upsertData(env,data,now=Date.now()) {
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Invalid import');
  const list=x=>Array.isArray(x)?x.slice(0,LIMIT):[];
  const vids=list(data.videos).filter(x=>x&&/^[a-zA-Z0-9_-]{11}$/.test(x.id||'')&&
    x.title&&Number.isFinite(Number(x.publishedAt))&&
    Number.isSafeInteger(Number(x.views))&&Number(x.views)>=0);
  const reddit=list(data.reddit).map(x=>normalizeIncomingStory(x,'Reddit',now)).filter(Boolean);
  const official=list(data.official).map(x=>normalizeIncomingStory(x,'Official',now)).filter(Boolean);
  const saved=list(data.saved).filter(x=>x?.id&&x.title);
  const stmts=[];
  for(const v of vids) {
    const item={...v,id:v.id,title:String(v.title).slice(0,400),observedAt:now,
      views:Number(v.views),kind:v.kind==='shorts'?'shorts':'long',isVod:!!v.isVod};
    stmts.push(env.DB.prepare('INSERT INTO videos(id,payload,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen')
      .bind(item.id,JSON.stringify(item),now));
    stmts.push(env.DB.prepare('INSERT OR IGNORE INTO video_samples(id,at,views,source) VALUES(?,?,?,?)').bind(item.id,now,item.views,'admin-import'));
  }
  for(const [table,items] of [['reddit',reddit],['official',official]])
    for(const item of items)
      stmts.push(env.DB.prepare('INSERT INTO '+table+'(id,payload,last_seen) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen')
        .bind(String(item.id).slice(0,300),JSON.stringify(item),now));
  for(const item of saved)
    stmts.push(env.DB.prepare('INSERT INTO saved(id,kind,title,url,note,saved_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,note=excluded.note')
      .bind(String(item.id).slice(0,300),String(item.kind||'video').slice(0,30),
        String(item.title).slice(0,400),safeUrl(item.url)||'',String(item.note||'').slice(0,3000),
        Number(item.savedAt)||now));
  for(let i=0;i<stmts.length;i+=80)await env.DB.batch(stmts.slice(i,i+80));
  return {videos:vids.length,reddit:reddit.length,official:official.length,saved:saved.length};
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
  async fetch(req,env) {
    const url=new URL(req.url), path=url.pathname, now=Date.now();
    if(!path.startsWith('/api/'))return env.ASSETS?.fetch(req)||error('Asset not found',404);
    try {
      if(!env.DB)return error('Database unavailable; configure Cloudflare D1',503);
      if(req.method==='GET'&&path==='/api/health') {
        const meta=await readRows(env.DB,"SELECT key,value FROM meta WHERE key IN ('lastCloudflareSyncAt','githubLastGeneratedAt')");
        return reply({ok:true,platform:'cloudflare-workers',database:'d1',originalSiteConnected:false,
          meta:Object.fromEntries(meta.map(x=>[x.key,Number(x.value)])),time:now});
      }
      if(req.method==='GET'&&path==='/api/feed')return reply(await state(env,req,now));
      if(req.method==='GET'&&path==='/api/scan/status'){
        const denied=await adminRequired(req,env);if(denied)return denied;
        const scans=await readRows(env.DB,'SELECT at,provider,status,count,error FROM scans ORDER BY id DESC LIMIT 1');
        return reply(scans[0]||{status:'not_started'});
      }
      if(req.method==='POST'&&path==='/api/scan'){
        const denied=await adminRequired(req,env);if(denied)return denied;
        return reply(await synchronize(env,fetch,now),200);
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
    const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',hourCycle:'h23'}).format(new Date(event.scheduledTime)));
    if(hour<5||hour>20)return;
    try{const result=await synchronize(env,fetch,Date.now());console.log('Cloudflare scheduled sync:',JSON.stringify(result));}
    catch(e){console.error('Cloudflare scheduled sync failure:',fail(e));throw e;}
  }
};
