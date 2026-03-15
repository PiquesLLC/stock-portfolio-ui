import { useEffect, useRef, useState } from 'react';
import { clearNativeLog, getNativeLog, subscribeNativeLog } from '../utils/nativeDebug';
import { isNativePlatform } from '../utils/platform';

export function NativeDebugOverlay() {
  const [lines, setLines] = useState<string[]>(() => getNativeLog());
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const nativeSessionRaw = typeof window !== 'undefined' ? localStorage.getItem('nala_native_auth') : null;
  const cachedUserRaw = typeof window !== 'undefined' ? localStorage.getItem('nala_auth_user') : null;

  useEffect(() => {
    if (!isNativePlatform()) return;
    return subscribeNativeLog(() => setLines(getNativeLog()));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, expanded]);

  if (!isNativePlatform()) return null;

  const displayLines = expanded ? lines : lines.slice(-6);

  return (
    <div className="fixed inset-x-2 bottom-2 z-[9999] rounded-xl border border-white/10 bg-black/90 p-2 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70"
        >
          Native Debug ({lines.length}) {expanded ? '▼' : '▲'}
        </button>
        <button
          type="button"
          onClick={clearNativeLog}
          className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/60"
        >
          Clear
        </button>
      </div>
      <div
        ref={scrollRef}
        className="overflow-auto font-mono text-[10px] leading-4 text-white/80"
        style={{ maxHeight: expanded ? '50vh' : '9rem' }}
      >
        <div className="mb-2 border-b border-white/10 pb-2 text-white/55">
          <div>native_auth: {nativeSessionRaw ? 'present' : 'missing'}</div>
          <div>auth_user: {cachedUserRaw ? 'present' : 'missing'}</div>
        </div>
        {displayLines.length === 0 ? (
          <div className="text-white/30">No native logs yet</div>
        ) : (
          displayLines.map((line, index) => (
            <div key={`${index}-${line}`} className="break-words">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
