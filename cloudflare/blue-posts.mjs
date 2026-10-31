/**
 * WoW Forever Blizzard forum blue posts, discovered from The Forever Era's
 * public RSS (an independent tracker, NOT a Blizzard-operated API).
 * Only direct US/EU Blizzard WoW forum links enter the official Stories feed.
 */
export const BLUE_RSS = 'https://theforeverera.com/en/blue.xml';
const MAX_AGE=48*3600000;
const unescapeXml=s=>String(s||'').replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1')
  .replace(/&(amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi,(all,key)=>{
    const values={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
    if(key[0]!=='#')return values[key.toLowerCase()]||all;
    const n=key[1]?.toLowerCase()==='x'?parseInt(key.slice(2),16):parseInt(key.slice(1),10);
    return Number.isInteger(n)&&n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):'';
  });
const field=(s,name)=>{const n=name.replace(/[^a-z:]/gi,'');
  const m=s.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+n+'>','i'));
  return m?unescapeXml(m[1].trim()):'';
};
const clean=(s,max=700)=>unescapeXml(String(s||'').replace(/<[^>]+>/g,' '))
  .replace(/\s+/g,' ').trim().slice(0,max);
export function verifiedForumUrl(raw){
  try{
    const url=new URL(String(raw||''));
    if(url.protocol!=='https:'||url.username||url.password||
       !['us.forums.blizzard.com','eu.forums.blizzard.com'].includes(url.hostname.toLowerCase())||
       !/^\/en\/wow\/t\/[^/]+\/\d+(?:\/\d+)?\/?$/i.test(url.pathname))return '';
    url.search='';url.hash='';return url.href;
  }catch{return '';}
}
export function parseBluePosts(xml,now=Date.now()){
  if(typeof xml!=='string'||xml.length>1500000||
     !/<(?:rss|feed|rdf:RDF)\b/i.test(xml))throw Error('Invalid blue posts RSS response');
  const entries=[...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
  const found=new Map();
  for(const [,type,entry] of entries.slice(0,300)){
    const links=[field(entry,'link'),field(entry,'guid'),field(entry,'sourceUrl')];
    if(type.toLowerCase()==='entry'){
      for(const match of entry.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/gi))
        links.push(unescapeXml(match[1]));
    }
    const url=links.map(verifiedForumUrl).find(Boolean);
    const publishedAt=Date.parse(field(entry,'pubDate')||field(entry,'published')||field(entry,'dc:date'));
    const title=clean(field(entry,'title'),400);
    if(!url||!title||!Number.isFinite(publishedAt)||publishedAt>now||
       now-publishedAt>=MAX_AGE)continue;
    const author=clean(field(entry,'dc:creator')||field(entry,'creator')||
      field(entry,'author'),100);
    const summary=clean(field(entry,'description')||field(entry,'summary')||
      field(entry,'content:encoded'),650);
    found.set(url,{id:'bluepost:'+url,source:'Official',sourceId:'blue',
      sourceName:'WoW Forever Blue Posts',title,url,publishedAt,author,summary,
      provider:'forever-era-rss',provenance:'Independent tracker; links to Blizzard forums'});
  }
  return [...found.values()].sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,120);
}
export async function fetchBluePosts(fetcher=fetch,now=Date.now()){
  const res=await fetcher(BLUE_RSS,{headers:{
    accept:'application/rss+xml,application/xml;q=0.9,text/xml;q=0.8',
    'user-agent':'AzerothRadar/1.0 (WoW official forum link discovery)'
  },signal:AbortSignal.timeout(12000)});
  if(!res.ok)throw Error('Blue RSS HTTP '+res.status);
  return parseBluePosts(await res.text(),now);
}
export async function synchronizeBluePosts(env,fetcher=fetch,now=Date.now()){
  try{
    const posts=await fetchBluePosts(fetcher,now);
    const stmts=[];
    for(let i=0;i<posts.length;i+=20){
      const part=posts.slice(i,i+20);
      stmts.push(env.DB.prepare('INSERT INTO official(id,payload,last_seen) VALUES '+
        part.map(()=>'(?,?,?)').join(',')+
        ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen')
        .bind(...part.flatMap(p=>[p.id,JSON.stringify(p),now])));
    }
    stmts.push(env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)')
      .bind(now,'blizzard-blue','complete',posts.length,''));
    await env.DB.batch(stmts);
    return {status:'complete',posts:posts.length};
  }catch(e){
    const error=String(e?.message||e).slice(0,180);
    try{await env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)')
      .bind(now,'blizzard-blue','error',0,error).run();}
    catch(dbError){console.error('Blue post scan log failed',dbError);}
    return {status:'error',error};
  }
}
