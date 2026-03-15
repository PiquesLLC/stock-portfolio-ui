import { useEffect, useState } from 'react';
import { clearNativeLog, getNativeLog, subscribeNativeLog } from '../utils/nativeDebug';
import { isNativePlatform } from '../utils/platform';

export function NativeDebugOverlay() {
  const [lines, setLines] = useState<string[]>(() => getNativeLog());

  useEffect(() => {
    if (!isNativePlatform()) return;
    return subscribeNativeLog(() => setLines(getNativeLog()));
  }, []);

  if (!isNativePlatform()) return null;

  return (
    <div className="fixed inset-x-2 bottom-2 z-[9999] rounded-xl border border-white/10 bg-black/90 p-2 shadow-2xl backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">Native Debug</div>
        <button
          type="button"
          onClick={clearNativeLog}
          className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/60"
        >
          Clear
        </button>
      </div>
      <div className="max-h-36 overflow-auto font-mono text-[10px] leading-4 text-white/80">
        {lines.length === 0 ? (
          <div className="text-white/30">No native logs yet</div>
        ) : (
          lines.slice(-10).map((line, index) => (
            <div key={`${index}-${line}`} className="break-words">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
