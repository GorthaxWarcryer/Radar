/**
 * Curated official YouTube sources. Only the immutable YouTube channel ID can
 * confer official status; a display name or @handle is not proof.
 * Source: youtube.com/@Warcraft -> UCbLj9QP9FAaHs_647QckGtg.
 */
export const OFFICIAL_YOUTUBE_CHANNELS=Object.freeze([
  Object.freeze({
    id:'UCbLj9QP9FAaHs_647QckGtg',
    title:'World of Warcraft',
    handle:'@Warcraft',
    url:'https://www.youtube.com/channel/UCbLj9QP9FAaHs_647QckGtg'
  })
]);
export function officialYouTubeChannel(channelId) {
  return OFFICIAL_YOUTUBE_CHANNELS.find(x=>x.id===channelId)||null;
}
export function isOfficialYouTubeChannel(channelId) {
  return !!officialYouTubeChannel(channelId);
}
