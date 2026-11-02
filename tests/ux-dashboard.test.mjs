import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const extract=(start,end)=> {
  const a=app.indexOf(start);
  const b=app.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,'Missing source section '+start);
  return app.slice(a,b);
};
test('accessible shell exposes skip link, explicit manual refresh and live update status',()=>{
  assert.match(html,/class="skip-link" href="#main-content"/);
  assert.match(html,/id="refresh-feed"/);
  assert.match(html,/id="sync-label"/);
  assert.match(html,/aria-live="polite"/);
  assert.ok(!html.includes('mini-hot">LIVE'));
});
test('navigation and filter states have visible keyboard focus and generous controls',()=>{
  assert.match(css,/select:focus-visible/);
  assert.match(css,/outline:3px solid var\(--accent\)/);
  assert.match(css,/\.segment button\s*\{[\s\S]*?min-height:39px/);
  assert.match(css,/\.mobile-nav button\s*\{[\s\S]*?min-height:47px/);
});
test('UI retains current data when refresh fails and pauses while writing',()=>{
  assert.ok(app.includes('if(!state.feed)state.feed='));
  assert.ok(app.includes('if(!document.hidden&&!isEditing())fetchFeed();'));
  assert.ok(app.includes("document.addEventListener('visibilitychange'"));
  assert.ok(app.includes("button.id==='refresh-feed'"));
});
test('search supports Enter, Escape and slash without overriding text inputs',()=>{
  assert.ok(app.includes("event.target?.id==='video-filter'"));
  assert.ok(app.includes("event.key==='Enter'"));
  assert.ok(app.includes("event.key==='Escape'"));
  assert.ok(app.includes("event.key==='/'"));
  assert.ok(app.includes("aria-label=\"Search video titles and channels\""));
});
test('HOT defaults to measured growth, Popular defaults to lifetime views',()=>{
  assert.ok(app.includes("hotSort:'velocity', popularSort:'views'"));
  const code=extract('function videoSection(data,mode)', '\nconst REDDIT_LOCAL_KEY');
  const ctx={
    state:{kind:'long',layout:'list',hotSort:'velocity',popularSort:'views',
      searchTerm:'',viewWindow:'48',section:'hot'},
    sectionTitle:()=>'',statCards:()=>'',btnSegment:()=>'',esc:x=>String(x),
    videoBoard:(title,sub,items)=>title+':'+items.map(v=>v.id).join(',')+';',
    Date,Number
  };
  vm.runInNewContext(code+'\nthis.videoSection=videoSection;',ctx);
  const when=Date.now()-3600000;
  const a={id:'many-views',title:'More views',kind:'long',publishedAt:when,views:25000,growth:{perHour:100}};
  const b={id:'more-growth',title:'More growth',kind:'long',publishedAt:when,views:9000,growth:{perHour:2000}};
  const data={hot:{long:[a,b]},popular:{long:[a,b]},summary:{}};
  assert.ok(ctx.videoSection(data,'hot').includes('New uploads:more-growth,many-views;'));
  assert.ok(ctx.videoSection(data,'popular').includes('New uploads:many-views,more-growth;'));
  ctx.state.hotSort='views';
  assert.ok(ctx.videoSection(data,'hot').includes('New uploads:many-views,more-growth;'));
});
test('thumbnail reserves width and height and prioritizes first visible video',()=>{
  const code=extract('function thumbnail(v,priority=false)', '\nfunction renderVideo');
  const ctx={esc:x=>String(x),safeURL:x=>String(x)};
  vm.runInNewContext(code+'\nthis.thumbnail=thumbnail;',ctx);
  const first=ctx.thumbnail({title:'WoW Forever',thumbnail:'https://i.ytimg.com/vi/test/hqdefault.jpg'},true);
  const other=ctx.thumbnail({title:'Another video',thumbnail:'https://i.ytimg.com/vi/test/hqdefault.jpg'},false);
  assert.match(first,/width="320" height="180"/);
  assert.match(first,/fetchpriority="high"/);
  assert.match(other,/loading="lazy"/);
  assert.match(first,/alt="Thumbnail for WoW Forever"/);
});
test('times older than 24 hours are shown as days, not 40 hours',()=>{
  const ctx={Date};
  vm.runInNewContext(extract('function age(t)', '\nfunction storyAge')+'\nthis.age=age;',ctx);
  assert.equal(ctx.age(Date.now()-40*3600000),'1d ago');
});
test('reduced motion and stable skeleton are available',()=>{
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/\.loading-shell/);
  assert.ok(app.includes('Loading the latest collected signals'));
});

test('Blue Posts lead Stories ahead of other official updates and Reddit',()=>{
  const code=extract('function storiesSection(data)', '\nfunction ideaCard');
  const ctx={
    state:{storyType:'all',storySort:'new'},
    sectionTitle:()=>'',btnSegment:()=>'',
    redditDirectory:()=>'<div>REDDIT DIRECTORY</div>',
    renderStory:s=>`[${s.id}]`,empty:()=>'',Date,Number
  };
  vm.runInNewContext(code+'\nthis.storiesSection=storiesSection;',ctx);
  const data={stories:[
    {id:'reddit',source:'Reddit',publishedAt:300},
    {id:'official',source:'Official',sourceId:'news',publishedAt:200},
    {id:'blue',source:'Official',sourceId:'blue',publishedAt:100}
  ]};
  const output=ctx.storiesSection(data);
  assert.ok(output.indexOf('[blue]')<output.indexOf('[official]'));
  assert.ok(output.indexOf('[official]')<output.indexOf('REDDIT DIRECTORY'));
  ctx.state.storyType='official';
  assert.ok(!ctx.storiesSection(data).includes('REDDIT DIRECTORY'));
  ctx.state.storyType='reddit';
  assert.ok(!ctx.storiesSection(data).includes('[blue]'));
});

test('Content Creation opportunities collapse to headlines and expand all original research details',()=>{
  const code=extract('function ideaCard(item,i,data)', '\nfunction ideasSection');
  const ctx={
    state:{expanded:new Set(),ideaView:'all'},
    window:{RadarIntelligence:{extra:()=>'<div>Personal relevance tools</div>'}},
    esc:x=>String(x),fmt:x=>String(x),age:()=> '2h ago',safeURL:()=>'',titleLink:x=>x,Number,Object,String
  };
  vm.runInNewContext(code+'\nthis.ideaCard=ideaCard;',ctx);
  const idea={
    id:'creator-1',title:'Paladin talent changes in WoW Forever',
    summary:'New class balance discussion',category:'Class changes',priority:'High',
    publishedAt:123,opportunityScore:82,
    sources:[{sourceType:'Official',title:'Blizzard patch notes',publishedAt:123}],
    angles:[{type:'Analysis',title:'What changed?',approach:'Compare official details'}],
    outline:['Explain changes'],recordingPlan:['Show original notes'],
    viewerPayoff:'Understand the patch',coverage:{note:'Verify original source'}
  };
  const collapsed=ctx.ideaCard(idea,0,{saved:[]});
  assert.match(collapsed,/class="opportunity-trigger"/);
  assert.match(collapsed,/aria-expanded="false"/);
  assert.match(collapsed,/Paladin talent changes in WoW Forever/);
  assert.doesNotMatch(collapsed,/New class balance discussion/);
  assert.doesNotMatch(collapsed,/Recording plan/);
  assert.doesNotMatch(collapsed,/Personal relevance tools/);
  ctx.state.expanded.add(idea.id);
  const opened=ctx.ideaCard(idea,0,{saved:[]});
  assert.match(opened,/aria-expanded="true"/);
  assert.match(opened,/New class balance discussion/);
  assert.match(opened,/Recording plan/);
  assert.match(opened,/Blizzard patch notes/);
  assert.match(opened,/Personal relevance tools/);
  assert.match(css,/\.ideas-grid\s*\{\s*grid-template-columns:minmax\(0,1fr\)/);
  assert.match(app,/<details class="opportunity-explainer">/);
});
