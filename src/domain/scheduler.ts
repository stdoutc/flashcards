import type { Card, ReviewLogEntry, ReviewRating } from './models';

// ── 工具：今日起始时间戳 ──────────────────────
export function getTodayStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// ── 统计今日已学新卡 / 已复习旧卡数量 ──────────
// 规则：
//   - 今日首次出现在日志里的卡片 → 算"今日新卡"
//   - 今日出现在日志、但之前已有历史日志的卡片 → 算"今日复习"
export function getDailyProgress(
  reviewLogs: ReviewLogEntry[],
  deckId: string,
  now = Date.now(),
): { newToday: number; reviewToday: number } {
  const todayStart = getTodayStart(now);
  const deckLogs = reviewLogs.filter((l) => l.deckId === deckId);
  const todayLogs = deckLogs.filter((l) => l.reviewedAt >= todayStart);

  // 今日出现的唯一卡 ID
  const todayCardIds = [...new Set(todayLogs.map((l) => l.cardId))];

  let newToday = 0;
  let reviewToday = 0;

  for (const cardId of todayCardIds) {
    const hadPrior = deckLogs.some(
      (l) => l.cardId === cardId && l.reviewedAt < todayStart,
    );
    if (hadPrior) reviewToday++;
    else newToday++;
  }

  return { newToday, reviewToday };
}

// ── 格式化时间间隔 ────────────────────────────
export function formatInterval(ms: number): string {
  const minutes = ms / (60 * 1000);
  const hours = ms / (60 * 60 * 1000);
  const days = ms / (24 * 60 * 60 * 1000);
  const weeks = days / 7;
  const months = days / 30;
  if (minutes < 90) return `${Math.round(minutes)} 分钟`;
  if (hours < 22) return `${Math.round(hours)} 小时`;
  if (days < 14) return `${Math.round(days)} 天`;
  if (weeks < 8) return `${Math.round(weeks)} 周`;
  return `${Math.round(months)} 月`;
}

// ── 预览各评级对应的下次复习间隔 ─────────────
export function previewNextIntervals(card: Card): Record<ReviewRating, string> {
  const now = Date.now();
  const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
  const result = {} as Record<ReviewRating, string>;
  for (const r of ratings) {
    const { updatedCard } = scheduleReview(card, r, now);
    result[r] = formatInterval(updatedCard.interval);
  }
  return result;
}

// ── 间隔重复调度算法 ─────────────────────────
export interface ScheduleResult {
  updatedCard: Card;
}

const DAY = 24 * 60 * 60 * 1000;

export function scheduleReview(card: Card, rating: ReviewRating, now: number): ScheduleResult {
  const previousInterval = card.interval || DAY;
  let ease = card.easeFactor || 2.5;
  let interval = previousInterval;

  switch (rating) {
    case 'again':
      ease = Math.max(1.3, ease - 0.2);
      interval = DAY;
      break;
    case 'hard':
      ease = Math.max(1.3, ease - 0.05);
      interval = Math.max(DAY, previousInterval * 1.2);
      break;
    case 'good':
      interval = previousInterval * ease;
      break;
    case 'easy':
      ease += 0.05;
      interval = previousInterval * (ease + 0.15);
      break;
    default:
      break;
  }

  const masteryDelta =
    rating === 'again' ? -1 : rating === 'hard' ? 0 : rating === 'good' ? 1 : 2;

  const updatedCard: Card = {
    ...card,
    easeFactor: ease,
    interval,
    nextReview: now + interval,
    lastReviewAt: now,
    mastery: Math.min(5, Math.max(0, (card.mastery || 0) + masteryDelta)),
    updatedAt: now,
  };

  return { updatedCard };
}

// ── 选取下一张卡片（支持每日限制） ────────────
//
// 三类卡片优先级：
//   1. 学习中 (learning)：今日已首次学习、且 nextReview <= now
//      → 继续当次学习，不受日限约束
//   2. 待复习 (review)：lastReviewAt < todayStart 且 nextReview <= now
//      → 受 reviewPerDay 限制
//   3. 新卡 (new)：lastReviewAt === null
//      → 受 newPerDay 限制
//
export interface PickOptions {
  newPerDay: number;
  reviewPerDay: number;
  reviewLogs: ReviewLogEntry[];
  deckId: string;
}

export function pickNextCard(
  cards: Card[],
  now: number,
  options?: PickOptions,
): Card | null {
  if (!cards.length) return null;

  // 无日限模式（兜底）
  if (!options) {
    const due = cards.filter((c) => !c.nextReview || c.nextReview <= now);
    const pool = due.length > 0 ? due : cards;
    return [...pool].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0] ?? null;
  }

  const { newPerDay, reviewPerDay, reviewLogs, deckId } = options;
  const todayStart = getTodayStart(now);
  const { newToday, reviewToday } = getDailyProgress(reviewLogs, deckId, now);

  // 1. 学习中（今日首次学习后仍需继续复习的卡片）
  const learningCards = cards.filter(
    (c) =>
      c.lastReviewAt !== null &&
      c.lastReviewAt >= todayStart &&
      (c.nextReview ?? 0) <= now,
  );
  if (learningCards.length > 0) {
    return [...learningCards].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];
  }

  // 2. 待复习的成熟卡片
  if (reviewToday < reviewPerDay) {
    const reviewCards = cards.filter(
      (c) =>
        c.lastReviewAt !== null &&
        c.lastReviewAt < todayStart &&
        (c.nextReview ?? 0) <= now,
    );
    if (reviewCards.length > 0) {
      return [...reviewCards].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];
    }
  }

  // 3. 全新卡片
  if (newToday < newPerDay) {
    const newCards = cards.filter((c) => c.lastReviewAt === null);
    if (newCards.length > 0) return newCards[0];
  }

  return null;
}
