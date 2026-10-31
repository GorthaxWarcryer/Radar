'use strict';
const root = document.getElementById('main-view');
const $ = s => document.querySelector(s);
const preferences = { theme: 'azeroth-radar-theme' };
const state = { section: 'hot', kind: 'long', layout: 'list', storyType: 'all', storySort: 'new',
  theme: 'default', demo: location.protocol === 'file:' || document.documentElement.dataset.preview === 'true', feed: null, expanded: new Set(), adminToken: '' };
function esc(value = '') { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function safeURL(x) { try { const url = new URL(String(x || '')); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
function fmt(n) { return Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '—'; }
function age(t) { const dt = Date.now() - Number(t); if (!Number.isFinite(dt) || dt < 0) return 'Recently'; const m = Math.floor(dt/60000); if(m<60) return `${Math.max(1,m)}m ago`; const h = Math.floor(m/60); return h<48 ? `${h}h ago` : `${Math.floor(h/24)}d ago`; }
function time(t) { return Number(t) ? new Date(Number(t)).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Not yet'; }
function titleLink(t,url,cl) { const u=safeURL(url); return u ? `<a class="${cl}" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : `<span class="${cl}">${esc(t)}</span>`; }
function toast(message) { const t=$('#toast'); t.textContent=message; t.classList.add('visible'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.classList.remove('visible'),3200); }
function btnSegment(options, selected, key) { return `<div class="segment" role="group">${options.map(o=>`<button data-${key}="${o.id}" class="${selected===o.id?'active':''}" aria-pressed="${selected===o.id}">${esc(o.text)}</button>`).join('')}</div>`; }
function sectionTitle(kicker,title,description,pulse = '') { return `<div class="section-header"><div><div class="hero-kicker">${esc(kicker)}</div><h1>${title}</h1><p class="section-description">${esc(description)}</p></div>${pulse?`<div class="pulse">${pulse}</div>`:''}</div>`; }
function statCards(data) {
  const x = data.summary || {};
  const values = [ ['ELIGIBLE VIDEOS',fmt(x.eligibleVideos||0)], ['FRESH STORIES',fmt(x.freshStories||0)], ['CONTENT IDEAS',fmt(x.ideas||0)], ['LAST SCAN',x.lastScan ? age(x.lastScan) : 'Not yet'] ];
  return `<div class="stats">${values.map(([label,value])=>`<div class="stat"><span class="stat-label">${label}</span><strong class="stat-value">${esc(value)}</strong></div>`).join('')}</div>`;
}
function empty(title,desc,tryDemo=true) { return `<div class="empty"><div class="empty-icon">◉</div><h3>${esc(title)}</h3><p>${esc(desc)}</p>${tryDemo && !state.demo?'<button class="empty-action" data-show-demo="1">Preview the layout with sample data</button>':''}</div>`; }
function saveButton(v, kind, data) {
  if(state.demo) return '';
  const saved = (data.saved || []).some(s=>String(s.id)===String(v.id));
  return `<button class="bookmark ${saved?'saved':''}" data-save="${esc(v.id)}" data-kind="${esc(kind)}" data-title="${esc(v.title)}" data-url="${esc(v.url||'')}" title="${saved?'Saved':'Save'}" aria-label="Save ${esc(v.title)}">${saved?'★':'☆'}</button>`;
}
function thumbnail(v) {
  const u=safeURL(v.thumbnail);
  return `<div class="thumb">${u?`<img src="${esc(u)}" loading="lazy" alt="Video thumbnail" referrerpolicy="no-referrer" />`:'<span class="thumb-glyph">WOW</span>'}</div>`;
}
function renderVideo(v, data) {
  const isHot=state.section==='hot';
  const metric = isHot ? `${fmt(v.growth?.perHour)}<small>views / hr</small>` : `${fmt(v.views)}<small>total views</small>`;
  const content = `<div class="video-copy">${titleLink(v.title,v.url,'video-title')}<div class="video-channel">${esc(v.channelName||'YouTube creator')}</div><div class="video-bottom"><span class="video-number">${metric}</span>${saveButton(v,'video',data)}</div><div class="video-time">${age(v.publishedAt)} ${isHot&&v.growth?.kind==='estimated-since-upload'?' · Estimated since upload':isHot&&v.growth?.sampleHours?` · Measured over ${v.growth.sampleHours}h`:''}</div></div>`;
  return state.layout==='preview' ? `<article class="video-card">${thumbnail(v)}${content}</article>` : `<article class="video-item">${thumbnail(v)}${content}</article>`;
}
function videoBoard(title,sub,items,data) {
  return `<section class="panel"><div class="board-title"><h2>${esc(title)}<small>${esc(sub)}</small></h2><span class="count">${items.length}</span></div>${items.length?`<div class="${state.layout==='preview'?'card-grid':'video-list'}" style="${state.layout==='preview'?'padding:12px':''}">${items.map(v=>renderVideo(v,data)).join('')}</div>`:empty(state.section==='hot'?'No HOT videos yet':'No qualifying videos yet',state.section==='hot'?'New uploads enter HOT using average views/hour since publication; later real observations update that rate.':'Connect YouTube sources or import a verified feed. Qualifying videos need at least 5,000 views.')}</section>`;
}
function videoSection(data,mode) {
  const isHot=mode==='hot'; const pool=data[mode]?.[state.kind]||[];
  const fresh=pool.filter(v=>Date.now()-Number(v.publishedAt)<24*3600000);
  const tracked=pool.filter(v=>Date.now()-Number(v.publishedAt)>=24*3600000);
  const desc=isHot?'New videos start with estimated views per hour since upload; later scans replace estimates with measured growth.':'Most-watched qualifying videos ranked by lifetime TOTAL views, not views gained. Minimum 5,000 views; archived livestreams are excluded.';
  return sectionTitle('YouTube Intelligence',isHot?'<span>HOT</span> RIGHT NOW':'WHAT’S <span>POPULAR</span>',desc,
    '<i class="status-dot"></i> LAST 48 HOURS')+
    statCards(data)+`<div class="toolbar"><div class="toolbar-left">${btnSegment([{id:'long',text:'Long Form'},{id:'shorts',text:'Shorts'}],state.kind,'kind')}<span class="toolbar-note">${pool.length} qualifying videos</span></div><div class="toolbar-right">${btnSegment([{id:'list',text:'☷ List'},{id:'preview',text:'▦ Preview'}],state.layout,'layout')}</div></div>`+
    (isHot?'<div class="info-note"><strong>HOT growth:</strong> Initial average since publication is labeled estimated; later snapshots produce measured views per hour. Last observation time matters.</div>':'')+
    `<div class="section-split">${videoBoard('New uploads','Published within the last 24 hours',fresh,data)}${videoBoard('Tracked · 48 Hours','Published 24–48 hours ago',tracked,data)}</div>`;
}
function renderStory(s,data) {
  const official = s.source==='Official';
  const metrics=official?'':`<span>▲ ${s.score === null || s.score === undefined ? '—' : fmt(s.score)}</span><span>◷ ${s.comments === null || s.comments === undefined ? '—' : fmt(s.comments)} comments</span>`;
  return `<article class="story-card"><div class="story-top"><span class="source-chip ${official?'official':''}">${official?'Official Source':esc('r/'+(s.subreddit||'wow'))}</span><span class="story-time">${age(s.publishedAt)}</span></div>${titleLink(s.title,s.url,'story-title')}<p class="story-summary">${esc(s.summary || (official?'Official update or blue post':'Reddit discussion currently qualifying for Top/Today or Hot.'))}</p><div class="story-bottom">${metrics}${official?`<span>${esc(s.sourceId==='blue'?((s.author?s.author+' · ':'')+'Blizzard forum · via independent tracker'):(s.sourceName||'Blizzard / official update'))}</span>`:''}${saveButton(s,'story',data)}</div></article>`;
}
function storiesSection(data) {
  let stories=(data.stories||[]).filter(s=>state.storyType==='all'||(state.storyType==='official'?s.source==='Official':s.source!=='Official'));
  if(state.storySort==='score') stories.sort((a,b)=>(b.score??-1)-(a.score??-1));
  else if(state.storySort==='comments') stories.sort((a,b)=>(b.comments??-1)-(a.comments??-1));
  else stories.sort((a,b)=>b.publishedAt-a.publishedAt);
  return sectionTitle('Community & Official', 'LATEST <span>STORIES</span>', 'Official blue posts and current Reddit Top/Today or Hot discoveries. Fresh sources only, up to 48 hours old.') +
    `<div class="toolbar"><div class="toolbar-left">${btnSegment([{id:'all',text:'All'},{id:'reddit',text:'Reddit'},{id:'official',text:'Official'}],state.storyType,'story-type')}</div><div class="toolbar-right">${btnSegment([{id:'new',text:'Newest'},{id:'score',text:'Top score'},{id:'comments',text:'Most comments'}],state.storySort,'story-sort')}</div></div>`+
    (stories.length?`<div class="stories-grid">${stories.map(s=>renderStory(s,data)).join('')}</div>`:empty('No fresh stories', 'Reddit requires approved API access and successful Top/Today or Hot listing checks. Blizzard news and blue posts are collected hourly when their sources are reachable. Check Channels or Scan Activity for any source errors.'));
}
function ideaCard(item,i,data) {
  const open=state.expanded.has(item.id);
  return `<article class="idea-card"><div class="idea-top"><span class="idea-index">${String(i+1).padStart(2,'0')}</span><span class="idea-format">${esc(item.format||'Analysis')}</span><span class="priority ${item.priority==='High'?'':'watch'}">${esc(item.priority||'Watch')}</span></div><h2 class="idea-title">${esc(item.title)}</h2><p class="idea-summary">${esc(item.summary||'')}</p><div class="idea-proposed"><span class="eyebrow">PROPOSED VIDEO TITLE</span><p>${esc(item.proposedTitle||item.title)}</p></div><div class="expand"><button data-expand="${esc(item.id)}">${open?'− Hide outline':'+ View content outline'}</button>${safeURL(item.sourceUrl)?`<a class="small-link" href="${esc(safeURL(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">SOURCE ↗</a>`:''}</div>${open?`<div class="idea-details"><strong>Angle</strong><div>${esc(item.angle||'')}</div><strong>Outline</strong><ol>${(item.outline||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ol><strong>Source: </strong>${esc(item.sourceType||'')} · ${age(item.publishedAt)}</div>`:''}</article>`;
}
function ideasSection(data) {
  const ideas=data.contentCreation?.items||[];
  return sectionTitle('Research to production','CONTENT <span>CREATION</span>', 'Evidence-linked topics and potential video angles. Verify original sources before making factual claims.') +
    `<div class="info-note"><strong>Creator workflow:</strong> Prioritize rising or popular sources, avoid recycled recaps, and develop a test, comparison, counterargument, or useful player decision. Suggestions are starting points—not verified gameplay conclusions.</div>`+
    (ideas.length?`<div class="ideas-grid">${ideas.map((x,i)=>ideaCard(x,i,data)).join('')}</div>`:empty('No eligible content briefs yet','Ideas are built from recent eligible YouTube videos and fresh Reddit/official stories. Connect or import feeds to populate this section.'));
}
function watchlistSection(data) {
  const saved=data.saved||[];
  if(data.savedPrivate) return sectionTitle('Your workspace','SAVED <span>WATCHLIST</span>','Private bookmarks and notes require the dashboard administrator token.')+`<section class="panel">${empty('Private watchlist locked','Unlock your saved notes with the rebuild’s administrator token.',false)}<div style="text-align:center;padding-bottom:27px"><button class="subtle-btn" data-unlock="1">Unlock watchlist</button></div></section>`;
  return sectionTitle('Your workspace','SAVED <span>WATCHLIST</span>','Keep references and editorial notes in the rebuild’s local SQLite database. Original Sites bookmarks have not been transferred.') +
    (saved.length?`<section class="panel"><table class="saved-table"><thead><tr><th>Saved source</th><th>Note</th><th>Actions</th></tr></thead><tbody>${saved.map(s=>`<tr><td>${titleLink(s.title,s.url,'')}<div class="video-time">${esc(s.kind)} · ${time(s.savedAt)}</div></td><td><textarea aria-label="Note for ${esc(s.title)}" id="note-${esc(s.id)}" data-note="${esc(s.id)}">${esc(s.note||'')}</textarea></td><td><button class="small-action" data-note-save="${esc(s.id)}">Save note</button> <button class="small-action" data-remove="${esc(s.id)}">Remove</button></td></tr>`).join('')}</tbody></table></section>`:empty('No saved sources','Save a qualifying video, Reddit discussion, or official post to build your research watchlist.'));
}
function channelsSection(data) {
  const ch=data.channels||[], status=data.sources||{}, official=data.officialSources||[];
  const youtube=`<section class="panel"><div class="board-title"><h2>Connected YouTube sources</h2><span class="status-pill ${status.youtube==='error'?'error':status.youtube==='not_configured'?'off':''}">${esc(status.youtube||'Not configured')}</span></div>${ch.length?ch.map(c=>`<div class="channel-card"><div class="channel-avatar">▶</div><div class="channel-detail"><h3>${esc(c.title)}</h3><p>${esc(c.id)} · ${esc(c.handle||'')}</p></div><span class="status-pill">Tracked</span></div>`).join(''):empty('No channel configuration','YouTube is monitored by the independent GitHub scanner. Channels are configured through GitHub Actions secrets, not this browser.')}</section>`;
  const officialRows=official.map(src=>{
    const linked=safeURL(src.url);
    const label=src.status==='complete'?'TRACKING':src.status==='error'?'ERROR':'WAITING FOR FIRST SCAN';
    const statusClass=src.status==='error'?'error':src.status==='complete'?'':'off';
    return `<div class="channel-card official-channel"><div class="channel-avatar official-avatar">✦</div><div class="channel-detail"><h3>${esc(src.title)}</h3><p>${esc(src.description||'Blizzard official announcements')}</p><div class="source-metadata">${fmt(src.posts48h||0)} posts in last 48h · ${src.lastChecked?'Checked '+age(src.lastChecked):'First scan pending'}${src.latestPostAt?' · Latest post '+age(src.latestPostAt):''}</div>${src.error?`<div class="source-error">${esc(src.error)}</div>`:''}${linked?`<a class="source-link" href="${esc(linked)}" target="_blank" rel="noopener noreferrer">View official source ↗</a>`:''}</div><span class="status-pill ${statusClass}">${label}</span></div>`;
  }).join('');
  return sectionTitle('YouTube & Blizzard sources','TRACKED <span>CHANNELS</span>','Monitor creators and official World of Warcraft announcements. Official Blizzard posts automatically feed into Stories.')+
    youtube+
    `<section class="panel" style="margin-top:20px"><div class="board-title"><h2>Official World of Warcraft sources</h2><span class="status-pill ${status.official==='error'?'error':status.official==='pending'?'off':''}">${esc(status.official||'Pending')}</span></div>${official.length?officialRows:empty('Official sources not configured','Blizzard feeds are available on Cloudflare deployments after the next official news sync.')}</section>`+
    `<div class="info-note" style="margin-top:20px"><strong>Official posts:</strong> Azeroth Radar checks Blizzard news every hour and discovers WoW Forever blue posts using an independent RSS tracker. Forum posts link directly to Blizzard. Both run overnight; X/Twitter posts are not yet connected.</div>`;
}
function activitySection(data) {
  const scans=data.scans||[], sources=data.sources||{};
  return sectionTitle('System health','SCAN <span>ACTIVITY</span>','Provider results, errors, and hourly refresh history from this rebuilt project.')+
    `<div class="toolbar"><div class="toolbar-left"><span class="status-pill ${sources.youtube==='error'?'error':sources.youtube==='not_configured'?'off':''}">YouTube: ${esc(sources.youtube||'n/a')}</span><span class="status-pill ${sources.reddit==='error'?'error':sources.reddit==='not_configured'?'off':''}">Reddit: ${esc(sources.reddit||'n/a')}</span><span class="status-pill ${sources.official==='error'?'error':sources.official==='not_configured'?'off':''}">Official: ${esc(sources.official||'n/a')}</span></div><button class="subtle-btn" data-scan-now="1">↻ Scan now</button></div>`+
    `<div class="info-note"><strong>Incremental scanning:</strong> Official Blizzard feeds are checked hourly even overnight. YouTube's separate Cloudflare sync runs from 05:00–20:00 Kyiv time; a normal progress state is not a scan failure. ${data.scanProgress?`YouTube: ${fmt(data.scanProgress.queuedVideos||0)} queued videos; channel ${fmt((data.scanProgress.nextChannel||0)+1)} of ${fmt(data.scanProgress.totalChannels||0)}.`:''}</div>`+
    (scans.length?`<section class="panel"><table class="saved-table"><thead><tr><th>Provider</th><th>Result</th><th>Time / details</th></tr></thead><tbody>${scans.map(s=>`<tr><td><strong>${esc(s.provider)}</strong></td><td><span class="status-pill ${s.status==='error'?'error':s.status==='not_configured'?'off':''}">${esc(s.status)} · ${fmt(s.count)} items</span></td><td>${time(s.at)}${s.error?`<div class="video-time" title="${esc(s.error)}">${esc(s.error)}</div>`:''}</td></tr>`).join('')}</tbody></table></section>`:empty('No scans recorded yet',"Blizzard's official news is checked hourly, including overnight; YouTube discovery uses its separate GitHub schedule."));
}
const DEMO_AGE=Date.now();
function demoData() {
  const t=DEMO_AGE; const video = (id,title,channel,views,hours,kind,gain) => ({ id:`demo-${id}`,title,channelName:channel,views,publishedAt:t-hours*3600000,kind,thumbnail:'',url:'',growth:gain?{perHour:gain,sampleHours:4}:null });
  const longs=[
    video('l1','The New WoW Forever Patch Changes Everything','Example Creator',284600,3,'long',12500),
    video('l2','Protection Warrior: Testing The Latest Talent Tree','Example PvP Channel',184200,7,'long',7400),
    video('l3','First Look at the New Dungeon and Boss Mechanics','Example Guides',156800,19,'long',5100),
    video('l4','Racial Balance — What Actually Matters?','Example Podcast',112600,29,'long',2700),
    video('l5','Paladin Changes After The Latest Balance Pass','Example Creator',92500,41,'long',1400)
  ];
  const shorts=[
    video('s1','A Surprise in Stormwind','Example Clips',194000,5,'shorts',9200),
    video('s2','Protection Warrior Trick You Might Have Missed','Example Clips',77300,27,'shorts',3800),
    video('s3','This Dungeon Boss Mechanic Is Wild','Example Shorts',64000,16,'shorts',2900)
  ];
  const story=(id,title,source,hours,score,comments,summary) => ({id:`demo-story-${id}`,title,source,subreddit:'wowforever',publishedAt:t-hours*3600000,score,comments,summary,url:''});
  const stories=[
    story('r1','Players are discussing the new Warrior balance changes','Reddit',2,1040,241,'Illustrative Reddit discussion describing feedback on class performance.'),
    story('b1','Developer update: class tuning and racial abilities','Official',4,null,null,'Illustrative summary of an official development post.'),
    story('r2','What should the next dungeon update focus on?','Reddit',8,746,181,'Illustrative player discussion about dungeon pacing and mechanics.'),
    story('r3','The latest PvP tournament meta discussion','Reddit',12,511,137,'Illustrative community reaction to shifting player choices.'),
    story('b2','Development notes: upcoming interface adjustments','Official',21,null,null,'Illustrative preview of interface update notes.'),
    story('r4','Thoughts on the most recent Paladin adjustment','Reddit',33,308,78,'Illustrative player feedback and differing opinions.')
  ];
  const topics=[...longs,...shorts,...stories].map((item,i)=>({id:`demo-idea-${i}`,title:item.title,summary:'Illustrative creator briefing. Combine direct evidence with a gameplay test, a counterargument, and actionable takeaways.',
    proposedTitle:i%2===0?`The BIG Question About ${item.title.replace(/[!?]+$/,'')}`:`What Everyone Is Missing About ${item.title.replace(/[!?]+$/,'')}`,
    angle:'Compare the claim with tested gameplay outcomes, highlight trade-offs and avoid unverified conclusions.',outline:['What sparked the conversation','Evidence from the original source','How to test the claim','Implications for different players','Conclusion and follow-up'],format:i%3===0?'Gameplay test':'Reaction + analysis',priority:i<3?'High':'Watch',sourceType:item.source||'YouTube',publishedAt:item.publishedAt,sourceUrl:''}));
  return { isDemo:true, generatedAt:t, summary:{eligibleVideos:longs.length+shorts.length,freshStories:stories.length,ideas:topics.length,lastScan:t-15*60000},
    popular:{long:longs,shorts},hot:{long:longs.filter(v=>v.growth).sort((a,b)=>b.growth.perHour-a.growth.perHour),shorts:shorts.filter(v=>v.growth).sort((a,b)=>b.growth.perHour-a.growth.perHour)},
    stories,contentCreation:{items:topics},saved:[],channels:[{id:'demo-channel',title:'Example Creator',handle:'@example'}],scans:[{at:t-15*60000,provider:'youtube',status:'demo',count:8,error:''}],sources:{youtube:'demo',reddit:'demo',official:'demo'} };
}
function updateTheme() { document.body.dataset.theme='default'; }
function updateNav() {
  document.querySelectorAll('[data-section]').forEach(el=>{ const selected=el.dataset.section===state.section; el.classList.toggle('active',selected); if(el.tagName==='BUTTON') el.setAttribute('aria-current',selected?'page':'false'); });
  const names={popular:'Popular',hot:'HOT',stories:'Stories',ideas:'Content Creation',watchlist:'Watchlist',channels:'Channels',activity:'Scan Activity'};
  $('#crumb-section').textContent=names[state.section]; document.title=`${names[state.section]} · Azeroth Radar`;
}
function render() {
  updateTheme();updateNav();
  const data=state.demo?demoData():state.feed;
  $('#demo-warning').classList.toggle('hidden',!state.demo);
  $('#demo-toggle').textContent=state.demo?'Live feed':'Preview demo';
  if(!data) {root.innerHTML=empty('Loading Azeroth Radar','Reading the local API and its saved sources...',false);return;}
  const renderers={popular:()=>videoSection(data,'popular'),hot:()=>videoSection(data,'hot'),stories:()=>storiesSection(data),ideas:()=>ideasSection(data),watchlist:()=>watchlistSection(data),channels:()=>channelsSection(data),activity:()=>activitySection(data)};
  root.innerHTML=renderers[state.section]();
}
async function fetchFeed() {
  if (location.protocol === 'file:' || document.documentElement.dataset.preview === 'true') {
    $('#sync-label').textContent = 'Illustrative preview — no live connection';
    $('#connection-label').textContent = 'Preview only';
    render();
    return;
  }
  try { const res=await fetch('/api/feed',{cache:'no-store',headers:state.adminToken?{'X-Admin-Token':state.adminToken}:{}}); if(!res.ok) throw new Error('Feed HTTP '+res.status);
    state.feed=await res.json(); const sources=state.feed.sources||{};
    $('#sync-label').textContent=state.feed.summary?.lastScan?`Updated ${age(state.feed.summary.lastScan)}`:'No scans yet';
    $('#connection-label').textContent=Object.values(sources).some(x=>x==='complete')?'Feed source connected':'Configure data sources';
  } catch(error) { state.feed={popular:{long:[],shorts:[]},hot:{long:[],shorts:[]},stories:[],contentCreation:{items:[]},summary:{},saved:[],channels:[],scans:[],sources:{}};
    $('#sync-label').textContent='API unavailable'; toast(`Feed error: ${error.message}`);
  }
  render();
}
async function adminFetch(url, options={}) {
  const go=async()=>fetch(url,{...options,headers:{'Content-Type':'application/json',...(state.adminToken?{'X-Admin-Token':state.adminToken}:{}),...(options.headers||{})}});
  let res=await go();
  if(res.status===401) { const token=window.prompt('Enter the rebuild server ADMIN_TOKEN (kept in memory for this tab only):'); if(!token) throw new Error('Authorization required'); state.adminToken=token; res=await go(); }
  const response=await res.json(); if(!res.ok) throw new Error(response.error||`HTTP ${res.status}`); return response;
}
function moveSection(section) {state.section=section; window.location.hash=section; render(); window.scrollTo({top:0,behavior:'smooth'});}
document.addEventListener('click',async e=>{
  const button=e.target.closest('button'); if(!button) return;
  try {
    if(button.dataset.section) return moveSection(button.dataset.section);
    if(button.dataset.kind) {state.kind=button.dataset.kind;return render();}
    if(button.dataset.layout) {state.layout=button.dataset.layout;return render();}
    if(button.dataset.storyType) {state.storyType=button.dataset.storyType;return render();}
    if(button.dataset.storySort) {state.storySort=button.dataset.storySort;return render();}
    if(button.dataset.expand) {const id=button.dataset.expand; if(state.expanded.has(id))state.expanded.delete(id);else state.expanded.add(id);return render();}
    if(button.dataset.showDemo||button.id==='demo-toggle'||button.id==='exit-demo') {state.demo=button.id==='exit-demo'?false:!state.demo; return render();}
    if(button.dataset.unlock) {const token=window.prompt('Enter the rebuild ADMIN_TOKEN:'); if(token){state.adminToken=token;await fetchFeed();} return;}
    if(button.dataset.save) {await adminFetch('/api/save',{method:'POST',body:JSON.stringify({id:button.dataset.save,kind:button.dataset.kind,title:button.dataset.title,url:button.dataset.url})});toast('Saved to watchlist');return fetchFeed();}
    if(button.dataset.remove) {await adminFetch('/api/save/'+encodeURIComponent(button.dataset.remove),{method:'DELETE'});toast('Removed from watchlist');return fetchFeed();}
    if(button.dataset.noteSave) { const id=button.dataset.noteSave;const note=[...document.querySelectorAll('[data-note]')].find(el=>el.dataset.note===id)?.value||'';
      const item=(state.feed?.saved||[]).find(s=>s.id===id); if(!item)return;await adminFetch('/api/save',{method:'POST',body:JSON.stringify({id,kind:item.kind,title:item.title,url:item.url,note})});toast('Note saved');return fetchFeed(); }
    if(button.dataset.scanNow){button.disabled=true;button.textContent='Scanning…'; const resp=await adminFetch('/api/scan',{method:'POST'});toast(resp.status==='busy'?'Scan already running':resp.status==='running'?'Scan started in background; open Scan Activity for progress.':'Scan result: '+resp.status);return fetchFeed();}
  } catch(error) {toast(error.message);} finally {if(button?.dataset.scanNow){button.disabled=false;button.textContent='↻ Scan now';}}
});
window.addEventListener('hashchange',()=>{const page=location.hash.replace('#','');if(['popular','hot','stories','ideas','watchlist','channels','activity'].includes(page)){state.section=page;render();}});
if(location.hash) {const page=location.hash.slice(1);if(['popular','hot','stories','ideas','watchlist','channels','activity'].includes(page))state.section=page;}
render();fetchFeed();setInterval(fetchFeed,60000);
