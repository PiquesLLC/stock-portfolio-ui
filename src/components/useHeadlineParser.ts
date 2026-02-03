import { useState, useEffect, useRef, useCallback } from 'react';
import { getMarketNews } from '../api';

export interface LiveHeadline {
  id: string;
  text: string;
  source: string;
  url: string;
  timestamp: number; // unix ms
}

const REFRESH_INTERVAL = 60_000; // fetch new headlines every 60 seconds
const MAX_HEADLINES = 10; // keep last 10 headlines

let seenIds = new Set<number>();

/**
 * Fetches real market news from Finnhub API.
 * Returns the most recent headlines, refreshing periodically.
 */
export function useHeadlineParser(channel: string, isLive: boolean) {
  const [headlines, setHeadlines] = useState<LiveHeadline[]>([]);
  const lastFetchRef = useRef<number>(0);

  const fetchNews = useCallback(async () => {
    try {
      const news = await getMarketNews(20);

      // Convert to LiveHeadline format, filtering out already seen
      const newHeadlines: LiveHeadline[] = [];

      for (const item of news) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          newHeadlines.push({
            id: `news-${item.id}`,
            text: item.headline,
            source: item.source,
            url: item.url,
            timestamp: item.datetime * 1000, // convert to ms
          });
        }
      }

      if (newHeadlines.length > 0) {
        setHeadlines(prev => {
          // Combine new with existing, sort by timestamp desc, keep max
          const combined = [...newHeadlines, ...prev]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, MAX_HEADLINES);
          return combined;
        });
      }

      lastFetchRef.current = Date.now();
    } catch (err) {
      console.error('Failed to fetch market news:', err);
    }
  }, []);

  useEffect(() => {
    if (!isLive) return;

    // Reset on channel change or when becoming live
    seenIds = new Set();
    setHeadlines([]);

    // Fetch immediately
    fetchNews();

    // Then refresh periodically
    const interval = setInterval(fetchNews, REFRESH_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [channel, isLive, fetchNews]);

  return headlines;
}
