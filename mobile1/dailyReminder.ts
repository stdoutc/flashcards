import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const ANDROID_CHANNEL_ID = "flashcard-reminders";
const NOTIF_ID_DAILY = "flashcard-notif-daily";
/** 旧版周期性复习提醒 id，启动时取消以免残留 */
const NOTIF_ID_REVIEW_LEGACY = "flashcard-notif-review-due";
const NOTIF_ID_REVIEW_ONCE = "flashcard-notif-review-once";

let handlerConfigured = false;

function ensureNotificationHandler(): void {
  if (handlerConfigured) return;
  handlerConfigured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "学习提醒",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type NotificationSettingsPayload = {
  daily: {
    enabled: boolean;
    hour: number;
    minute: number;
  };
};

async function cancelById(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // 未找到时忽略
  }
}

/** 根据网页同步的配置调度「每日学习」本地通知 */
export async function applyNotificationSettingsFromWeb(
  payload: NotificationSettingsPayload,
): Promise<void> {
  ensureNotificationHandler();
  await ensureAndroidChannel();

  await cancelById(NOTIF_ID_DAILY);
  await cancelById(NOTIF_ID_REVIEW_LEGACY);

  if (!payload.daily.enabled) return;

  const perm = await Notifications.requestPermissionsAsync();
  if (perm.status !== "granted") return;

  const hour = Math.max(0, Math.min(23, Math.floor(payload.daily.hour)));
  const minute = Math.max(0, Math.min(59, Math.floor(payload.daily.minute)));
  const androidChannel = Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {};

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID_DAILY,
    content: {
      title: "该复习啦",
      body: "打开应用，完成今日卡片学习",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      ...androidChannel,
    },
  });
}

/** 复习待办边沿触发：单次本地通知（约 1.5 秒后） */
export async function applyReviewDueOnceFromWeb(): Promise<void> {
  ensureNotificationHandler();
  await ensureAndroidChannel();

  const perm = await Notifications.requestPermissionsAsync();
  if (perm.status !== "granted") return;

  const androidChannel = Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {};

  await cancelById(NOTIF_ID_REVIEW_ONCE);

  await Notifications.scheduleNotificationAsync({
    identifier: NOTIF_ID_REVIEW_ONCE,
    content: {
      title: "有待复习的卡片",
      body: "当前有卡片已到复习时间，打开应用继续学习",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: Date.now() + 1500,
      ...androidChannel,
    },
  });
}
