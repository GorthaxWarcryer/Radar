import test from 'node:test';
import assert from 'node:assert/strict';
import { scanYouTubeSlice } from '../src/incremental.mjs';

const videoId = 'AbCdEfGhIjK';
const publishedAt = new Date(Date.now() - 3600000).toISOString();
function fakeStore() {
  const metadata = new Map();
  const seen = []; const tracked = [];
  return {
    metadata, seen, tracked,
    getMeta: key => metadata.get(key),
    setMeta: (key, value) => metadata.set(key, value),
    trackedVideoIds: () => tracked.slice(),
    importData: ({videos}) => { seen.push(...videos); for (const v of videos) if (!tracked.includes(v.id)) tracked.push(v.id); }
  };
}
function fakeAPI({ failVideos = false, views = 6000, requests = [] } = {}) {
  return async url => {
    const u = new URL(url); requests.push(u.pathname);
    if (u.pathname.endsWith('/channels')) {
      const name = u.searchParams.get('forHandle') || u.searchParams.get('id');
      return {items:[{id:name, snippet:{title:name},contentDetails:{relatedPlaylists:{uploads:`upl-${name}`}}}]};
    }
    if (u.pathname.endsWith('/playlistItems')) return {items:[{contentDetails:{videoId}}]};
    if (u.pathname.endsWith('/videos')) {
      if (failVideos) throw new Error('Temporary failure');
      return {items:[{id:videoId,snippet:{title:'Legitimate upload',publishedAt,channelTitle:'Creator',channelId:'UC1',liveBroadcastContent:'none'},statistics:{viewCount:String(views)},contentDetails:{duration:'PT10M'}}]};
    }
    throw new Error(`Unexpected URL ${url}`);
  };
}
const cfg = {YOUTUBE_API_KEY:'test-only',YOUTUBE_CHANNELS:'@alpha,@beta,@gamma',YOUTUBE_CHANNELS_PER_SCAN:'1'};

test('limits discovery to bounded channel chunks and resumes with a persisted cursor', async () => {
  const store = fakeStore(), requests = [];
  const opts = {env:cfg,store,fetchJSON:fakeAPI({requests})};
  const first = await scanYouTubeSlice(opts);
  assert.equal(first.status, 'progress');
  assert.equal(first.progress.nextChannel,1);
  assert.equal(first.progress.totalChannels,3);
  assert.equal(first.progress.processed,1);
  assert.equal(requests.filter(p=>p.endsWith('/channels')).length,1);
  const second = await scanYouTubeSlice(opts);
  assert.equal(second.progress.nextChannel,2);
  const third = await scanYouTubeSlice(opts);
  assert.equal(third.progress.nextChannel,0);
  assert.equal(third.progress.completedPasses,1);
  assert.equal(third.progress.queuedVideos,0);
  assert.ok(store.metadata.get('youtubeCursor'));
});

test('a failed video detail request preserves queued work for a later successful retry', async () => {
  const store=fakeStore();
  const failed=await scanYouTubeSlice({env:cfg,store,fetchJSON:fakeAPI({failVideos:true})});
  assert.equal(failed.status,'partial');
  assert.equal(failed.progress.queuedVideos,1);
  assert.equal(store.seen.length,0);
  const success=await scanYouTubeSlice({env:cfg,store,fetchJSON:fakeAPI({views:7000})});
  assert.equal(success.progress.queuedVideos,0);
  assert.equal(store.seen.at(-1).views,7000);
});

test('previously tracked uploads continue receiving actual view measurements', async () => {
  const store=fakeStore();
  const first=await scanYouTubeSlice({env:cfg,store,fetchJSON:fakeAPI({views:6000})});
  const second=await scanYouTubeSlice({env:cfg,store,fetchJSON:fakeAPI({views:6900})});
  assert.equal(first.progress.queuedVideos,0);
  assert.equal(second.progress.queuedVideos,0);
  assert.equal(store.seen.at(-1).views,6900);
  assert.ok(store.seen.length >=2);
});

test('expired budgets do not discard existing unfinished work', async () => {
  const store=fakeStore();
  store.setMeta('youtubeCursor', JSON.stringify({signature:cfg.YOUTUBE_CHANNELS.split(',').join('|'),channelCursor:2,pending:[videoId],trackingCursor:0,details:{},completedPasses:0,lastFullDiscoveryAt:null}));
  const res=await scanYouTubeSlice({env:cfg,store,fetchJSON:fakeAPI(),deadline:Date.now()-1});
  assert.equal(res.progress.queuedVideos,1);
  assert.equal(res.progress.nextChannel,2);
  assert.equal(res.progress.processed,0);
});
