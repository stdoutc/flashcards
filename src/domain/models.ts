export type CardType = 'basic' | 'cloze' | 'choice';

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type ReviewState = 'new' | 'learning' | 'review' | 'relearning';

export interface Deck {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  newPerDay: number;
  reviewPerDay: number;
  createdAt: number;
  updatedAt: number;
}

export interface Card {
  id: string;
  deckId: string;
  cardType: CardType;
  front: string;
  back: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;

  mastery: number;
  easeFactor: number;
  interval: number;
  nextReview: number | null;
  lastReviewAt: number | null;
  /** Anki-like 调度状态（兼容旧数据，缺失时按旧字段推断） */
  reviewState?: ReviewState;
  /** learning/relearning 当前步索引 */
  learningStep?: number;
  /** 总复习次数 */
  reps?: number;
  /** 失败次数 */
  lapses?: number;
}

export interface ReviewLogEntry {
  id: string;
  cardId: string;
  deckId: string;
  rating: ReviewRating;
  reviewedAt: number;
  intervalBefore: number;
  intervalAfter: number;
}

export interface StudyStats {
  totalReviews: number;
  lastStudyAt: number | null;
}

export type CardDisplayMode = 'both' | 'frontOnly';

export interface AppSettings {
  defaultNewPerDay: number;
  defaultReviewPerDay: number;
  doubaoApiKey: string;
  doubaoModel: string;
  cardDisplayMode: CardDisplayMode;
  /** 每日学习提醒（由移动应用 WebView 壳调度系统本地通知；网页端仅保存选项） */
  dailyReminderEnabled: boolean;
  /** 0–23 */
  dailyReminderHour: number;
  /** 0–59 */
  dailyReminderMinute: number;
  /** 有待复习卡片时由壳层周期性本地提醒（依赖当前数据，仅应用打开期间会刷新调度） */
  reviewReminderEnabled: boolean;
}

/** 「再学 n 张」会话：当日有效，持久化后跨重启保留剩余额度 */
export interface PracticeSession {
  runId: number;
  target: number;
  remaining: number;
  deckId: string;
  /** 当日 0:00 时间戳，与 scheduler.getTodayStart 一致 */
  dayStart: number;
}

export interface FlashcardState {
  decks: Deck[];
  cards: Card[];
  reviewLogs: ReviewLogEntry[];
  stats: StudyStats;
  settings: AppSettings;
  practiceSession: PracticeSession | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultNewPerDay: 20,
  defaultReviewPerDay: 100,
  doubaoApiKey: '',
  doubaoModel: 'doubao-1-5-vision-pro-32k-250115',
  cardDisplayMode: 'both',
  dailyReminderEnabled: false,
  dailyReminderHour: 9,
  dailyReminderMinute: 0,
  reviewReminderEnabled: false,
};

export function createEmptyState(): FlashcardState {
  return {
    decks: [],
    cards: [],
    reviewLogs: [],
    stats: {
      totalReviews: 0,
      lastStudyAt: null,
    },
    settings: { ...DEFAULT_SETTINGS },
    practiceSession: null,
  };
}
