import type { Card, ReviewLogEntry, ReviewRating, ReviewState } from "./models";

export function getTodayStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function getDailyProgress(
  reviewLogs: ReviewLogEntry[],
  deckId: string,
  now = Date.now()
): { newToday: number; reviewToday: number } {
  const todayStart = getTodayStart(now);
  const deckLogs = reviewLogs.filter((l) => l.deckId === deckId);
  const todayLogs = deckLogs.filter((l) => l.reviewedAt >= todayStart);
  const todayCardIds = [...new Set(todayLogs.map((l) => l.cardId))];

  let newToday = 0;
  let reviewToday = 0;
  for (const cardId of todayCardIds) {
    const hadPrior = deckLogs.some((l) => l.cardId === cardId && l.reviewedAt < todayStart);
    if (hadPrior) reviewToday++;
    else newToday++;
  }
  return { newToday, reviewToday };
}

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

export function previewNextIntervals(card: Card): Record<ReviewRating, string> {
  const now = Date.now();
  const ratings: ReviewRating[] = ["again", "hard", "good", "easy"];
  const result = {} as Record<ReviewRating, string>;
  for (const r of ratings) {
    const { updatedCard } = scheduleReview(card, r, now);
    result[r] = formatInterval(updatedCard.interval);
  }
  return result;
}

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const INITIAL_EASE = 2.5;
const MIN_EASE = 1.3;
const EASY_BONUS = 1.3;
const HARD_INTERVAL_MULT = 1.2;
const LAPSE_INTERVAL_MULT = 0.5;
const LEARNING_STEPS_MS = [1 * MINUTE, 10 * MINUTE];
const RELEARNING_STEPS_MS = [10 * MINUTE];
const GRADUATING_INTERVAL_MS = 1 * DAY;
const EASY_GRADUATE_INTERVAL_MS = 4 * DAY;
export const RETIRED_MASTERY = 4;

function applyMasteryDelta(card: Card, rating: ReviewRating): number {
  const delta = rating === "again" ? -1 : rating === "easy" ? 2 : 1;
  return Math.min(RETIRED_MASTERY, Math.max(0, (card.mastery || 0) + delta));
}

function inferReviewState(card: Card): ReviewState {
  if (card.reviewState) return card.reviewState;
  if (card.lastReviewAt === null) return "new";
  return "review";
}

export function isRetiredCard(card: Card): boolean {
  return (card.mastery ?? 0) >= RETIRED_MASTERY;
}

function getDueAt(card: Card): number {
  return card.nextReview ?? 0;
}

function clampEase(v: number): number {
  return Math.max(MIN_EASE, v);
}

