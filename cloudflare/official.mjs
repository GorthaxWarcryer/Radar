// Public Blizzard news endpoints, without API credentials or third-party syndication.
export const OFFICIAL_SOURCES = Object.freeze([
  {id:'wow',title:'World of Warcraft',description:'Official Blizzard news, announcements and patch notes',url:'https://worldofwarcraft.blizzard.com/en-us/news',api:'https://news.blizzard.com/en-us/api/news/blizzard?feedCxpProductIds%5B%5D=blt2caca37e42f19839',provider:'official-wow'},
  {id:'forever',title:'World of Warcraft: Forever',description:'Official Blizzard WoW: Forever announcements',url:'https://worldofwarcraft.blizzard.com/en-us/forever',api:'https://news.blizzard.com/en-us/api/news/blizzard?feedCxpProductIds%5B%5D=world-of-warcraft-forever',provider:'official-forever'}
]);

const RECENT=48*60*60*1000;
const textValue = x => String(x??'').replace(/<[^>]*>/g,' ').replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g,m=>({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '}[m])).replace(/\s+/g,' ').trim();
function trustedBlizzardURL(raw) {
  try {
    const u=new URL(raw);
    return u.protocol==='https:' && !u.username && !u.password &&
      ['news.blizzard.com','worldofwarcraft.blizzard.com'].includes(u.hostname) ? u.href:'';
  }catch{return '';}
}
export function parseOfficialNews(data,source,now=Date.now()) {
  const items=data?.feed?.contentItems;
  if(!Array.isArray(items))throw new Error('Unexpected Blizzard news feed response');
  return items.slice(0,60).flatMap(item=>{
    const p=item?.properties||{};
    const url=trustedBlizzardURL(p.newsUrl),publishedAt=Date.parse(p.lastUpdated||p.publishedAt||'');
    const title=textValue(p.title).slice(0,400);
    if(!url||!title||!Number.isFinite(publishedAt)||publishedAt>now+60000||now-publishedAt>=RECENT)return [];
    const stable=String(p.newsId||new URL(url).pathname).slice(0,240);
    return [{id:'official:blizzard:'+stable,title,url,
      summary:textValue(p.summary).slice(0,800),publishedAt,source:'Official',
      sourceId:source.id,sourceName:source.title}];
  });
}
export function officialSourceStatus(scans=[],posts=[]) {
  return OFFICIAL_SOURCES.map(source=>{
    const latest=scans.find(s=>s.provider===source.provider);
    const items=posts.filter(p=>p.sourceId===source.id);
    return {id:source.id,title:source.title,description:source.description,
      url:source.url,provider:source.provider,
      status:latest?.status||'pending',lastChecked:latest?.at||null,
      error:latest?.status==='error'?String(latest.error||'Feed unavailable').slice(0,180):'',
      posts48h:items.length,latestPostAt:items.length?Math.max(...items.map(p=>p.publishedAt)):null};
  });
}
// Called by the Cloudflare hourly cron, separately from the YouTube daytime scan.
// Source failures are recorded individually; they cannot erase existing stories.
export async function synchronizeOfficial(env,fetcher=fetch,now=Date.now()) {
  if(!env.DB)throw Error('D1 database binding missing');
  const results=[];
  for(const source of OFFICIAL_SOURCES) {
    try {
      const response=await fetcher(source.api,{headers:{accept:'application/json','user-agent':'AzerothRadar/1.0'},signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Blizzard feed HTTP '+response.status);
      const posts=parseOfficialNews(await response.json(),source,now);
      const statements=[];
      for(let n=0;n<posts.length;n+=20) {
        const chunk=posts.slice(n,n+20);
        statements.push(env.DB.prepare('INSERT INTO official(id,payload,last_seen) VALUES '+chunk.map(()=>'(?,?,?)').join(',')+
          ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen')
          .bind(...chunk.flatMap(p=>[p.id,JSON.stringify(p),now])));
      }
      statements.push(env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)')
        .bind(now,source.provider,'complete',posts.length,''));
      await env.DB.batch(statements);
      results.push({source:source.id,status:'complete',posts:posts.length});
    }catch(e) {
      const error=String(e?.message||e).slice(0,180);
      try {await env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)')
        .bind(now,source.provider,'error',0,error).run();}
      catch(dbError){console.error('Official scan error recording failed',dbError);}
      results.push({source:source.id,status:'error',error});
    }
  }
  return results;
}
