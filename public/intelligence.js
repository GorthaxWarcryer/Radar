'use strict';
// Presentation-only features. No inference, analytics credentials, or browser data is
// sent to the server: creator preferences and feedback stay on this device.
(function () {
  const PROFILE='azeroth-radar-creator-profile-v1', FEEDBACK='azeroth-radar-editorial-feedback-v1';
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function url(s){try{var u=new URL(String(s||''));return u.protocol==='https:'?u.href:'';}catch{return '';}}
  function fmt(n){return Number.isFinite(Number(n))?Number(n).toLocaleString('en-US'):'—';}
  function local(key,def){try{var v=JSON.parse(localStorage.getItem(key)||'null');return v&&typeof v==='object'?v:def;}catch{return def;}}
  function profile(){var p=local(PROFILE,{});return {world:['all','forever','classic','retail'].includes(p.world)?p.world:'all',
    interests:Array.isArray(p.interests)?p.interests.filter(function(x){return typeof x==='string';}).slice(0,12):[]};}
  function votes(){return local(FEEDBACK,{});}
  function score(idea){
    var p=profile(),text=(String(idea.title||'')+' '+String(idea.subject||'')+' '+String(idea.category||'')+' '+
      (idea.sources||[]).map(function(x){return String(x.title||'');}).join(' ')).toLowerCase();
    var match=p.interests.filter(function(x){return text.includes(x.toLowerCase());}).length;
    var penalty=p.world!=='all'&&p.world!==idea.world?-18:0;
    var vote=votes()[idea.id],bonus=vote==='useful'?8:vote==='not-relevant'?-45:0;
    return Math.max(0,Math.min(100,Math.round(Number(idea.opportunityScore||0)+match*11+penalty+bonus)));
  }
  function storeVote(id,value){
    if(!/^opportunity:[a-z0-9:-]+$/i.test(id)||!['useful','not-relevant'].includes(value))return false;
    var data=votes();data[id]=data[id]===value?'':value;
    try{localStorage.setItem(FEEDBACK,JSON.stringify(Object.fromEntries(Object.entries(data).slice(-300))));return true;}
    catch{return false;}
  }
  function storeProfile(){
    var p=document.getElementById('creator-world');
    var world=p?p.value:'all';
    var interests=[...document.querySelectorAll('[data-profile-interest]:checked')]
      .map(function(x){return x.dataset.profileInterest;}).slice(0,12);
    if(!['all','forever','classic','retail'].includes(world))world='all';
    try{localStorage.setItem(PROFILE,JSON.stringify({world:world,interests:interests}));return true;}
    catch{return false;}
  }
  function link(text,href,css){
    var safe=url(href);
    return safe?'<a class="'+esc(css||'small-link')+'" href="'+esc(safe)+'" target="_blank" rel="noopener noreferrer">'+esc(text)+'</a>':esc(text);
  }
  function extra(idea,forYou) {
    var trend=idea.trend||{},gap=idea.contentGaps||{},vote=votes()[idea.id]||'';
    return '<div class="intelligence-extra">'+
      (trend.movement?'<span class="status-pill">Trend: '+esc(trend.movement)+
        (trend.change!==null&&trend.change!==undefined?' · '+(trend.change>0?'+':'')+fmt(trend.change):'')+'</span>':'')+
      (forYou?'<span class="status-pill">Personal fit: '+fmt(score(idea))+'/100</span>':'')+
      '<span class="intelligence-actions"><button class="small-action'+(vote==='useful'?' selected-feedback':'')+
        '" data-idea-feedback="'+esc(idea.id)+'" data-value="useful">Useful</button> '+
        '<button class="small-action'+(vote==='not-relevant'?' selected-feedback':'')+
        '" data-idea-feedback="'+esc(idea.id)+'" data-value="not-relevant">Not relevant</button></span>'+
      (gap.questions&&gap.questions.length?'<details class="intelligence-gaps"><summary>Possible content gaps · research questions</summary>'+
        '<p>'+esc(gap.coverageNote||'Not independently verified.')+'</p><ul>'+
        gap.questions.map(function(q){return '<li>'+esc(q)+'</li>';}).join('')+'</ul></details>':'')+'</div>';
  }
  function emerging(data,kind){
    var items=(data.emerging||[]).filter(function(v){return v.kind===kind;});
    var summary='<div class="info-note"><strong>Experimental early signals:</strong> 250–4,999-view videos published within 12 hours. Estimated growth is average views since upload, not a prediction. HOT and Popular still require 5,000+ views.</div>';
    if(!items.length)return summary+'<section class="panel digest-panel"><h2>No emerging signals yet</h2><p class="story-summary">New qualifying uploads will appear after discovery sync.</p></section>';
    return summary+'<div class="emerging-grid">'+items.map(function(v){
      var thumb=url(v.thumbnail),image=thumb?'<img src="'+esc(thumb)+'" alt="'+esc(v.title)+'" loading="lazy" width="320" height="180">':'';
      return '<article class="panel emerging-card"><div class="emerging-image">'+image+'</div><div class="emerging-body">'+
      '<h2>'+link(v.title,v.url,'video-title')+'</h2><p class="story-summary">'+esc(v.channelName||'YouTube creator')+'</p>'+
      '<div class="emerging-metrics"><strong>'+fmt(v.views)+' views</strong><span>'+fmt(v.earlyVelocity)+' views/hour</span></div>'+
      '<p class="opportunity-disclaimer">'+esc(v.earlyMethod)+' · Signal '+fmt(v.earlySignalScore)+'/100</p>'+
      link('Open original video',v.url,'small-link')+'</div></article>';
    }).join('')+'</div>';
  }
  function digest(data) {
    var d=data.editorialDigest||{},ai=d.aiDigest,top=d.top||[],official=d.official||[],early=d.early||[];
    var lead=ai?'<section class="panel digest-panel digest-lead"><span class="eyebrow">AUTOMATIC AI PRIORITIES</span>'+
      '<h2>'+esc(ai.headline||'Research for today')+'</h2>'+
      (ai.priorities||[]).map(function(p,i){return '<div class="digest-entry"><span class="idea-angle-number">'+(i+1)+'</span>'+
      '<div><strong>'+esc(p.title)+'</strong><p>'+esc(p.reason)+'</p></div></div>';}).join('')+
      '<p class="opportunity-disclaimer">'+esc(ai.verifiedLimit||'Verify original sources before publishing.')+'</p></section>':
      '<div class="info-note"><strong>Daily AI briefing:</strong> Generated automatically at the morning research slot when source data is available. Showing source-linked live priorities until then.</div>';
    return lead+'<div class="digest-grid"><section class="panel digest-panel"><h2>TOP CREATOR OPPORTUNITIES</h2>'+
      (top.length?top.map(function(x,i){return '<div class="digest-entry"><span class="idea-angle-number">'+(i+1)+'</span>'+
        '<div><strong>'+esc(x.title)+'</strong><p>'+esc(x.reason)+'</p>'+
        '<small>Opportunity '+fmt(x.score)+'/100 · '+esc(x.trend)+'</small><p>'+link('Primary source',x.sourceUrl,'small-link')+
        '</p></div></div>';}).join(''):'<p class="story-summary">No qualifying topics yet.</p>')+
      '</section><section class="panel digest-panel"><h2>OFFICIAL UPDATES</h2>'+
      (official.length?official.map(function(x){return '<div class="digest-entry"><span>✦</span><div>'+
        link(x.title,x.url,'story-title')+'<p>'+esc(x.summary||'')+'</p></div></div>';}).join(''):
        '<p class="story-summary">No recent official updates.</p>')+
      '<h2 class="digest-subtitle">EARLY SIGNALS</h2>'+
      (early.length?early.map(function(x){return '<div class="digest-entry"><span>↗</span><div>'+
        link(x.title,x.url,'story-title')+'<p>'+fmt(x.views)+' views · '+fmt(x.velocity)+' views/hour ('+
        esc(x.method)+')</p></div></div>';}).join(''):'<p class="story-summary">None qualify yet.</p>')+
      '</section></div><p class="opportunity-disclaimer">'+esc(d.note||'Verify claims against the original source.')+'</p>';
  }
  function settings(){
    var p=profile();
    var interests=['Paladin','Warrior','Shaman','Mage','Hunter','Priest','Druid','Rogue','Warlock','PvP','Raid','Profession','Racial','Addon','Launch','Economy'];
    return '<section class="panel profile-panel"><h2>Creator preferences · For You</h2>'+
      '<p class="story-summary">Customize which topics appear first in Content Opportunities. Preferences and feedback are stored in this browser only, not shared with other users or AI.</p>'+
      '<label for="creator-world">Main World of Warcraft game</label> <select id="creator-world">'+
      [['all','All WoW'],['forever','WoW Forever'],['classic','WoW Classic'],['retail','Retail WoW']].map(function(x){
        return '<option value="'+x[0]+'" '+(p.world===x[0]?'selected':'')+'>'+x[1]+'</option>';}).join('')+
      '</select><div class="profile-interests">'+interests.map(function(x){
        return '<label><input type="checkbox" data-profile-interest="'+esc(x)+'" '+
          (p.interests.some(function(y){return y.toLowerCase()===x.toLowerCase();})?'checked':'')+'> '+esc(x)+'</label>';
      }).join('')+'</div><button class="small-action idea-primary" data-save-profile="1">Save creator preferences</button></section>';
  }
  window.RadarIntelligence={profile:profile,score:score,votes:votes,storeVote:storeVote,storeProfile:storeProfile,
    extra:extra,emerging:emerging,digest:digest,settings:settings};
})();
