import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const STREAM_URL = '/hls/cnbc/cnbcsd.m3u8';

export function WatchPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [status, setStatus] = useState<string>('Loading stream...');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        debug: false,
        lowLatencyMode: true,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('');
        video.play().catch(() => {
          setStatus('Click to play');
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS error:', data.type, data.details, data);
        if (data.fatal) {
          setHasError(true);
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setStatus('Network error — retrying...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setStatus('Media error — recovering...');
              hls.recoverMediaError();
              break;
            default:
              setStatus('Stream unavailable');
              hls.destroy();
              break;
          }
        }
      });

      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = STREAM_URL;
      video.addEventListener('loadedmetadata', () => {
        setStatus('');
        video.play().catch(() => {
          setStatus('Click to play');
        });
      });
    } else {
      setStatus('HLS not supported in this browser');
      setHasError(true);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  return (
    <div className="max-w-5xl mx-auto py-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-rh-light-text dark:text-rh-text">Watch</h1>
        <p className="text-sm text-rh-light-muted dark:text-rh-muted mt-1">Live financial news</p>
      </div>

      <div className="bg-black rounded-xl overflow-hidden border border-rh-light-border dark:border-rh-border">
        <div className="flex items-center gap-2 px-4 py-2 bg-rh-light-card dark:bg-rh-card border-b border-rh-light-border dark:border-rh-border">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-sm font-semibold text-rh-light-text dark:text-rh-text">CNBC Live</span>
        </div>
        <div className="relative">
          <video
            ref={videoRef}
            controls
            playsInline
            autoPlay
            muted
            className="w-full aspect-video"
            style={{ background: '#000' }}
          />
          {status && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={`text-sm px-3 py-1.5 rounded-lg ${hasError ? 'bg-red-500/20 text-red-400' : 'bg-black/60 text-white/70'}`}>
                {status}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
