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
