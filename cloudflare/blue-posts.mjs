/**
 * WoW Forever Blizzard forum blue posts, discovered from The Forever Era's
 * public RSS (an independent tracker, NOT a Blizzard-operated API).
 * Only direct US/EU Blizzard WoW forum links enter the official Stories feed.
 * We also watch staff replies in the long-running EU Development Notes topic.
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

/**
 * Keep important Blizzard announcement threads under direct observation.
 * A September topic can receive a November reply; only the reply's created_at
 * must be subject to the 48-hour freshness window.
 * This is a public forum read; no Blizzard API key or paid model calls.
 */
export const WATCHED_FORUM_TOPICS=Object.freeze([
  {region:'eu',id:631316,host:'eu.forums.blizzard.com',label:'WoW Forever Beta Development Notes',
    json:'https://eu.forums.blizzard.com/en/wow/t/631316.json'}
]);
const STAFF_USERNAMES=new Set(['kaivax','aggrend','nethaera','zorbrix','fwoibles','blizzard']);
export function parseForumTopicReplies(data,topic,now=Date.now()){
  if(!data||typeof data!=='object'||data.id!==topic.id||
     !Array.isArray(data.post_stream?.posts))throw Error('Unexpected Blizzard forum topic response');
  const forumTitle=clean(data.title||topic.label,200);
  if(!/wow\s*forever\s*beta\s*development\s*notes/i.test(forumTitle))throw Error('Unexpected Blizzard forum topic title');
  // Discourse slugs can already contain %-encoded punctuation (e.g. %E2%80%93).
  // Decode and re-encode once; stripping '%' would turn the dash into 'e28093'.
  const rawSlug=String(data.slug||'wow-forever-beta-development-notes').slice(0,180);
  let normalizedSlug=rawSlug;
  try{normalizedSlug=decodeURIComponent(rawSlug);}catch{}
  const slug=encodeURIComponent(normalizedSlug.toLowerCase().replace(/[^a-z0-9\-\u2013\u2014 ]/g,'')
    .trim().replace(/\s+/g,'-').slice(0,140))||'wow-forever-beta-development-notes';
  const results=[];
  for(const post of data.post_stream.posts.slice(-100)){
    const user=String(post?.username||'').toLowerCase().trim();
    const number=Number(post?.post_number);
    const date=Date.parse(post?.created_at||'');
    if(!STAFF_USERNAMES.has(user)||!Number.isInteger(number)||number<=1||
       !Number.isFinite(date)||date>now||now-date>=MAX_AGE)continue;
    const url=verifiedForumUrl('https://'+topic.host+'/en/wow/t/'+slug+'/'+topic.id+'/'+number);
    if(!url)continue;
    const summary=clean(post.cooked||post.raw||'',650);
    results.push({id:'bluepost:forum:'+topic.region+':'+topic.id+':'+number,
      source:'Official',sourceId:'blue',sourceName:'WoW Forever Blue Posts',
      title:forumTitle+' · New update ('+new Date(date).toISOString().slice(0,10)+')',
      url,publishedAt:date,author:post.username,summary,
      provider:'blizzard-forum-thread',provenance:'Direct Blizzard forum staff reply'});
  }
  return results.sort((a,b)=>b.publishedAt-a.publishedAt);
}
export async function fetchForumTopicReplies(fetcher=fetch,now=Date.now()){
  const results=[];
  const failures=[];
  for(const topic of WATCHED_FORUM_TOPICS){
    try{
      const response=await fetcher(topic.json,{headers:{accept:'application/json',
        'user-agent':'AzerothRadar/1.0 (public Blizzard forum updates)'},
        signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Forum topic HTTP '+response.status);
      results.push(...parseForumTopicReplies(await response.json(),topic,now));
    }catch(e){failures.push(topic.region+': '+String(e?.message||e).slice(0,90));}
  }
  if(failures.length===WATCHED_FORUM_TOPICS.length)throw Error(failures.join('; '));
  return results;
}
export async function fetchAllBluePosts(fetcher=fetch,now=Date.now()){
  const inputs=await Promise.allSettled([
    fetchBluePosts(fetcher,now),
    fetchForumTopicReplies(fetcher,now)
  ]);
  const errors=inputs.flatMap((r,i)=>r.status==='rejected'?
    [(i===0?'tracker RSS: ':'Blizzard forum: ')+String(r.reason?.message||r.reason).slice(0,90)]:[]);
  if(inputs.every(r=>r.status==='rejected'))throw Error(errors.join('; '));
  const found=new Map();
  for(const result of inputs)if(result.status==='fulfilled')for(const p of result.value){
    const match=new URL(p.url).pathname.match(/\/631316\/(\d+)\/?$/);
    const key=match?'eu:631316:'+match[1]:p.url;
    const previous=found.get(key);
    if(!previous||p.provider==='blizzard-forum-thread')found.set(key,p);
  }
  return {posts:[...found.values()].sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,120),
    errors,sourceStatus:inputs.map(r=>r.status)};
}

export async function synchronizeBluePosts(env,fetcher=fetch,now=Date.now()){
  try{
    const {posts,errors}=await fetchAllBluePosts(fetcher,now);
    const stmts=[];
    for(let i=0;i<posts.length;i+=20){
      const part=posts.slice(i,i+20);
      stmts.push(env.DB.prepare('INSERT INTO official(id,payload,last_seen) VALUES '+
        part.map(()=>'(?,?,?)').join(',')+
        ' ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen')
        .bind(...part.flatMap(p=>[p.id,JSON.stringify(p),now])));
    }
    stmts.push(env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)')
      .bind(now,'blizzard-blue',errors.length?'partial':'complete',posts.length,errors.join('; ').slice(0,180)));
    await env.DB.batch(stmts);
    return {status:errors.length?'partial':'complete',posts:posts.length,errors};
  }catch(e){
    const error=String(e?.message||e).slice(0,180);
    try{await env.DB.prepare('INSERT INTO scans(at,provider,status,count,error) VALUES(?,?,?,?,?)')
      .bind(now,'blizzard-blue','error',0,error).run();}
    catch(dbError){console.error('Blue post scan log failed',dbError);}
    return {status:'error',error};
  }
}
