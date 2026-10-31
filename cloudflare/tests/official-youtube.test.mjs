import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFICIAL_YOUTUBE_CHANNELS, isOfficialYouTubeChannel } from '../../src/official-youtube.mjs';
import { fromGithubVideo, buildFeed } from '../transform.mjs';

const T=Date.parse('2026-10-31T15:00:00Z'), H=3600000;
const original={
  id:'abcABC123_-',
  title:'New WoW Forever Cinematic',
  channel:'World of Warcraft',
  publishedAt:T-H,
  views:12000,
  isShort:false,
  samples:[{capturedAt:T,views:12000}]
};
test('curated Warcraft YouTube channel uses immutable, verified channel ID',()=>{
  assert.equal(OFFICIAL_YOUTUBE_CHANNELS.length,1);
  assert.equal(OFFICIAL_YOUTUBE_CHANNELS[0].id,'UCbLj9QP9FAaHs_647QckGtg');
  assert.equal(isOfficialYouTubeChannel(OFFICIAL_YOUTUBE_CHANNELS[0].id),true);
  assert.equal(isOfficialYouTubeChannel('@Warcraft'),false);
});
test('HOT and Popular preserve official publisher badge from verified YouTube channel ID',()=>{
  const entry=fromGithubVideo({...original,channelId:'UCbLj9QP9FAaHs_647QckGtg'},T);
  assert.equal(entry.officialSource,true);
  const feed=buildFeed({videos:[entry],now:T});
  assert.equal(feed.hot.long.length,1);
  assert.equal(feed.popular.long.length,1);
  assert.equal(feed.hot.long[0].officialSource,true);
  assert.equal(feed.popular.long[0].officialSource,true);
});
test('spoofed display name and videos with unknown channel ID do not get badge',()=>{
  const spoof=fromGithubVideo({...original,channelId:'UCnotTheOfficialChannel12'},T);
  const unknown=fromGithubVideo({...original,id:'QWEasd123_-'},T);
  assert.equal(spoof.officialSource,false);
  assert.equal(unknown.officialSource,false);
});
