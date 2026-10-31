'use strict';
const root = document.getElementById('main-view');
const $ = s => document.querySelector(s);
const preferences = { theme: 'azeroth-radar-theme' };
const state = { section: 'hot', kind: 'long', layout: 'list', storyType: 'all', storySort: 'new', searchTerm:'', viewWindow:'48', sortVideos:'views', researchStatus:'all',
  theme: 'default', demo: location.protocol === 'file:' || document.documentElement.dataset.preview === 'true', feed: null, expanded: new Set(), adminToken: '' };
function esc(value = '') { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])); }
function safeURL(x) { try { const url = new URL(String(x || '')); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; } }
function fmt(n) { return Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US') : '—'; }
function age(t) { const dt = Date.now() - Number(t); if (!Number.isFinite(dt) || dt < 0) return 'Recently'; const m = Math.floor(dt/60000); if(m<60) return `${Math.max(1,m)}m ago`; const h = Math.floor(m/60); return h<48 ? `${h}h ago` : `${Math.floor(h/24)}d ago`; }
function storyAge(t) { const dt = Date.now() - Number(t); if (Number.isFinite(dt) && dt >= 86400000) { const days=Math.floor(dt/86400000); return `${days} day${days===1?'':'s'} ago`; } return age(t); }
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
  const content = `<div class="video-copy">${titleLink(v.title,v.url,'video-title')}<div class="video-channel-row"><span class="video-channel">${esc(v.channelName||'YouTube creator')}</span>${v.officialSource?'<span class="source-chip official video-official-badge">Official Source</span>':''}</div><div class="video-bottom"><span class="video-number">${metric}</span>${saveButton(v,'video',data)}${data.canManage?`<button class="small-action" data-hide-video="${esc(v.id)}" title="Hide this video from Radar">Hide</button>`:''}</div><div class="video-time">${age(v.publishedAt)} ${isHot&&v.growth?.kind==='estimated-since-upload'?' · Estimated since upload':isHot&&v.growth?.sampleHours?` · Measured over ${v.growth.sampleHours}h`:''}</div></div>`;
  return state.layout==='preview' ? `<article class="video-card">${thumbnail(v)}${content}</article>` : `<article class="video-item">${thumbnail(v)}${content}</article>`;
}
function videoBoard(title,sub,items,data) {
  return `<section class="panel"><div class="board-title"><h2>${esc(title)}<small>${esc(sub)}</small></h2><span class="count">${items.length}</span></div>${items.length?`<div class="${state.layout==='preview'?'card-grid':'video-list'}" style="${state.layout==='preview'?'padding:12px':''}">${items.map(v=>renderVideo(v,data)).join('')}</div>`:empty(state.section==='hot'?'No HOT videos yet':'No qualifying videos yet',state.section==='hot'?'New uploads enter HOT using average views/hour since publication; later real observations update that rate.':'Connect YouTube sources or import a verified feed. Qualifying videos need at least 5,000 views.')}</section>`;
}
function videoSection(data,mode) {
  const isHot=mode==='hot'; const source=data[mode]?.[state.kind]||[];
  let pool=source.filter(v=>!state.searchTerm||(String(v.title||'')+' '+String(v.channelName||v.channel||'')).toLowerCase().includes(state.searchTerm.toLowerCase()));
  if(!isHot&&state.viewWindow==='24')pool=pool.filter(v=>Date.now()-Number(v.publishedAt)<24*3600000);
  if(state.sortVideos==='newest')pool=[...pool].sort((a,b)=>b.publishedAt-a.publishedAt);
  else if(state.sortVideos==='velocity')pool=[...pool].sort((a,b)=>(b.growth?.perHour||0)-(a.growth?.perHour||0));
  else if(!isHot)pool=[...pool].sort((a,b)=>b.views-a.views);
  const fresh=pool.filter(v=>Date.now()-Number(v.publishedAt)<24*3600000);
  const tracked=pool.filter(v=>Date.now()-Number(v.publishedAt)>=24*3600000);
  const desc=isHot?'New videos start with estimated views per hour since upload; later scans replace estimates with measured growth.':'Most-watched qualifying videos ranked by lifetime TOTAL views, not views gained. Minimum 5,000 views; archived livestreams are excluded.';
  return sectionTitle('YouTube Intelligence',isHot?'<span>HOT</span> RIGHT NOW':'WHAT’S <span>POPULAR</span>',desc,
    '<i class="status-dot"></i> LAST 48 HOURS')+
    statCards(data)+`<div class="toolbar"><div class="toolbar-left">${btnSegment([{id:'long',text:'Long Form'},{id:'shorts',text:'Shorts'}],state.kind,'kind')}<span class="toolbar-note">${pool.length} qualifying videos</span></div><div class="toolbar-right">${btnSegment([{id:'list',text:'☷ List'},{id:'preview',text:'▦ Preview'}],state.layout,'layout')}</div></div>`+
    `<div class="toolbar" style="flex-wrap:wrap"><div class="toolbar-left"><input id="video-filter" aria-label="Search video titles and channels" placeholder="Search videos or channels" value="${esc(state.searchTerm)}" style="max-width:250px;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px"><button class="subtle-btn" data-apply-search="1">Search</button><button class="subtle-btn" data-clear-search="1">Clear</button></div><div class="toolbar-right">${!isHot?btnSegment([{id:'24',text:'24h'},{id:'48',text:'48h'}],state.viewWindow,'window'):''}${btnSegment([{id:'views',text:'Views'},{id:'newest',text:'Newest'},{id:'velocity',text:'Growth'}],state.sortVideos,'video-sort')}</div></div>`+
        (isHot?'<div class="info-note"><strong>HOT growth:</strong> Initial average since publication is labeled estimated; later snapshots produce measured views per hour. Last observation time matters.</div>':'')+
    `<div class="section-split">${videoBoard('New uploads','Published within the last 24 hours',fresh,data)}${(!isHot&&state.viewWindow==='48'?videoBoard('Tracked · 48 Hours','Published 24–48 hours ago',tracked,data):'')}</div>`;
}
const REDDIT_LOCAL_KEY="azeroth-radar-reddit-picks-v1";
const REDDIT_COMMUNITIES=[{"slug":"wowforever","label":"WoW Forever","note":"Forever beta, class balance, launches and community reaction"},{"slug":"classicwow","label":"WoW Classic","note":"Classic and Forever discussions, gameplay and community news"},{"slug":"wow","label":"World of Warcraft","note":"Broader WoW announcements, reactions and player discussions"},{"slug":"wowhardcore","label":"WoW Hardcore","note":"Hardcore experiences, challenges and community debate"},{"slug":"worldofpvp","label":"WoW PvP","note":"Arena meta, PvP balance and competitive discussion"}];
function redditPostUrl(raw) {
  try {
    const u=new URL(String(raw||"").trim());
    if(u.protocol!=="https:")return "";
    if(u.hostname==="redd.it" && /^\/[a-z0-9]+\/?$/i.test(u.pathname)){u.search="";u.hash="";return u.href;}
    if(!["reddit.com","www.reddit.com","old.reddit.com","new.reddit.com"].includes(u.hostname))return "";
    if(!/^\/r\/[a-z0-9_]+\/comments\/[a-z0-9]+(?:\/|$)/i.test(u.pathname))return "";
    u.search="";u.hash="";u.hostname="www.reddit.com";return u.href;
  } catch {return "";}
}

