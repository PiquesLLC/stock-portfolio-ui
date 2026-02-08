import { MarketSession } from '../types';

export function etToLocal(hour: number, minute: number): string {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const localDate = new Date(now);
  const offsetMs = localDate.getTime() - etDate.getTime();
  const etToday = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  etToday.setHours(hour, minute, 0, 0);
  const local = new Date(etToday.getTime() + offsetMs);
  return local.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function getLocalTzAbbr(): string {
  return new Intl.DateTimeFormat([], { timeZoneName: 'short' }).formatToParts(new Date())
    .find(p => p.type === 'timeZoneName')?.value || '';
}

export function getSessionDisplay(session?: MarketSession): { label: string; color: string; description: string } {
  const tz = getLocalTzAbbr();
  switch (session) {
    case 'PRE': return { label: 'PRE', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', description: `Pre-Market (${etToLocal(4, 0)} - ${etToLocal(9, 30)} ${tz})` };
    case 'REG': return { label: 'OPEN', color: 'bg-green-500/20 text-green-400 border-green-500/30', description: `Regular Session (${etToLocal(9, 30)} - ${etToLocal(16, 0)} ${tz})` };
    case 'POST': return { label: 'AH', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', description: `After-Hours (${etToLocal(16, 0)} - ${etToLocal(20, 0)} ${tz})` };
    case 'CLOSED': return { label: 'CLOSED', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', description: 'Market Closed' };
    default: return { label: 'CLOSED', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', description: 'Market Closed' };
  }
}
