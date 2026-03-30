import type { AppSettings } from '../domain/models';
import { DEFAULT_SETTINGS } from '../domain/models';

/** 将每日学习提醒配置同步给 Expo WebView 壳 */
export function postNotificationSettingsToNative(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  const bridge = (
    window as Window & {
      ReactNativeWebView?: { postMessage: (data: string) => void };
    }
  ).ReactNativeWebView;
  if (!bridge?.postMessage) return;
  const hour =
    typeof settings.dailyReminderHour === 'number'
      ? settings.dailyReminderHour
      : DEFAULT_SETTINGS.dailyReminderHour;
  const minute =
    typeof settings.dailyReminderMinute === 'number'
      ? settings.dailyReminderMinute
      : DEFAULT_SETTINGS.dailyReminderMinute;
  try {
    bridge.postMessage(
      JSON.stringify({
        type: 'notificationSettings',
        daily: {
          enabled: settings.dailyReminderEnabled === true,
          hour: Math.max(0, Math.min(23, Math.floor(hour))),
          minute: Math.max(0, Math.min(59, Math.floor(minute))),
        },
      }),
    );
  } catch {
    // ignore
  }
}

/** 复习待办从「无」变为「有」时触发一次（由调用方检测边沿） */
export function postReviewDueOnceToNative(): void {
  if (typeof window === 'undefined') return;
  const bridge = (
    window as Window & {
      ReactNativeWebView?: { postMessage: (data: string) => void };
    }
  ).ReactNativeWebView;
  if (!bridge?.postMessage) return;
  try {
    bridge.postMessage(JSON.stringify({ type: 'reviewDueOnce' }));
  } catch {
    // ignore
  }
}
