import { describe, it, expect } from 'vitest';
import { CHANNELS } from './channels';

describe('CHANNELS', () => {
  it('has at least one channel', () => {
    expect(CHANNELS.length).toBeGreaterThan(0);
  });

  it('each channel has required fields', () => {
    for (const ch of CHANNELS) {
      expect(ch.id).toBeTruthy();
      expect(ch.name).toBeTruthy();
      expect(ch.url).toBeTruthy();
      expect(ch.website).toBeTruthy();
      expect(ch.description).toBeTruthy();
    }
  });

  it('has unique ids', () => {
    const ids = CHANNELS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
