import { useState, useEffect, useRef, useCallback } from 'react';

export interface LiveHeadline {
  id: string;
  text: string;
  source: string;
  timestamp: number; // unix ms
}

// Mock transcript headlines — structured so this can be swapped with
// live captions API, speech-to-text, or CNBC transcript feed later.
const MOCK_HEADLINES: { text: string; source: string }[] = [
  { text: 'Treasury yields rise as Fed officials signal higher-for-longer rates', source: 'CNBC' },
  { text: 'Nvidia surges on data center demand as AI spending accelerates', source: 'Bloomberg' },
  { text: 'Oil prices climb after OPEC+ signals deeper production cuts', source: 'CNBC' },
  { text: 'Apple announces $110B share buyback, largest in corporate history', source: 'Bloomberg' },
  { text: 'Regional banks under pressure as commercial real estate concerns mount', source: 'CNBC' },
  { text: 'Fed Chair Powell: "We need greater confidence inflation is moving toward 2%"', source: 'CNBC' },
  { text: 'Semiconductor stocks rally on strong TSMC earnings beat', source: 'Bloomberg' },
  { text: 'Bitcoin crosses $100K as institutional inflows hit record levels', source: 'Yahoo' },
  { text: 'Tesla shares volatile after mixed Q4 delivery numbers', source: 'CNBC' },
  { text: 'Goldman Sachs raises S&P 500 year-end target to 6,500', source: 'Bloomberg' },
  { text: 'China tariff escalation rattles markets, Dow drops 400 points', source: 'CNBC' },
  { text: 'Microsoft Azure revenue beats estimates, cloud growth accelerates', source: 'Bloomberg' },
  { text: 'CPI comes in hotter than expected at 3.5%, markets sell off', source: 'CNBC' },
  { text: 'Amazon expands same-day delivery network, logistics costs decline', source: 'Yahoo' },
  { text: 'Palantir wins $480M Pentagon contract, shares jump 12%', source: 'Bloomberg' },
  { text: 'Retail sales stronger than forecast, consumer spending resilient', source: 'CNBC' },
  { text: 'Broadcom guidance lifts chip sector, SOXX up 3%', source: 'Bloomberg' },
  { text: 'JPMorgan CEO Jamie Dimon warns of persistent inflation risks', source: 'CNBC' },
  { text: 'Meta AI investments weigh on margins but revenue tops estimates', source: 'Bloomberg' },
  { text: 'Crude oil spikes on Middle East supply disruption fears', source: 'Yahoo' },
];

const HEADLINE_TTL = 60_000; // keep headlines for 60 seconds
const INTERVAL_MS = 12_000;  // new headline every ~12 seconds

let mockIndex = 0;
let idCounter = 0;

/**
 * Simulates live headline extraction from a video stream.
 * Returns a rotating buffer of recent headlines (max 60s old).
 */
export function useHeadlineParser(channel: string, isLive: boolean) {
  const [headlines, setHeadlines] = useState<LiveHeadline[]>([]);
  const bufferRef = useRef<LiveHeadline[]>([]);

  const addHeadline = useCallback(() => {
    const mock = MOCK_HEADLINES[mockIndex % MOCK_HEADLINES.length];
    mockIndex++;

    const newItem: LiveHeadline = {
      id: `lh-${++idCounter}`,
      text: mock.text,
      source: mock.source,
      timestamp: Date.now(),
    };

    // Deduplicate: skip if same text already in buffer
    if (bufferRef.current.some(h => h.text === newItem.text)) return;

    const now = Date.now();
    const fresh = [...bufferRef.current.filter(h => now - h.timestamp < HEADLINE_TTL), newItem];
    bufferRef.current = fresh;
    setHeadlines([...fresh]);
  }, []);

  useEffect(() => {
    if (!isLive) return;

    // Reset on channel change
    bufferRef.current = [];
    setHeadlines([]);
    mockIndex = Math.floor(Math.random() * MOCK_HEADLINES.length);

    // Add first headline quickly
    const initialTimer = setTimeout(addHeadline, 1500);
    const interval = setInterval(addHeadline, INTERVAL_MS);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [channel, isLive, addHeadline]);

  // Prune stale headlines
  useEffect(() => {
    if (!isLive) return;
    const pruneInterval = setInterval(() => {
      const now = Date.now();
      const fresh = bufferRef.current.filter(h => now - h.timestamp < HEADLINE_TTL);
      if (fresh.length !== bufferRef.current.length) {
        bufferRef.current = fresh;
        setHeadlines([...fresh]);
      }
    }, 5000);
    return () => clearInterval(pruneInterval);
  }, [isLive]);

  return headlines;
}
