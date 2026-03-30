import type { FlashcardState, PracticeSession } from '../domain/models';
import { createEmptyState, DEFAULT_SETTINGS } from '../domain/models';

function todayStartMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 校验并恢复「再学」会话（仅当日、卡组仍存在） */
export function normalizePracticeSession(
  raw: unknown,
  decks: { id: string }[],
  now: number,
): PracticeSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<PracticeSession>;
  const today = todayStartMs(now);
  if (typeof p.deckId !== 'string' || !decks.some((d) => d.id === p.deckId)) return null;
  if (typeof p.dayStart !== 'number' || p.dayStart !== today) return null;
  const target = Math.max(1, Math.min(500, Math.floor(Number(p.target) || 0)));
  if (target < 1) return null;
  const remaining = Math.max(0, Math.min(target, Math.floor(Number(p.remaining) || 0)));
  return {
    runId: typeof p.runId === 'number' ? p.runId : Date.now(),
    target,
    remaining,
    deckId: p.deckId,
    dayStart: today,
  };
}

const STORAGE_KEY = 'flashcard_app_state_v1';

export function loadState(): FlashcardState {
  if (typeof window === 'undefined') {
    return createSeedState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedState();
      saveState(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as FlashcardState & { stats?: { correctReviews?: number } };
    // 向前兼容：旧版本没有 settings 字段
    if (!parsed.settings) {
      parsed.settings = { ...DEFAULT_SETTINGS };
    }
    // 向前兼容：旧版本没有豆包配置字段
    if (parsed.settings.doubaoApiKey === undefined) {
      parsed.settings.doubaoApiKey = '';
    }
    if (parsed.settings.doubaoModel === undefined) {
      parsed.settings.doubaoModel = DEFAULT_SETTINGS.doubaoModel;
    }
    // 向前兼容：旧版本没有卡片显示方式字段
    if (parsed.settings.cardDisplayMode === undefined) {
      parsed.settings.cardDisplayMode = DEFAULT_SETTINGS.cardDisplayMode;
    }
    if (parsed.settings.dailyReminderEnabled === undefined) {
      parsed.settings.dailyReminderEnabled = DEFAULT_SETTINGS.dailyReminderEnabled;
    }
    if (parsed.settings.dailyReminderHour === undefined) {
      parsed.settings.dailyReminderHour = DEFAULT_SETTINGS.dailyReminderHour;
    }
    if (parsed.settings.dailyReminderMinute === undefined) {
      parsed.settings.dailyReminderMinute = DEFAULT_SETTINGS.dailyReminderMinute;
    }
    if (parsed.settings.reviewReminderEnabled === undefined) {
      parsed.settings.reviewReminderEnabled = DEFAULT_SETTINGS.reviewReminderEnabled;
    }
    // 向前兼容：旧版本有 correctReviews，直接丢弃
    if (parsed.stats && 'correctReviews' in parsed.stats) {
      delete (parsed.stats as Record<string, unknown>).correctReviews;
    }
    if (parsed.practiceSession === undefined) {
      parsed.practiceSession = null;
    } else {
      parsed.practiceSession = normalizePracticeSession(
        parsed.practiceSession,
        parsed.decks,
        Date.now(),
      );
    }
    return parsed as FlashcardState;
  } catch {
    const seed = createSeedState();
    saveState(seed);
    return seed;
  }
}

export function saveState(state: FlashcardState): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(state);
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // ignore
  }
}

function createSeedState(): FlashcardState {
  const base = createEmptyState();
  const now = Date.now();
  const deckId = 'demo-deck';

  return {
    ...base,
    decks: [
      {
        id: deckId,
        name: '示例：英语 + 公式 + 编程',
        description: '示例卡组，展示多场景（语言词汇、理科公式、编程知识点）。',
        tags: ['示例', '多场景'],
        newPerDay: 20,
        reviewPerDay: 100,
        createdAt: now,
        updatedAt: now,
      },
    ],
    cards: [
      {
        id: 'demo-1',
        deckId,
        cardType: 'basic',
        front: 'ubiquitous',
        back: 'adj. 无处不在的；普遍存在的',
        tags: ['英语', '词汇'],
        createdAt: now,
        updatedAt: now,
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      },
      {
        id: 'demo-2',
        deckId,
        cardType: 'basic',
        front: '牛顿第二定律',
        back: 'F = m a',
        tags: ['物理', '公式'],
        createdAt: now,
        updatedAt: now,
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      },
      {
        id: 'demo-3',
        deckId,
        cardType: 'basic',
        front: 'JavaScript：数组去重的一种写法',
        back: 'const unique = (arr) => [...new Set(arr)];',
        tags: ['编程', 'JavaScript'],
        createdAt: now,
        updatedAt: now,
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      },
    ],
    stats: {
      totalReviews: 0,
      lastStudyAt: null,
    },
  };
}

