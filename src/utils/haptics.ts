import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform';

/**
 * Haptic feedback utilities for native iOS/Android.
 * All functions are no-ops on web — safe to call unconditionally.
 */

/** Light tap — button presses, toggles, selections */
export async function hapticLight() {
  if (!isNative) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}

/** Medium tap — confirming actions, tab switches */
export async function hapticMedium() {
  if (!isNative) return;
  await Haptics.impact({ style: ImpactStyle.Medium });
}

/** Heavy tap — destructive actions, important state changes */
export async function hapticHeavy() {
  if (!isNative) return;
  await Haptics.impact({ style: ImpactStyle.Heavy });
}

/** Success notification — trade confirmed, login success */
export async function hapticSuccess() {
  if (!isNative) return;
  await Haptics.notification({ type: NotificationType.Success });
}

/** Warning notification — validation errors, alerts */
export async function hapticWarning() {
  if (!isNative) return;
  await Haptics.notification({ type: NotificationType.Warning });
}

/** Error notification — failed actions, network errors */
export async function hapticError() {
  if (!isNative) return;
  await Haptics.notification({ type: NotificationType.Error });
}

/** Selection tick — scrubbing through lists, chart hover */
export async function hapticSelection() {
  if (!isNative) return;
  await Haptics.selectionStart();
  await Haptics.selectionChanged();
  await Haptics.selectionEnd();
}
