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

    startPosRef.current = { x: e.clientX, y: e.clientY };
    nativeEventRef.current = e.nativeEvent;
    setIsPressed(true);

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setIsDragActive(true);

      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(20);
      }

      // Start framer-motion drag with the stored native event
      if (nativeEventRef.current) {
        dragControls.start(nativeEventRef.current);
      }
    }, LONG_PRESS_MS);
  }, [dragControls]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!startPosRef.current || !timerRef.current) return;

    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > MOVE_THRESHOLD) {
      cancel();
    }
  }, [cancel]);

  const onPointerUp = useCallback(() => {
    cancel();
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
