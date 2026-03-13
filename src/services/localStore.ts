import type { FlashcardState } from '../domain/models';
import { createEmptyState, DEFAULT_SETTINGS } from '../domain/models';

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
    // 向前兼容：旧版本有 correctReviews，直接丢弃
    if (parsed.stats && 'correctReviews' in parsed.stats) {
      delete (parsed.stats as Record<string, unknown>).correctReviews;
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

