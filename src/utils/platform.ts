import { Capacitor } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

export function isNativePlatform(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  if (typeof window === 'undefined') return false;
  return window.location.protocol === 'capacitor:'
    || window.location.protocol === 'ionic:'
    || window.location.protocol === 'app:';
}