function applyLearningStep(
  card: Card,
  now: number,
  rating: ReviewRating,
  stepMs: number[],
  mode: "learning" | "relearning"
): Card {
  const ease = card.easeFactor || INITIAL_EASE;
  const step = card.learningStep ?? 0;
  const currentDelay = stepMs[Math.min(step, stepMs.length - 1)] ?? stepMs[0] ?? MINUTE;

  if (rating === "again") {
    return {
      ...card,
      easeFactor: clampEase(ease - 0.2),
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

  if (rating === "hard") {
    const hardDelay = Math.max(MINUTE, Math.round(currentDelay * 1.5));
    return {
      ...card,
      easeFactor: clampEase(ease - 0.05),
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

  if (rating === "easy") {
    return {
      ...card,
      easeFactor: ease + 0.15,
      interval: EASY_GRADUATE_INTERVAL_MS,
      nextReview: now + EASY_GRADUATE_INTERVAL_MS,
      lastReviewAt: now,
      reviewState: "review",
      learningStep: 0,
      reps: (card.reps ?? 0) + 1,
      mastery: applyMasteryDelta(card, rating),
      updatedAt: now,
    };
  }

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

  const graduateInterval =
    mode === "relearning"
      ? Math.max(GRADUATING_INTERVAL_MS, Math.round((card.interval || DAY) * LAPSE_INTERVAL_MULT))
      : GRADUATING_INTERVAL_MS;
  return {
    ...card,
    interval: graduateInterval,
    nextReview: now + graduateInterval,
    lastReviewAt: now,
    reviewState: "review",
    learningStep: 0,
    reps: (card.reps ?? 0) + 1,
    mastery: applyMasteryDelta(card, rating),
    updatedAt: now,
  };
}

export function scheduleReview(card: Card, rating: ReviewRating, now: number): { updatedCard: Card } {
  const state = inferReviewState(card);

  if (state === "new") {
    return {
      updatedCard: applyLearningStep(
        { ...card, reviewState: "learning", learningStep: card.learningStep ?? 0 },
        now,
        rating,
        LEARNING_STEPS_MS,
        "learning"
      ),
    };
  }
  if (state === "learning") {
    return { updatedCard: applyLearningStep(card, now, rating, LEARNING_STEPS_MS, "learning") };
  }
  if (state === "relearning") {
    return { updatedCard: applyLearningStep(card, now, rating, RELEARNING_STEPS_MS, "relearning") };
  }

  const previousInterval = Math.max(DAY, card.interval || DAY);
  const ease = card.easeFactor || INITIAL_EASE;

  if (rating === "again") {
    const relearnDelay = RELEARNING_STEPS_MS[0] ?? 10 * MINUTE;
    return {
      updatedCard: {
        ...card,
        easeFactor: clampEase(ease - 0.2),
        interval: relearnDelay,
        nextReview: now + relearnDelay,
        lastReviewAt: now,
        reviewState: "relearning",
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
  if (rating === "hard") {
    nextEase = clampEase(ease - 0.15);
    nextInterval = Math.max(DAY, Math.round(previousInterval * HARD_INTERVAL_MULT));
  } else if (rating === "good") {
    nextInterval = Math.max(DAY, Math.round(previousInterval * ease));
  } else {
    nextEase = ease + 0.15;
    nextInterval = Math.max(DAY, Math.round(previousInterval * ease * EASY_BONUS));
  }

  return {
    updatedCard: {
      ...card,
      easeFactor: nextEase,
      interval: nextInterval,
      nextReview: now + nextInterval,
      lastReviewAt: now,
      reviewState: "review",
      learningStep: 0,
      reps: (card.reps ?? 0) + 1,
      mastery: applyMasteryDelta(card, rating),
      updatedAt: now,
    },
  };
}

export function pickNextCard(
  cards: Card[],
  now: number,
  options?: { newPerDay: number; reviewLogs: ReviewLogEntry[]; deckId: string }
): Card | null {
  const activeCards = cards.filter((c) => !isRetiredCard(c));
  if (!activeCards.length) return null;

  if (!options) {
    const learningCards = activeCards.filter(
      (c) => (inferReviewState(c) === "learning" || inferReviewState(c) === "relearning") && getDueAt(c) <= now
    );
    if (learningCards.length > 0) return [...learningCards].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];

    const reviewCards = activeCards.filter((c) => inferReviewState(c) === "review" && getDueAt(c) <= now);
    if (reviewCards.length > 0) return [...reviewCards].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];

    const newCards = activeCards.filter((c) => inferReviewState(c) === "new");
    return newCards[0] ?? null;
  }

  const { newPerDay, reviewLogs, deckId } = options;
  const { newToday } = getDailyProgress(reviewLogs, deckId, now);

  const learningCards = activeCards.filter(
    (c) => (inferReviewState(c) === "learning" || inferReviewState(c) === "relearning") && getDueAt(c) <= now
  );
  if (learningCards.length > 0) return [...learningCards].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];

  const reviewCards = activeCards.filter((c) => inferReviewState(c) === "review" && getDueAt(c) <= now);
  if (reviewCards.length > 0) return [...reviewCards].sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0))[0];

  if (newToday < newPerDay) {
    const newCards = activeCards.filter((c) => inferReviewState(c) === "new");
    return newCards[0] ?? null;
  }
  return null;
}