function redditSaved() {
  try {
    const raw=JSON.parse(localStorage.getItem(REDDIT_LOCAL_KEY)||"[]");
    if(!Array.isArray(raw))return [];
    return raw.filter(x=>x&&typeof x.title==="string"&&x.title.trim()&&redditPostUrl(x.url))
      .slice(0,60).map(x=>({url:redditPostUrl(x.url),title:String(x.title).slice(0,180),savedAt:Number(x.savedAt)||Date.now()}));
  } catch {return [];}
}

function redditDirectory() {
  const cards=REDDIT_COMMUNITIES.map(c=>{
    const root="https://www.reddit.com/r/"+c.slug+"/";
    const top=root+"top/?t=day";
    const hot=root+"hot/";
    const comments=root+"search/?q=&restrict_sr=1&sort=comments&t=day";
    return `<article class="reddit-community"><div class="reddit-community-head"><div class="reddit-community-icon">r/</div><div><a class="reddit-community-name" href="${root}" target="_blank" rel="noopener noreferrer">r/${esc(c.slug)} ↗</a><p>${esc(c.note)}</p></div></div><div class="reddit-links"><a href="${top}" target="_blank" rel="noopener noreferrer" aria-label="Top posts today in r/${esc(c.slug)}">Top today ↗</a><a href="${hot}" target="_blank" rel="noopener noreferrer" aria-label="Hot posts in r/${esc(c.slug)}">Hot ↗</a><a href="${comments}" target="_blank" rel="noopener noreferrer" aria-label="Comment-count search in r/${esc(c.slug)}" title="Reddit search ordered by comment count (past 24h), subject to Reddit search availability">Most comments ↗</a></div></article>`;
  }).join("");
  const saved=redditSaved();
  const selections=saved.length?saved.map((s,i)=>`<article class="reddit-saved"><div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" class="story-title">${esc(s.title)} ↗</a><div class="reddit-saved-date">Added ${storyAge(s.savedAt)} · Saved on this device</div></div><button class="small-action" data-reddit-remove="${i}" aria-label="Remove ${esc(s.title)}">Remove</button></article>`).join(""):`<div class="reddit-saved-empty">No discussions saved yet. Copy a Reddit post link here after finding an active discussion.</div>`;
  return `<section class="reddit-hub"><div class="reddit-hub-header"><div><h2>REDDIT <span>DISCOVERY</span></h2><p>Open public subreddit rankings directly on Reddit. Scores, upvotes, comments and freshness are displayed on Reddit, not automatically collected by Azeroth Radar.</p></div><span class="reddit-noapi">NO REDDIT API</span></div><div class="reddit-community-grid">${cards}</div><p class="reddit-fineprint">Top today covers Reddit's past-day ranking. Hot is Reddit's current ranking. Most comments opens Reddit's day-filtered comment-count search, which may depend on Reddit's search availability.</p></section><section class="reddit-manual panel"><h2>Save a discussion to Stories</h2><p>Found a useful post? Add its title and Reddit URL below. Saved links remain only in this browser and are not shared with other devices or scanned automatically.</p><form id="reddit-add-form" class="reddit-form"><input id="reddit-post-url" type="url" required maxlength="500" placeholder="https://www.reddit.com/r/.../comments/..." aria-label="Reddit discussion URL" /><input id="reddit-post-title" type="text" required maxlength="180" placeholder="Discussion title" aria-label="Discussion title"/><button type="submit">Add discussion</button></form><div class="reddit-saved-header"><h3>Saved discussions</h3><span class="count">${saved.length}</span></div><div class="reddit-saved-list">${selections}</div></section>`;
}

