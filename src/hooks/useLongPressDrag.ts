import { useRef, useState, useCallback } from 'react';
import type { DragControls } from 'framer-motion';

interface UseLongPressDragReturn {
  /** True during the 350ms hold window */
  isPressed: boolean;
  /** True once the drag has been activated */
  isDragActive: boolean;
  /** Call this on pointerDown */
  onPointerDown: (e: React.PointerEvent) => void;
  /** Call this on pointerMove */
  onPointerMove: (e: React.PointerEvent) => void;
  /** Call this on pointerUp / pointerCancel */
  onPointerUp: () => void;
  /** Returns true if a click should be suppressed (within 60ms of a drag end) */
  shouldSuppressClick: () => boolean;
}

const LONG_PRESS_MS = 350;
const MOVE_THRESHOLD = 8; // px — cancel if finger moves more than this during hold
const CLICK_SUPPRESS_MS = 60;

export function useLongPressDrag(dragControls: DragControls): UseLongPressDragReturn {
  const [isPressed, setIsPressed] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const nativeEventRef = useRef<PointerEvent | null>(null);
  const targetRef = useRef<HTMLElement | null>(null);
  const pointerIdRef = useRef<number>(-1);
  const lastDragEndRef = useRef(0);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsPressed(false);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle primary pointer (left click / single touch)
    if (e.button !== 0) return;
    // A second finger landing during the press would otherwise stomp our
    // refs and spawn a duplicate long-press timer. Ignore re-entry.
    if (timerRef.current || pointerIdRef.current !== -1) return;

    startPosRef.current = { x: e.clientX, y: e.clientY };
    nativeEventRef.current = e.nativeEvent;
    targetRef.current = e.currentTarget as HTMLElement;
    pointerIdRef.current = e.pointerId;
    setIsPressed(true);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsDragActive(true);

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(20);
      }

      // Claim the pointer for the element so WKWebView routes subsequent
      // pointermoves to our handler (and to framer-motion's drag listener)
      // instead of routing them to the browser's scroll machinery. Mobile
      // Safari is permissive about this; WKWebView is not.
      if (targetRef.current && pointerIdRef.current !== -1) {
        try { targetRef.current.setPointerCapture(pointerIdRef.current); } catch { /* element may have unmounted */ }
      }

      // Start framer-motion drag with the MOST RECENT pointer event, not
      // the 350ms-stale pointerdown. WKWebView does not reliably establish
      // fresh pointer capture from a stale event, so passing the latest
      // pointermove (kept fresh by `onPointerMove` below) gives framer-motion
      // a usable event to seed its drag from.
      if (nativeEventRef.current) {
        dragControls.start(nativeEventRef.current);
      }
    }, LONG_PRESS_MS);
  }, [dragControls]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current || !timerRef.current) return;

    // Keep the native event fresh — when the long-press timer fires it will
    // pass THIS event to dragControls.start, not the stale pointerdown.
    nativeEventRef.current = e.nativeEvent;

    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > MOVE_THRESHOLD) {
      cancel();
    }
  }, [cancel]);

  const onPointerUp = useCallback(() => {
    cancel();
    if (targetRef.current && pointerIdRef.current !== -1) {
      try { targetRef.current.releasePointerCapture(pointerIdRef.current); } catch { /* not captured / detached */ }
    }
    targetRef.current = null;
    pointerIdRef.current = -1;
    if (isDragActive) {
      lastDragEndRef.current = Date.now();
      setIsDragActive(false);
    }
  }, [cancel, isDragActive]);

  const shouldSuppressClick = useCallback(() => {
    return Date.now() - lastDragEndRef.current < CLICK_SUPPRESS_MS;
  }, []);

  return {
    isPressed,
    isDragActive,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    shouldSuppressClick,
  };
}
