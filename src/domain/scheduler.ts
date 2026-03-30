import type { Card, FlashcardState, ReviewLogEntry, ReviewRating, ReviewState } from './models';

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
export function previewNextIntervals(card: Card, now: number = Date.now()): Record<ReviewRating, string> {
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

export const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
export const RETIRED_MASTERY = 4;

interface LearningPhaseTuning {
  stepsMs: number[];
  hardIntervalFactor: number;
  againEaseDelta: number;
  hardEaseDelta: number;
  easyEaseDelta: number;
  graduatingIntervalMs: number;
  easyGraduatingIntervalMs: number;
  /** relearning 阶段毕业时应用，取 max(毕业间隔, 当前间隔 * multiplier) */
  lapseMultiplier?: number;
}

interface ReviewPhaseTuning {
  intervalModifier: number;
  hardIntervalFactor: number;
  easyBonus: number;
  againEaseDelta: number;
  hardEaseDelta: number;
  easyEaseDelta: number;
  relearningIntervalMs: number;
}

interface SchedulerTuning {
  initialEase: number;
  minEase: number;
  maxEase: number;
  learning: LearningPhaseTuning;
  relearning: LearningPhaseTuning;
  review: ReviewPhaseTuning;
}

/**
 * 尽量贴近 Anki 的参数分层：
 * - learning / relearning / review 分开配置
 * - 各评级在不同阶段可使用不同增减幅度与倍率
 */
export const SCHEDULER_TUNING: SchedulerTuning = {
  initialEase: 2.5,
  minEase: 1.3,
  maxEase: 3.5,
  learning: {
    stepsMs: [1 * MINUTE, 10 * MINUTE],
    hardIntervalFactor: 1.5,
    againEaseDelta: -0.2,
    hardEaseDelta: -0.05,
    easyEaseDelta: 0.15,
    graduatingIntervalMs: 1 * DAY,
    easyGraduatingIntervalMs: 4 * DAY,
  },
  relearning: {
    stepsMs: [10 * MINUTE],
    hardIntervalFactor: 1.3,
    againEaseDelta: -0.2,
    hardEaseDelta: -0.05,
    easyEaseDelta: 0.1,
    graduatingIntervalMs: 1 * DAY,
    easyGraduatingIntervalMs: 3 * DAY,
    lapseMultiplier: 0.5,
  },
  review: {
    intervalModifier: 1.0,
    hardIntervalFactor: 1.2,
    easyBonus: 1.3,
    againEaseDelta: -0.2,
    hardEaseDelta: -0.15,
    easyEaseDelta: 0.15,
    relearningIntervalMs: 10 * MINUTE,
  },
};

function applyMasteryDelta(card: Card, rating: ReviewRating): number {
  // 保证每次完成一次作答都有熟练度反馈：
  // again 降低；hard/good/easy 逐级提升。
  const delta = rating === 'again' ? -1 : rating === 'easy' ? 2 : 1;
  return Math.min(RETIRED_MASTERY, Math.max(0, (card.mastery || 0) + delta));
}

function inferReviewState(card: Card): ReviewState {
  // 必须先判断「从未学习」：否则脏数据 reviewState='new' 与 lastReviewAt 同时存在时会一直走「新卡」分支，
  // 或错误地覆盖调度结果，表现为熟练度/间隔不更新。
  if (card.lastReviewAt === null) return 'new';
  if (card.reviewState === 'learning' || card.reviewState === 'relearning') return card.reviewState;
  if (card.reviewState === 'review') return 'review';
  if (card.reviewState === 'new') {
    return (card.interval ?? 0) < DAY ? 'learning' : 'review';
  }
  // 已作答但缺 reviewState（导入/旧数据）：短间隔视为仍在学习步
  if (!card.reviewState) {
    return (card.interval ?? 0) < DAY ? 'learning' : 'review';
  }
  return 'review';
}

export function isRetiredCard(card: Card): boolean {
  return (card.mastery ?? 0) >= RETIRED_MASTERY;
}

function getDueAt(card: Card): number {
  return card.nextReview ?? 0;
}

function clampEase(v: number): number {
  return Math.max(
    SCHEDULER_TUNING.minEase,
    Math.min(SCHEDULER_TUNING.maxEase, v),
  );
}

function applyLearningStep(
  card: Card,
  now: number,
  rating: ReviewRating,
  phase: LearningPhaseTuning,
  mode: 'learning' | 'relearning',
): Card {
  const ease = card.easeFactor || SCHEDULER_TUNING.initialEase;
  const stepMs = phase.stepsMs;
  const step = card.learningStep ?? 0;
  const currentDelay = stepMs[Math.min(step, stepMs.length - 1)] ?? stepMs[0] ?? MINUTE;

  if (rating === 'again') {
    return {
      ...card,
      easeFactor: clampEase(ease + phase.againEaseDelta),
      interval: stepMs[0] ?? MINUTE,
      nextReview: now + (stepMs[0] ?? MINUTE),
      lastReviewAt: now,
      reviewState: mode,
      learningStep: 0,
      lapses: (card.lapses ?? 0) + 1,
      reps: (card.reps ?? 0) + 1,
      mastery: applyMasteryDelta(card, rating),
      updatedAt: now,
    };
  }

  if (rating === 'hard') {
    const hardDelay = Math.max(MINUTE, Math.round(currentDelay * phase.hardIntervalFactor));
    return {
      ...card,
      easeFactor: clampEase(ease + phase.hardEaseDelta),
      interval: hardDelay,
      nextReview: now + hardDelay,
      lastReviewAt: now,
      reviewState: mode,
      learningStep: step,
      reps: (card.reps ?? 0) + 1,
      mastery: applyMasteryDelta(card, rating),
      updatedAt: now,
    };
  }

  if (rating === 'easy') {
    return {
      ...card,
      easeFactor: clampEase(ease + phase.easyEaseDelta),
      interval: phase.easyGraduatingIntervalMs,
      nextReview: now + phase.easyGraduatingIntervalMs,
      lastReviewAt: now,
      reviewState: 'review',
      learningStep: 0,
      reps: (card.reps ?? 0) + 1,
      mastery: applyMasteryDelta(card, rating),
      updatedAt: now,
    };
  }

  // good: 推进学习步，最后一步毕业到 review
  const nextStep = step + 1;
  if (nextStep < stepMs.length) {
    const nextDelay = stepMs[nextStep] ?? currentDelay;
    return {
      ...card,
      interval: nextDelay,
      nextReview: now + nextDelay,
      lastReviewAt: now,
      reviewState: mode,
      learningStep: nextStep,
      reps: (card.reps ?? 0) + 1,
      mastery: applyMasteryDelta(card, rating),
      updatedAt: now,
    };
  }

  const graduateInterval = phase.lapseMultiplier != null
    ? Math.max(
      phase.graduatingIntervalMs,
      Math.round((card.interval || DAY) * phase.lapseMultiplier),
    )
    : phase.graduatingIntervalMs;
  return {
    ...card,
    interval: graduateInterval,
    nextReview: now + graduateInterval,
    lastReviewAt: now,
    reviewState: 'review',
    learningStep: 0,
    reps: (card.reps ?? 0) + 1,
    mastery: applyMasteryDelta(card, rating),
    updatedAt: now,
  };
}

export function scheduleReview(card: Card, rating: ReviewRating, now: number): ScheduleResult {
  const state = inferReviewState(card);

  if (state === 'new') {
    const updated = applyLearningStep(
      { ...card, reviewState: 'learning', learningStep: card.learningStep ?? 0 },
      now,
      rating,
      SCHEDULER_TUNING.learning,
      'learning',
    );
    return { updatedCard: updated };
  }

  if (state === 'learning') {
    const updated = applyLearningStep(card, now, rating, SCHEDULER_TUNING.learning, 'learning');
    return { updatedCard: updated };
  }

  if (state === 'relearning') {
    const updated = applyLearningStep(card, now, rating, SCHEDULER_TUNING.relearning, 'relearning');
    return { updatedCard: updated };
  }

  // review 状态：Anki SM-2 风格区间增长
  const previousInterval = Math.max(DAY, card.interval || DAY);
  const ease = card.easeFactor || SCHEDULER_TUNING.initialEase;
  const reviewTuning = SCHEDULER_TUNING.review;

  if (rating === 'again') {
    const relearnDelay = reviewTuning.relearningIntervalMs;
    return {
      updatedCard: {
        ...card,
        easeFactor: clampEase(ease + reviewTuning.againEaseDelta),
        interval: relearnDelay,
        nextReview: now + relearnDelay,
        lastReviewAt: now,
        reviewState: 'relearning',
        learningStep: 0,
        lapses: (card.lapses ?? 0) + 1,
        reps: (card.reps ?? 0) + 1,
        mastery: applyMasteryDelta(card, rating),
        updatedAt: now,
      },
    };
  }

  let nextEase = ease;
  let nextInterval = previousInterval;
  if (rating === 'hard') {
    nextEase = clampEase(ease + reviewTuning.hardEaseDelta);
    nextInterval = Math.max(
      DAY,
      Math.round(previousInterval * reviewTuning.hardIntervalFactor * reviewTuning.intervalModifier),
    );
  } else if (rating === 'good') {
    nextInterval = Math.max(
      DAY,
      Math.round(previousInterval * ease * reviewTuning.intervalModifier),
    );
  } else {
    nextEase = clampEase(ease + reviewTuning.easyEaseDelta);
    nextInterval = Math.max(
      DAY,
      Math.round(previousInterval * ease * reviewTuning.easyBonus * reviewTuning.intervalModifier),
    );
  }

  return {
    updatedCard: {
      ...card,
      easeFactor: nextEase,
      interval: nextInterval,
      nextReview: now + nextInterval,
      lastReviewAt: now,
      reviewState: 'review',
      learningStep: 0,
      reps: (card.reps ?? 0) + 1,
      mastery: applyMasteryDelta(card, rating),
      updatedAt: now,
    },
  };
}

// ── 选取下一张卡片（支持每日限制） ────────────
//
// 三类卡片优先级：
//   1. 学习中 (learning)：今日已首次学习、且 nextReview <= now
//      → 继续当次学习，不受日限约束
//   2. 待复习 (review)：lastReviewAt < todayStart 且 nextReview <= now
//      → 不设每日上限，按到期全量出卡
//   3. 新卡 (new)：lastReviewAt === null
//      → 受 newPerDay 限制
//
export interface PickOptions {
  newPerDay: number;
  reviewLogs: ReviewLogEntry[];
  deckId: string;
}

export function pickNextCard(
  cards: Card[],
  now: number,
  options?: PickOptions,
): Card | null {
  const activeCards = cards.filter((c) => !isRetiredCard(c));
  if (!activeCards.length) return null;

  // 无日限模式（兜底）
  if (!options) {
    const todayStart = getTodayStart(now);
    // 与 StudyPage 统计一致：先今日到期，再往日到期（不依赖 inferReviewState===review，避免脏数据卡死）
    const todayDue = activeCards.filter(
      (c) =>
        c.lastReviewAt != null &&
        c.lastReviewAt >= todayStart &&
        getDueAt(c) <= now,
    );
    if (todayDue.length > 0) {
      return [...todayDue].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];
    }
    const matureDue = activeCards.filter(
      (c) =>
        c.lastReviewAt != null &&
        c.lastReviewAt < todayStart &&
        getDueAt(c) <= now,
    );
    if (matureDue.length > 0) {
      return [...matureDue].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];
    }

    const newCards = activeCards.filter((c) => inferReviewState(c) === 'new');
    if (newCards.length > 0) return newCards[0];
    return null;
  }

  const { newPerDay, reviewLogs, deckId } = options;
  const { newToday } = getDailyProgress(reviewLogs, deckId, now);
  const todayStart = getTodayStart(now);

  // 1 / 2. 与 StudyPage「待复习」计数完全一致：今日已学且到期 → 往日已学且到期
  //    成熟队列不能再用 inferReviewState==='review'：若 reviewState 脏为 new 会与界面张数不一致
  const todayDue = activeCards.filter(
    (c) =>
      c.lastReviewAt != null &&
      c.lastReviewAt >= todayStart &&
      getDueAt(c) <= now,
  );
  if (todayDue.length > 0) {
    return [...todayDue].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];
  }
  const matureDue = activeCards.filter(
    (c) =>
      c.lastReviewAt != null &&
      c.lastReviewAt < todayStart &&
      getDueAt(c) <= now,
  );
  if (matureDue.length > 0) {
    return [...matureDue].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];
  }

  // 3. 全新卡片
  if (newToday < newPerDay) {
    const newCards = activeCards.filter((c) => inferReviewState(c) === 'new');
    if (newCards.length > 0) return newCards[0];
  }

  return null;
}

/** 任意卡组中是否存在「当前时刻」可学的待办卡片（与复习页调度一致，含日限） */
export function hasAnyDueCards(state: FlashcardState, now: number): boolean {
  for (const deck of state.decks) {
    const deckCards = state.cards.filter((c) => c.deckId === deck.id);
    const next = pickNextCard(deckCards, now, {
      newPerDay: deck.newPerDay,
      reviewLogs: state.reviewLogs,
      deckId: deck.id,
    });
    if (next !== null) return true;
  }
  return false;
}