function renderStory(s,data) {
  const official = s.source==='Official';
  const metrics=official?'':`<span>▲ ${s.score === null || s.score === undefined ? '—' : fmt(s.score)}</span><span>◷ ${s.comments === null || s.comments === undefined ? '—' : fmt(s.comments)} comments</span>`;
  return `<article class="story-card"><div class="story-top"><span class="source-chip ${official?'official':''}">${official?'Official Source':esc('r/'+(s.subreddit||'wow'))}</span><span class="story-time">${storyAge(s.publishedAt)}</span></div>${titleLink(s.title,s.url,'story-title')}<p class="story-summary">${esc(s.summary || (official?'Official update or blue post':'Reddit discussion currently qualifying for Top/Today or Hot.'))}</p><div class="story-bottom">${metrics}${official?`<span>${esc(s.sourceId==='blue'?((s.author?s.author+' · ':'')+'Blizzard forum · via independent tracker'):(s.sourceName||'Blizzard / official update'))}</span>`:''}${saveButton(s,'story',data)}</div></article>`;
}
function storiesSection(data) {
  const all=data.stories||[];
  const showReddit=state.storyType!=="official";
  const showOfficial=state.storyType!=="reddit";
  const order=arr=>{
    const items=[...arr];
    if(state.storySort==="score")items.sort((a,b)=>(b.score??-1)-(a.score??-1));
    else if(state.storySort==="comments")items.sort((a,b)=>(b.comments??-1)-(a.comments??-1));
    else items.sort((a,b)=>b.publishedAt-a.publishedAt);
    return items;
  };
  const previous=showReddit?order(all.filter(s=>s.source!=="Official")):[];
  const official=showOfficial?order(all.filter(s=>s.source==="Official")):[];
  const storyTool=btnSegment([{id:"all",text:"All"},{id:"reddit",text:"Reddit"},{id:"official",text:"Official"}],state.storyType,"story-type");
  const sortTool=(previous.length||official.length)?btnSegment([{id:"new",text:"Newest"},{id:"score",text:"Top score"},{id:"comments",text:"Most comments"}],state.storySort,"story-sort"):"";
  const sectionLabel=state.storyType==="official"?"Official Blizzard announcements and WoW blue posts published in the past 48 hours.":"Browse active WoW conversations directly on Reddit, save interesting links locally, and see official Blizzard posts in Stories. No Reddit API or scraping.";
  return sectionTitle("Community & Official","LATEST <span>STORIES</span>",sectionLabel)+
    `<div class="toolbar"><div class="toolbar-left">${storyTool}</div><div class="toolbar-right">${sortTool}</div></div>`+
    (showReddit?redditDirectory():"")+
    (previous.length?`<section class="reddit-previous"><h2>Previously imported Reddit discussions</h2><div class="stories-grid">${previous.map(s=>renderStory(s,data)).join("")}</div></section>`:"")+
    (showOfficial?`<section class="reddit-official"><h2>OFFICIAL <span>UPDATES</span></h2>${official.length?`<div class="stories-grid">${official.map(s=>renderStory(s,data)).join("")}</div>`:empty("No recent official updates","Blizzard news and blue posts appear here when the official source collector finds qualifying posts.",false)}</section>`:"");
}
function ideaCard(item,i,data) {
  const open=state.expanded.has(item.id);
  return `<article class="idea-card"><div class="idea-top"><span class="idea-index">${String(i+1).padStart(2,'0')}</span><span class="idea-format">${esc(item.format||'Analysis')}</span><span class="priority ${item.priority==='High'?'':'watch'}">${esc(item.priority||'Watch')}</span></div><h2 class="idea-title">${esc(item.title)}</h2><p class="idea-summary">${esc(item.summary||'')}</p><div class="idea-proposed"><span class="eyebrow">PROPOSED VIDEO TITLE</span><p>${esc(item.proposedTitle||item.title)}</p></div><div class="expand"><button data-expand="${esc(item.id)}">${open?'− Hide outline':'+ View content outline'}</button>${safeURL(item.sourceUrl)?`<a class="small-link" href="${esc(safeURL(item.sourceUrl))}" target="_blank" rel="noopener noreferrer">SOURCE ↗</a>`:''}</div>${open?`<div class="idea-details"><strong>Angle</strong><div>${esc(item.angle||'')}</div><strong>Why now</strong><div>${esc(item.whyNow||item.summary||'')}</div><strong>Viewer payoff</strong><div>${esc(item.viewerPayoff||'Explain the practical impact')}</div><strong>Outline</strong><ol>${(item.outline||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ol><strong>Recording plan</strong><ol>${(item.recordingPlan||[]).map(o=>`<li>${esc(o)}</li>`).join('')}</ol><strong>Source coverage</strong><div>${esc(item.coverage?.note||'Single source, verify before publication')}</div><strong>Source: </strong>${esc(item.sourceType||'')} · ${age(item.publishedAt)}</div>`:''}</article>`;
}
function ideasSection(data) {
  const ideas=data.contentCreation?.items||[];
  return sectionTitle('Research to production','CONTENT <span>CREATION</span>', 'Evidence-linked topics and potential video angles. Verify original sources before making factual claims.') +
    `<div class="info-note"><strong>Creator workflow:</strong> Prioritize rising or popular sources, avoid recycled recaps, and develop a test, comparison, counterargument, or useful player decision. Suggestions are starting points—not verified gameplay conclusions.</div>`+
    (ideas.length?`<div class="ideas-grid">${ideas.map((x,i)=>ideaCard(x,i,data)).join('')}</div>`:empty('No eligible content briefs yet','Ideas are built from recent eligible YouTube videos and fresh Reddit/official stories. Connect or import feeds to populate this section.'));
}
function researchStatusPicker(item) {
  const statuses=state.feed?.researchStatuses||['New','Seen','Investigating','Planned','Published','Dismissed'];
  return `<select aria-label="Research status" data-research-pick="${esc(item.id)}">${statuses.map(x=>`<option value="${esc(x)}" ${item.status===x?'selected':''}>${esc(x)}</option>`).join('')}</select> <button class="small-action" data-status-save="${esc(item.id)}">Set</button>`;
}
function watchlistSection(data) {
  const saved=(data.saved||[]).filter(x=>state.researchStatus==='all'||(x.status||'New')===state.researchStatus);
  if(data.savedPrivate) return sectionTitle('Your workspace','SAVED <span>WATCHLIST</span>','Private bookmarks and notes require the dashboard administrator token.')+`<section class="panel">${empty('Private watchlist locked','Unlock your saved notes with the rebuild’s administrator token.',false)}<div style="text-align:center;padding-bottom:27px"><button class="subtle-btn" data-unlock="1">Unlock watchlist</button></div></section>`;
  return sectionTitle('Your workspace','SAVED <span>WATCHLIST</span>','Keep references and editorial notes in the rebuild’s local SQLite database. Original Sites bookmarks have not been transferred.') +
    `<div class="toolbar" style="flex-wrap:wrap;gap:9px"><div class="toolbar-left">${btnSegment([{id:'all',text:'All'},{id:'New',text:'New'},{id:'Seen',text:'Seen'},{id:'Investigating',text:'Investigating'},{id:'Planned',text:'Planned'},{id:'Published',text:'Published'},{id:'Dismissed',text:'Dismissed'}],state.researchStatus,'research-filter')}</div><button class="subtle-btn" data-export-csv="1">Export CSV</button></div>`+
    (saved.length?`<section class="panel"><table class="saved-table"><thead><tr><th>Saved source</th><th>Status</th><th>Note</th><th>Actions</th></tr></thead><tbody>${saved.map(s=>`<tr><td>${titleLink(s.title,s.url,'')}<div class="video-time">${esc(s.kind)} · ${time(s.savedAt)}</div></td><td>${researchStatusPicker(s)}</td><td><textarea aria-label="Note for ${esc(s.title)}" id="note-${esc(s.id)}" data-note="${esc(s.id)}">${esc(s.note||'')}</textarea></td><td><button class="small-action" data-note-save="${esc(s.id)}">Save note</button> <button class="small-action" data-remove="${esc(s.id)}">Remove</button></td></tr>`).join('')}</tbody></table></section>`:empty('No saved sources','Save a qualifying video, Reddit discussion, or official post to build your research watchlist.'));
}
function channelsSection(data) {
  const ch=data.channels||[], status=data.sources||{}, official=data.officialSources||[];
  const youtube=`<section class="panel"><div class="board-title"><h2>Connected YouTube sources</h2><span class="status-pill ${status.youtube==='error'?'error':status.youtube==='not_configured'?'off':''}">${esc(status.youtube||'Not configured')}</span></div>${ch.length?ch.map(c=>`<div class="channel-card"><div class="channel-avatar ${c.official?'official-avatar':''}">▶</div><div class="channel-detail"><h3>${esc(c.title)}${c.official?' <span class="source-chip official video-official-badge">Official Source</span>':''}</h3><p>${esc(c.handle||c.id)} · ${esc(c.id)}</p></div><span class="status-pill">Tracked</span></div>`).join(''):empty('No channel configuration','YouTube is monitored by the independent GitHub scanner. Channels are configured through GitHub Actions secrets, not this browser.')}</section>`;
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
    `<div class="toolbar"><div class="toolbar-left"><span class="status-pill ${sources.youtube==='error'?'error':sources.youtube==='not_configured'?'off':''}">YouTube: ${esc(sources.youtube||'n/a')}</span><span class="status-pill ${sources.reddit==='error'?'error':sources.reddit==='not_configured'?'off':''}">Reddit: Browse only</span><span class="status-pill ${sources.official==='error'?'error':sources.official==='not_configured'?'off':''}">Official: ${esc(sources.official||'n/a')}</span></div><button class="subtle-btn" data-scan-now="1">↻ Scan now</button></div>`+
    `<div class="info-note"><strong>Incremental scanning:</strong> Official Blizzard feeds are checked hourly even overnight. YouTube's separate Cloudflare sync runs from 05:00–20:00 Kyiv time; a normal progress state is not a scan failure. ${data.scanProgress?`YouTube: ${fmt(data.scanProgress.queuedVideos||0)} queued videos; channel ${fmt((data.scanProgress.nextChannel||0)+1)} of ${fmt(data.scanProgress.totalChannels||0)}.`:''}</div>`+
    (scans.length?`<section class="panel"><table class="saved-table"><thead><tr><th>Provider</th><th>Result</th><th>Time / details</th></tr></thead><tbody>${scans.map(s=>`<tr><td><strong>${esc(s.provider)}</strong></td><td><span class="status-pill ${s.status==='error'?'error':s.status==='not_configured'?'off':''}">${esc(s.status)} · ${fmt(s.count)} items</span></td><td>${time(s.at)}${s.error?`<div class="video-time" title="${esc(s.error)}">${esc(s.error)}</div>`:''}</td></tr>`).join('')}</tbody></table></section>`:empty('No scans recorded yet',"Blizzard's official news is checked hourly, including overnight; YouTube discovery uses its separate GitHub schedule."));
}
function settingsSection(data) {
  const cfg=data.discoverySettings||{},diag=data.diagnostics||{},queries=cfg.queries||['WoW Forever','World of Warcraft Forever','WoW Classic'];
  const auth=data.canManage===true;
  return sectionTitle('Workspace controls','RADAR <span>SETTINGS</span>','Free-tier source controls. YouTube API credentials stay in GitHub Secrets, never in this browser.')+
    `<section class="panel" style="padding:23px;margin-bottom:18px"><h2>Connection status</h2><p class="story-summary">GitHub YouTube collection: ${esc(data.sources?.youtube||'unknown')} · Blizzard: ${esc(data.sources?.official||'pending')} · Reddit: Browse only (no API)</p><p class="story-summary">Last GitHub measurement: ${diag.lastGithubAt?age(diag.lastGithubAt):'Not yet available'} · Last Cloudflare sync: ${diag.lastSiteSyncAt?age(diag.lastSiteSyncAt):'Not yet available'}</p><div class="info-note">All source collectors use published APIs and free infrastructure. AI briefs and paid transcription are disabled. Only the original theme is active.</div></section>`+
    `<section class="panel" style="padding:23px;margin-bottom:18px"><h2>Discovery terms</h2><p class="story-summary">GitHub reads these search terms at its next scheduled discovery scan. One term per line, up to six.</p><textarea id="discovery-queries" rows="5" style="width:100%;padding:12px;background:var(--panel2);border:1px solid var(--border);color:var(--text);border-radius:8px">${esc(queries.join('\n'))}</textarea><p>${auth?'<button class="subtle-btn" data-save-queries="1">Save search terms</button>':'Unlock administrator access to change settings.'}</p></section>`+
    `<section class="panel" style="padding:23px;margin-bottom:18px"><h2>Track a YouTube channel</h2><p class="story-summary">Add the channel's public UC ID (not the @handle). GitHub can monitor its uploads without an additional paid service.</p><input id="tracked-channel-id" placeholder="UCxxxxxxxxxxxxxxxxxxxxxx" style="width:100%;max-width:340px;padding:10px;background:var(--panel2);border:1px solid var(--border);color:var(--text);border-radius:8px"><input id="tracked-channel-title" placeholder="Channel name" style="width:100%;max-width:230px;padding:10px;background:var(--panel2);border:1px solid var(--border);color:var(--text);border-radius:8px">${auth?'<button class="subtle-btn" data-add-channel="1">Track channel</button>':'<p>Administrator access required.</p>'}<div>${(data.channels||[]).map(c=>`<p><b>${esc(c.title||c.id)}</b> <small>${esc(c.id)}</small> ${auth?`<button class="small-action" data-remove-channel="${esc(c.id)}">Remove</button>`:''}</p>`).join('')}</div></section>`+
    `<section class="panel" style="padding:23px"><h2>Account and Reddit</h2><p class="story-summary">${auth?'Administrator access is active for this browser tab.':'Private notes and settings are locked. Set ADMIN_TOKEN as a Cloudflare Worker secret and unlock using your administrator token.'}</p>${auth?'':'<button class="subtle-btn" data-unlock="1">Unlock administrator</button>'}<div class="info-note">Reddit browsing is available without API credentials. Top Today, Hot and Most Comments open on Reddit itself. Saved discussion links stay in this browser; no scraping, background collection or AI charges.</div></section>`;
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
  const names={popular:'Popular',hot:'HOT',stories:'Stories',ideas:'Content Creation',watchlist:'Watchlist',channels:'Channels',activity:'Scan Activity',settings:'Settings'};
  $('#crumb-section').textContent=names[state.section]; document.title=`${names[state.section]} · Azeroth Radar`;
}
function render() {
  updateTheme();updateNav();
  const data=state.demo?demoData():state.feed;
  $('#demo-warning').classList.toggle('hidden',!state.demo);
  $('#demo-toggle').textContent=state.demo?'Live feed':'Preview demo';
  if(!data) {root.innerHTML=empty('Loading Azeroth Radar','Reading the local API and its saved sources...',false);return;}
  const renderers={popular:()=>videoSection(data,'popular'),hot:()=>videoSection(data,'hot'),stories:()=>storiesSection(data),ideas:()=>ideasSection(data),watchlist:()=>watchlistSection(data),channels:()=>channelsSection(data),activity:()=>activitySection(data),settings:()=>settingsSection(data)};
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
    if(button.dataset.window){state.viewWindow=button.dataset.window;return render();}
    if(button.dataset.videoSort){state.sortVideos=button.dataset.videoSort;return render();}
    if(button.dataset.applySearch){state.searchTerm=document.getElementById('video-filter')?.value.trim().slice(0,140)||'';return render();}
    if(button.dataset.clearSearch){state.searchTerm='';return render();}
    if(button.dataset.researchFilter){state.researchStatus=button.dataset.researchFilter;return render();}
    if(button.dataset.statusSave){const id=button.dataset.statusSave;
      const status=[...document.querySelectorAll('[data-research-pick]')].find(x=>x.dataset.researchPick===id)?.value;
      await adminFetch('/api/research/status',{method:'POST',body:JSON.stringify({id,status})});toast('Research status saved');return fetchFeed();}
    if(button.dataset.exportCsv){const r=await fetch('/api/research/csv',{headers:state.adminToken?{'X-Admin-Token':state.adminToken}:{}});
      if(!r.ok)throw Error('Admin unlock required');const blob=await r.blob(),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='azeroth-radar-research.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);return;}
    if(button.dataset.layout) {state.layout=button.dataset.layout;return render();}
    if(button.dataset.storyType) {state.storyType=button.dataset.storyType;return render();}
    if(button.dataset.storySort) {state.storySort=button.dataset.storySort;return render();}
    if(button.dataset.expand) {const id=button.dataset.expand; if(state.expanded.has(id))state.expanded.delete(id);else state.expanded.add(id);return render();}
    if(button.dataset.showDemo||button.id==='demo-toggle'||button.id==='exit-demo') {state.demo=button.id==='exit-demo'?false:!state.demo; return render();}
    if(button.dataset.unlock) {const token=window.prompt('Enter the rebuild ADMIN_TOKEN:'); if(token){state.adminToken=token;await fetchFeed();} return;}
    if(button.dataset.redditRemove!==undefined) {const idx=Number(button.dataset.redditRemove),items=redditSaved();if(!Number.isInteger(idx)||idx<0||idx>=items.length)return;items.splice(idx,1);try{localStorage.setItem(REDDIT_LOCAL_KEY,JSON.stringify(items));}catch{toast('Browser storage unavailable');return;}toast('Discussion removed');return render();}
    if(button.dataset.save) {await adminFetch('/api/save',{method:'POST',body:JSON.stringify({id:button.dataset.save,kind:button.dataset.kind,title:button.dataset.title,url:button.dataset.url})});toast('Saved to watchlist');return fetchFeed();}
    if(button.dataset.remove) {await adminFetch('/api/save/'+encodeURIComponent(button.dataset.remove),{method:'DELETE'});toast('Removed from watchlist');return fetchFeed();}
    if(button.dataset.saveQueries){const text=document.getElementById('discovery-queries')?.value||'';
      const queries=text.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,6);
      await adminFetch('/api/discovery/settings',{method:'POST',body:JSON.stringify({queries})});toast('Queries saved');return fetchFeed();}
    if(button.dataset.addChannel){const id=document.getElementById('tracked-channel-id')?.value.trim()||'';
      const title=document.getElementById('tracked-channel-title')?.value.trim()||'';
      await adminFetch('/api/channels',{method:'POST',body:JSON.stringify({id,title})});toast('Channel added');return fetchFeed();}
    if(button.dataset.removeChannel){await adminFetch('/api/channels/'+encodeURIComponent(button.dataset.removeChannel),{method:'DELETE'});toast('Channel removed');return fetchFeed();}
    if(button.dataset.hideVideo){await adminFetch('/api/hide-video',{method:'POST',body:JSON.stringify({id:button.dataset.hideVideo,hidden:true})});toast('Video hidden');return fetchFeed();}
    if(button.dataset.noteSave) { const id=button.dataset.noteSave;const note=[...document.querySelectorAll('[data-note]')].find(el=>el.dataset.note===id)?.value||'';
      const item=(state.feed?.saved||[]).find(s=>s.id===id); if(!item)return;await adminFetch('/api/save',{method:'POST',body:JSON.stringify({id,kind:item.kind,title:item.title,url:item.url,note})});toast('Note saved');return fetchFeed(); }
    if(button.dataset.scanNow){button.disabled=true;button.textContent='Scanning…'; const resp=await adminFetch('/api/scan',{method:'POST'});toast(resp.status==='busy'?'Scan already running':resp.status==='running'?'Scan started in background; open Scan Activity for progress.':'Scan result: '+resp.status);return fetchFeed();}
  } catch(error) {toast(error.message);} finally {if(button?.dataset.scanNow){button.disabled=false;button.textContent='↻ Scan now';}}
});
document.addEventListener('submit',function onRedditSubmit(e) {
  if(e.target?.id!=="reddit-add-form")return;
  e.preventDefault();
  const url=redditPostUrl(document.getElementById("reddit-post-url")?.value);
  const title=(document.getElementById("reddit-post-title")?.value||"").trim().slice(0,180);
  if(!url){toast("Use a valid Reddit post URL (not a subreddit or search page).");return;}
  if(!title){toast("Enter the discussion title.");return;}
  const saved=redditSaved();
  if(saved.some(x=>x.url===url)){toast("That discussion is already saved.");return;}
  try {
    localStorage.setItem(REDDIT_LOCAL_KEY,JSON.stringify([{url,title,savedAt:Date.now()},...saved].slice(0,60)));
  }catch{toast("Browser storage is unavailable; the link was not saved.");return;}
  toast("Reddit discussion saved on this device.");
  render();
});
window.addEventListener('hashchange',()=>{const page=location.hash.replace('#','');if(['popular','hot','stories','ideas','watchlist','channels','activity','settings'].includes(page)){state.section=page;render();}});
if(location.hash) {const page=location.hash.slice(1);if(['popular','hot','stories','ideas','watchlist','channels','activity'].includes(page))state.section=page;}
render();fetchFeed();setInterval(fetchFeed,60000);
