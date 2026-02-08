export interface Channel {
  id: string;
  name: string;
  url: string;
  website: string;
  description: string;
}

export const CHANNELS: Channel[] = [
  { id: 'cnbc', name: 'CNBC', url: '/hls/cnbc/cnbcsd.m3u8', website: 'https://www.cnbc.com/live-tv/', description: 'Business News' },
  { id: 'bloomberg', name: 'Bloomberg US', url: 'https://www.bloomberg.com/media-manifest/streams/us.m3u8', website: 'https://www.bloomberg.com/live', description: 'Markets & Finance' },
  { id: 'yahoo-finance', name: 'Yahoo Finance', url: 'https://d1ewctnvcwvvvu.cloudfront.net/playlist.m3u8', website: 'https://finance.yahoo.com/live/', description: 'Markets & Investing' },
];
