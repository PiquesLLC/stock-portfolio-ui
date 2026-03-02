import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocalStorage } from './useLocalStorage';
import type Hls from 'hls.js';
import { Channel, CHANNELS } from '../utils/channels';
import { TabType } from '../components/Navigation';

interface UseStreamManagerParams {
  activeTab: TabType;
  viewingStock: unknown;
}

export function useStreamManager({ activeTab, viewingStock }: UseStreamManagerParams) {
  const [pipEnabled, setPipEnabled] = useLocalStorage('pipEnabled', true);
  const [streamActive, setStreamActive] = useState(false);
  const [activeChannel, setActiveChannel] = useState<Channel>(CHANNELS[0]);
  const [streamStatus, setStreamStatus] = useState('Loading stream...');
  const [streamHasError, setStreamHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const watchVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const miniVideoContainerRef = useRef<HTMLDivElement>(null);
  const loadedChannelRef = useRef<string | null>(null);
  const [containerReady, setContainerReady] = useState(0);

  const watchContainerCallback = useCallback((node: HTMLDivElement | null) => {
    watchVideoContainerRef.current = node;
    if (node) setContainerReady(c => c + 1);
  }, []);

  const handlePipToggle = useCallback((enabled: boolean) => {
    setPipEnabled(enabled);
  }, [setPipEnabled]);

  useEffect(() => {
    if (activeTab === 'watch') {
      setStreamActive(true);
    } else if (!pipEnabled) {
      setStreamActive(false);
    }
  }, [activeTab, pipEnabled]);

  const handleManualPlay = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      video.play().then(() => setStreamStatus('')).catch(() => {});
    }
  }, []);

  const watchFullyVisible = activeTab === 'watch' && !viewingStock;
  const showMiniPlayer = streamActive && pipEnabled && !watchFullyVisible;

  const handleMiniPlayerClose = useCallback(() => setStreamActive(false), []);

  // Helper: fully reset video element so a fresh HLS can attach cleanly
  const resetVideoElement = useCallback((video: HTMLVideoElement) => {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }, []);

  // Helper: tear down HLS instance and reset refs
  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      loadedChannelRef.current = null;
    }
  }, []);

  // Unified HLS effect
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;

    const shouldBeActive = watchFullyVisible || (streamActive && pipEnabled);

    // Move video element to the correct container
    if (watchFullyVisible && watchVideoContainerRef.current) {
      watchVideoContainerRef.current.appendChild(video);
      video.style.display = '';
    } else if (shouldBeActive && !watchFullyVisible && miniVideoContainerRef.current) {
      miniVideoContainerRef.current.appendChild(video);
      video.style.display = '';
    } else {
      video.style.display = 'none';
    }

    // Tear down when stream should not be active
    if (!shouldBeActive) {
      destroyHls();
      resetVideoElement(video);
      setStreamStatus('Loading stream...');
      setStreamHasError(false);
      return;
    }

    // Channel changed — destroy old instance so we recreate below
    if (hlsRef.current && loadedChannelRef.current !== activeChannel.id) {
      destroyHls();
      resetVideoElement(video);
      setStreamStatus('Loading stream...');
      setStreamHasError(false);
    }

    // Already loaded for the current channel — nothing to do
    if (hlsRef.current) return;

    setStreamStatus('Loading stream...');
    setStreamHasError(false);

    // Dynamic import hls.js only when needed (saves ~250KB from initial bundle)
    import('hls.js').then(({ default: HlsLib }) => {
      // Guard: effect was cleaned up or another instance was created while awaiting import
      if (cancelled || hlsRef.current) return;

      if (HlsLib.isSupported()) {
        const hls = new HlsLib({
          enableWorker: false,
          debug: false,
          lowLatencyMode: true,
          xhrSetup: (xhr: XMLHttpRequest) => { xhr.withCredentials = false; },
        });
        hlsRef.current = hls;
        loadedChannelRef.current = activeChannel.id;

        hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
          setStreamStatus('');
          setStreamHasError(false);
          video.play().catch(() => setStreamStatus('Click to play'));
        });

        hls.on(HlsLib.Events.ERROR, (_event: string, data: { type: string; details: string; fatal: boolean }) => {
          console.error('HLS error:', data.type, data.details);
          if (data.fatal) {
            setStreamHasError(true);
            switch (data.type) {
              case HlsLib.ErrorTypes.NETWORK_ERROR:
                setStreamStatus('Network error — retrying...');
                hls.startLoad();
                break;
              case HlsLib.ErrorTypes.MEDIA_ERROR:
                setStreamStatus('Media error — recovering...');
                hls.recoverMediaError();
                break;
              default:
                setStreamStatus('Stream unavailable');
                hls.destroy();
                hlsRef.current = null;
                loadedChannelRef.current = null;
                break;
            }
          }
        });

        hls.loadSource(activeChannel.url);
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = activeChannel.url;
        loadedChannelRef.current = activeChannel.id;
        const onMeta = () => {
          if (cancelled) return;
          setStreamStatus('');
          video.play().catch(() => {
            if (!cancelled) setStreamStatus('Click to play');
          });
        };
        video.addEventListener('loadedmetadata', onMeta, { once: true });
      } else {
        setStreamStatus('HLS not supported in this browser');
        setStreamHasError(true);
      }
    });

    return () => { cancelled = true; };
  }, [streamActive, activeTab, pipEnabled, activeChannel, containerReady, watchFullyVisible, destroyHls, resetVideoElement]);

  return {
    streamActive,
    setStreamActive,
    activeChannel,
    setActiveChannel,
    streamStatus,
    streamHasError,
    pipEnabled,
    handlePipToggle,
    handleManualPlay,
    watchFullyVisible,
    showMiniPlayer,
    handleMiniPlayerClose,
    videoRef,
    watchContainerCallback,
    miniVideoContainerRef,
  };
}
