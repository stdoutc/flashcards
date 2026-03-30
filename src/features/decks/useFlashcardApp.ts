import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  Card,
  Deck,
  FlashcardState,
  PracticeSession,
  ReviewLogEntry,
  ReviewRating,
} from '../../domain/models';
export type { PracticeSession } from '../../domain/models';
import { DEFAULT_SETTINGS, createEmptyState } from '../../domain/models';
import { loadState, normalizePracticeSession, saveState } from '../../services/localStore';
import {
  postNotificationSettingsToNative,
  postReviewDueOnceToNative,
} from '../../utils/nativeReminderBridge';
import {
  DAY,
  getDailyProgress,
  getTodayStart,
  hasAnyDueCards,
  isRetiredCard,
  pickNextCard,
  RETIRED_MASTERY,
  scheduleReview,
} from '../../domain/scheduler';

export const IS_DEBUG = import.meta.env.VITE_DEBUG === 'true';

export interface DailyProgress {
  newToday: number;
  reviewToday: number;
  newLimit: number;
}

export interface AppViewModel {
  state: FlashcardState;
  selectedDeckId: string | null;
  currentStudyCard: Card | null;
  dailyProgress: DailyProgress | null;
  practiceSession: PracticeSession | null;
  selectDeck: (deckId: string) => void;
  createDeck: (name: string) => void;
  updateDeck: (deckId: string, patch: Partial<Deck>) => void;
  deleteDeck: (deckId: string) => void;
  createCard: (deckId: string, draft: Omit<Card, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateCard: (cardId: string, patch: Partial<Card>) => void;
  deleteCard: (cardId: string) => void;
  deleteCards: (cardIds: string[]) => void;
  reviewCurrentCard: (rating: ReviewRating) => void;
  markCurrentCardMastered: () => void;
  exportDeckJson: (deckId: string) => string | null;
  importDeckJson: (json: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  exportAllJson: () => string;
  importAllJson: (json: string) => boolean;
  clearAllData: () => void;
  startPracticeCards: (count: number) => void;
  cancelPracticeCards: () => void;
  // ── 调试专用（仅 IS_DEBUG 模式下有意义）──
  mockOffset: number;
  setMockOffset: (ms: number) => void;
  getNow: () => number;
  debugClearTodayLogs: () => void;
  debugResetDeckCards: (deckId: string) => void;
  debugAddSampleDeck: () => void;
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useFlashcardApp(): AppViewModel {
  const [state, setState] = useState<FlashcardState>(() => loadState());
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(() => {
    return state.decks[0]?.id ?? null;
  });
  // mock 时间偏移（毫秒），仅调试模式有效，默认 0
  const [mockOffset, setMockOffset] = useState(0);
  /** 到点递增，驱动 getNow 依赖链重算（学习步短间隔到期后无需手动刷新） */
  const [clockTick, setClockTick] = useState(0);
  const getNow = useCallback(() => Date.now() + mockOffset, [mockOffset, clockTick]);

  const todayStart = useMemo(() => getTodayStart(getNow()), [getNow]);
  const practiceSession = state.practiceSession;
  const isPracticeActiveForSelectedDeck =
    !!practiceSession &&
    practiceSession.deckId === selectedDeckId &&
    practiceSession.dayStart === todayStart;

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    postNotificationSettingsToNative(state.settings);
  }, [
    state.settings.dailyReminderEnabled,
    state.settings.dailyReminderHour,
    state.settings.dailyReminderMinute,
  ]);

  /** 复习提醒：仅在「从无可复习变为有待复习」时通知一次（需开启开关） */
  const prevHadDueRef = useRef<boolean | null>(null);
  useEffect(() => {
    const enabled = state.settings.reviewReminderEnabled;
    const due = hasAnyDueCards(state, getNow());
    if (!enabled) {
      prevHadDueRef.current = due;
      return;
    }
    const prev = prevHadDueRef.current;
    if (prev === null) {
      prevHadDueRef.current = due;
      return;
    }
    if (!prev && due) {
      postReviewDueOnceToNative();
    }
    prevHadDueRef.current = due;
  }, [
    state.settings.reviewReminderEnabled,
    state.cards,
    state.reviewLogs,
    state.decks,
    mockOffset,
    clockTick,
  ]);

  /** 下一次「应刷新调度」的时刻：最早一张未来到期的 nextReview，以及次日 0 点（跨日重置日限/会话） */
  const nextSchedulerWakeMs = useMemo(() => {
    const now = getNow();
    const candidates: number[] = [];
    for (const c of state.cards) {
      if (isRetiredCard(c)) continue;
      const t = c.nextReview;
      if (t != null && t > now) candidates.push(t);
    }
    const nextDayStart = todayStart + DAY;
    if (nextDayStart > now) candidates.push(nextDayStart);
    if (candidates.length === 0) return null;
    return Math.min(...candidates);
  }, [state.cards, getNow, clockTick, todayStart]);

  useEffect(() => {
    if (nextSchedulerWakeMs == null) return;
    const nowWall = Date.now() + mockOffset;
    const delay = Math.max(0, nextSchedulerWakeMs - nowWall);
    const capped = Math.min(delay + 50, 2147483647);
    const id = window.setTimeout(() => {
      setClockTick((x) => x + 1);
    }, capped);
    return () => window.clearTimeout(id);
  }, [nextSchedulerWakeMs, mockOffset]);

  const selectedDeckCards = useMemo(
    () => state.cards.filter((c) => c.deckId === selectedDeckId),
    [state.cards, selectedDeckId],
  );

  const selectedDeck = useMemo(
    () => state.decks.find((d) => d.id === selectedDeckId) ?? null,
    [state.decks, selectedDeckId],
  );

  const currentStudyCard = useMemo(
    () => {
      if (!selectedDeckId || !selectedDeck) return null;
      const now = getNow();
      // 仅当「再学」仍有剩余额度时用无日限选卡；额度用尽后回退到正常调度，避免卡住无法学到期卡片
      const practicePicksWithoutDailyCap =
        isPracticeActiveForSelectedDeck &&
        practiceSession &&
        practiceSession.remaining > 0;
      if (practicePicksWithoutDailyCap) {
        return pickNextCard(selectedDeckCards, now);
      }
      return pickNextCard(selectedDeckCards, now, {
        newPerDay: selectedDeck.newPerDay,
        reviewLogs: state.reviewLogs,
        deckId: selectedDeckId,
      });
    },
    [
      selectedDeckCards,
      selectedDeckId,
      selectedDeck,
      state.reviewLogs,
      practiceSession,
      isPracticeActiveForSelectedDeck,
      mockOffset,
      getNow,
    ],
  );

  const dailyProgress = useMemo((): DailyProgress | null => {
    if (!selectedDeckId || !selectedDeck) return null;
    const { newToday, reviewToday } = getDailyProgress(
      state.reviewLogs,
      selectedDeckId,
      getNow(),
    );
    // 额外学习（“再学 n 张”）期间，把上限也临时扩展同样的额度，
    // 但只对“当天的当前卡组”生效。
    const extraLimit =
      isPracticeActiveForSelectedDeck && practiceSession && practiceSession.remaining > 0
        ? practiceSession.target
        : 0;
    const configuredNewLimit = selectedDeck.newPerDay + extraLimit;
    const currentNewCards = selectedDeckCards.filter((c) => c.lastReviewAt === null).length;
    // 新卡分母应以“当前新卡池总量（已学新卡 + 未学新卡）”计算，避免学习过程中分母波动
    const totalNewPool = newToday + currentNewCards;
    const clampedByCardCount = Math.min(totalNewPool, configuredNewLimit);
    return {
      newToday,
      reviewToday,
      // 每日新卡分母：当前卡片数量与新卡上限取最小值；并兜底不小于分子
      newLimit: Math.max(clampedByCardCount, newToday),
    };
  }, [
    selectedDeckId,
    selectedDeck,
    selectedDeckCards,
    state.reviewLogs,
    practiceSession,
    isPracticeActiveForSelectedDeck,
    mockOffset,
    getNow,
  ]);

  const updateState = (updater: (prev: FlashcardState) => FlashcardState) => {
    setState((prev) => updater(prev));
  };

  useEffect(() => {
    updateState((s) => {
      if (!s.practiceSession) return s;
      if (s.practiceSession.dayStart === todayStart) return s;
      return { ...s, practiceSession: null };
    });
  }, [todayStart]);

  const selectDeck = (deckId: string) => setSelectedDeckId(deckId);

  const createDeck = (name: string) => {
    const now = Date.now();
    const id = makeId('deck');
    updateState((prev) => ({
      ...prev,
      decks: [
        ...prev.decks,
        {
          id,
          name,
          description: '',
          tags: [],
          newPerDay: prev.settings?.defaultNewPerDay ?? DEFAULT_SETTINGS.defaultNewPerDay,
          reviewPerDay: prev.settings?.defaultReviewPerDay ?? DEFAULT_SETTINGS.defaultReviewPerDay,
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
    setSelectedDeckId(id);
  };

  const updateDeck = (deckId: string, patch: Partial<Deck>) => {
    const now = Date.now();
    updateState((prev) => ({
      ...prev,
      decks: prev.decks.map((d) =>
        d.id === deckId ? { ...d, ...patch, updatedAt: now } : d,
      ),
    }));
  };

  const deleteDeck = (deckId: string) => {
    updateState((prev) => ({
      ...prev,
      decks: prev.decks.filter((d) => d.id !== deckId),
      cards: prev.cards.filter((c) => c.deckId !== deckId),
      reviewLogs: prev.reviewLogs.filter((l) => l.deckId !== deckId),
      practiceSession:
        prev.practiceSession?.deckId === deckId ? null : prev.practiceSession,
    }));
    setSelectedDeckId((current) => {
      if (current !== deckId) return current;
      const left = state.decks.filter((d) => d.id !== deckId);
      return left[0]?.id ?? null;
    });
  };

  const createCard = (deckId: string, draft: Omit<Card, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now();
    const id = makeId('card');
    updateState((prev) => ({
      ...prev,
      cards: [...prev.cards, { ...draft, id, deckId, createdAt: now, updatedAt: now }],
    }));
  };

  const updateCard = (cardId: string, patch: Partial<Card>) => {
    const now = Date.now();
    updateState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.id === cardId ? { ...c, ...patch, updatedAt: now } : c,
      ),
    }));
  };

  const deleteCard = (cardId: string) => {
    updateState((prev) => ({
      ...prev,
      cards: prev.cards.filter((c) => c.id !== cardId),
      reviewLogs: prev.reviewLogs.filter((l) => l.cardId !== cardId),
    }));
  };

  const deleteCards = (cardIds: string[]) => {
    const idSet = new Set(cardIds);
    updateState((prev) => ({
      ...prev,
      cards: prev.cards.filter((c) => !idSet.has(c.id)),
      reviewLogs: prev.reviewLogs.filter((l) => !idSet.has(l.cardId)),
    }));
  };

  const reviewCurrentCard = (rating: ReviewRating) => {
    if (!currentStudyCard) return;
    const now = getNow();
    const { updatedCard } = scheduleReview(currentStudyCard, rating, now);
    const log: ReviewLogEntry = {
      id: makeId('log'),
      cardId: updatedCard.id,
      deckId: updatedCard.deckId,
      rating,
      reviewedAt: now,
      intervalBefore: currentStudyCard.interval,
      intervalAfter: updatedCard.interval,
    };
    updateState((prev) => {
      const dayStart = getTodayStart(now);
      let nextPractice = prev.practiceSession;
      const ps = nextPractice;
      if (
        ps &&
        ps.deckId === updatedCard.deckId &&
        ps.dayStart === dayStart &&
        ps.remaining > 0
      ) {
        nextPractice = { ...ps, remaining: Math.max(0, ps.remaining - 1) };
      }
      return {
        ...prev,
        cards: prev.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
        reviewLogs: [...prev.reviewLogs, log],
        stats: {
          totalReviews: prev.stats.totalReviews + 1,
          lastStudyAt: now,
        },
        practiceSession: nextPractice,
      };
    });
  };

  const markCurrentCardMastered = () => {
    if (!currentStudyCard) return;
    const now = getNow();
    const updatedCard: Card = {
      ...currentStudyCard,
      mastery: RETIRED_MASTERY,
      reviewState: 'review',
      learningStep: 0,
      nextReview: null,
      lastReviewAt: now,
      reps: (currentStudyCard.reps ?? 0) + 1,
      updatedAt: now,
    };
    const log: ReviewLogEntry = {
      id: makeId('log'),
      cardId: updatedCard.id,
      deckId: updatedCard.deckId,
      rating: 'easy',
      reviewedAt: now,
      intervalBefore: currentStudyCard.interval,
      intervalAfter: updatedCard.interval,
    };
    updateState((prev) => {
      const dayStart = getTodayStart(now);
      let nextPractice = prev.practiceSession;
      const ps = nextPractice;
      if (
        ps &&
        ps.deckId === updatedCard.deckId &&
        ps.dayStart === dayStart &&
        ps.remaining > 0
      ) {
        nextPractice = { ...ps, remaining: Math.max(0, ps.remaining - 1) };
      }
      return {
        ...prev,
        cards: prev.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
        reviewLogs: [...prev.reviewLogs, log],
        stats: {
          totalReviews: prev.stats.totalReviews + 1,
          lastStudyAt: now,
        },
        practiceSession: nextPractice,
      };
    });
  };

  const startPracticeCards = (count: number) => {
    if (!selectedDeckId) return;
    const n = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
    const capped = Math.min(500, n);
    updateState((prev) => ({
      ...prev,
      practiceSession: {
        runId: Date.now(),
        target: capped,
        remaining: capped,
        deckId: selectedDeckId,
        dayStart: todayStart,
      },
    }));
  };

  const cancelPracticeCards = () =>
    updateState((prev) => ({ ...prev, practiceSession: null }));

  // ── 单卡组导出 ──
  const exportDeckJson = (deckId: string): string | null => {
    const deck = state.decks.find((d) => d.id === deckId);
    if (!deck) return null;
    const cards = state.cards.filter((c) => c.deckId === deckId);
    return JSON.stringify({ version: 1, deck, cards }, null, 2);
  };

  // ── 单卡组导入 ──
  const importDeckJson = (json: string) => {
    try {
      const parsed = JSON.parse(json) as { version?: number; deck: Deck; cards: Card[] };
      if (!parsed.deck || !Array.isArray(parsed.cards)) return;
      const now = Date.now();
      const newDeckId = makeId('deck_import');
      const clonedDeck: Deck = {
        ...parsed.deck,
        id: newDeckId,
        createdAt: now,
        updatedAt: now,
        // 导入时使用当前设置的默认值，而非来源文件中的值
        newPerDay: state.settings?.defaultNewPerDay ?? DEFAULT_SETTINGS.defaultNewPerDay,
        reviewPerDay: state.settings?.defaultReviewPerDay ?? DEFAULT_SETTINGS.defaultReviewPerDay,
      };
      const clonedCards: Card[] = parsed.cards.map((c) => ({
        ...c,
        id: makeId('card_import'),
        deckId: newDeckId,
        createdAt: now,
        updatedAt: now,
      }));
      updateState((prev) => ({
        ...prev,
        decks: [...prev.decks, clonedDeck],
        cards: [...prev.cards, ...clonedCards],
      }));
      setSelectedDeckId(newDeckId);
    } catch {
      // ignore
    }
  };

  // ── 全量导出（包含所有卡组、卡片、统计和设置） ──
  const exportAllJson = (): string => {
    return JSON.stringify({ version: 1, exportedAt: Date.now(), ...state }, null, 2);
  };

  // ── 全量导入（覆盖当前数据）；返回是否成功 ──
  const importAllJson = (json: string): boolean => {
    try {
      const parsed = JSON.parse(json) as Partial<FlashcardState> & {
        version?: number;
        exportedAt?: number;
      };
      if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) return false;
      const newState: FlashcardState = {
        decks: parsed.decks,
        cards: parsed.cards,
        reviewLogs: parsed.reviewLogs ?? [],
        stats: parsed.stats ?? createEmptyState().stats,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
        practiceSession: normalizePracticeSession(
          parsed.practiceSession,
          parsed.decks,
          Date.now(),
        ),
      };
      setState(newState);
      setSelectedDeckId(newState.decks[0]?.id ?? null);
      return true;
    } catch {
      return false;
    }
  };

  // ── 清除全部数据 ──
  const clearAllData = () => {
    const empty = createEmptyState();
    setState(empty);
    setSelectedDeckId(null);
  };

  // ── 更新全局设置（仅影响之后新建的卡组，已有卡组不受影响） ──
  const updateSettings = (patch: Partial<AppSettings>) => {
    updateState((prev) => ({
      ...prev,
      settings: { ...(prev.settings ?? DEFAULT_SETTINGS), ...patch },
    }));
  };

  // ════ 调试专用操作 ════

  /** 删除模拟"今天"的所有复习记录（用于重测每日上限逻辑） */
  const debugClearTodayLogs = () => {
    const todayStart = getTodayStart(getNow());
    updateState((prev) => ({
      ...prev,
      reviewLogs: prev.reviewLogs.filter((l) => l.reviewedAt < todayStart),
      stats: {
        ...prev.stats,
        totalReviews: Math.max(
          0,
          prev.stats.totalReviews -
            prev.reviewLogs.filter((l) => l.reviewedAt >= todayStart).length,
        ),
      },
    }));
  };

  /** 重置指定卡组内所有卡片的调度数据（回到全新未学状态） */
  const debugResetDeckCards = (deckId: string) => {
    updateState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) =>
        c.deckId === deckId
          ? {
              ...c,
              mastery: 0,
              easeFactor: 2.5,
              interval: 0,
              nextReview: null,
              lastReviewAt: null,
            }
          : c,
      ),
      reviewLogs: prev.reviewLogs.filter((l) => l.deckId !== deckId),
    }));
  };

  /** 生成一个示例卡组（含多种题型），用于功能演示 */
  const debugAddSampleDeck = () => {
    const now = Date.now();
    const deckId = makeId('deck_sample');
    const sampleCards: Omit<Card, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        deckId,
        cardType: 'basic',
        front: '间隔重复（Spaced Repetition）是什么？',
        back: '一种根据**遗忘曲线**安排复习时间的学习方法。越容易遗忘的内容，复习间隔越短；记得越牢，间隔越长。',
        tags: ['记忆方法'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
      {
        deckId,
        cardType: 'basic',
        front: '勾股定理',
        back: '在直角三角形中，两直角边的平方和等于斜边的平方：\n\n$$a^2 + b^2 = c^2$$',
        tags: ['数学'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
      {
        deckId,
        cardType: 'basic',
        front: '欧拉公式（Euler\'s Formula）',
        back: '$$e^{i\\pi} + 1 = 0$$\n\n被誉为数学中最美丽的等式，联系了 $e$、$i$、$\\pi$、$1$、$0$ 五个基本常数。',
        tags: ['数学'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
      {
        deckId,
        cardType: 'basic',
        front: 'React 中 `useMemo` 的作用是什么？',
        back: '缓存**计算结果**，仅在依赖项变化时重新计算，避免每次渲染都执行昂贵运算。\n\n```js\nconst value = useMemo(() => compute(a, b), [a, b]);\n```',
        tags: ['编程', 'React'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
      {
        deckId,
        cardType: 'basic',
        front: 'Big-O 表示法：常见复杂度从快到慢',
        back: '$$O(1) < O(\\log n) < O(n) < O(n \\log n) < O(n^2) < O(2^n) < O(n!)$$',
        tags: ['算法'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
      {
        deckId,
        cardType: 'basic',
        front: 'TCP 三次握手的步骤',
        back: '1. **SYN**：客户端发送连接请求\n2. **SYN-ACK**：服务端确认并回应\n3. **ACK**：客户端确认，连接建立',
        tags: ['网络'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
      {
        deckId,
        cardType: 'basic',
        front: '光速（真空中）',
        back: '$$c \\approx 3 \\times 10^8 \\text{ m/s}$$\n\n精确值为 **299,792,458 m/s**',
        tags: ['物理'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
      {
        deckId,
        cardType: 'basic',
        front: '什么是 Git rebase？与 merge 的区别？',
        back: '`rebase` 将当前分支的提交**移植**到目标分支末端，历史更线性；\n`merge` 产生一个**合并提交**，保留完整历史。\n\n> 公共分支避免 rebase，会改写历史。',
        tags: ['编程', 'Git'],
        mastery: 0, easeFactor: 2.5, interval: 0, nextReview: null, lastReviewAt: null,
      },
    ];
    const newCards: Card[] = sampleCards.map((c) => ({
      ...c,
      id: makeId('card_sample'),
      createdAt: now,
      updatedAt: now,
    }));
    updateState((prev) => ({
      ...prev,
      decks: [
        ...prev.decks,
        {
          id: deckId,
          name: '🧪 示例卡组',
          description: '由调试工具自动生成，包含多种题型演示',
          tags: ['示例'],
          newPerDay: prev.settings?.defaultNewPerDay ?? DEFAULT_SETTINGS.defaultNewPerDay,
          reviewPerDay: prev.settings?.defaultReviewPerDay ?? DEFAULT_SETTINGS.defaultReviewPerDay,
          createdAt: now,
          updatedAt: now,
        },
      ],
      cards: [...prev.cards, ...newCards],
    }));
    setSelectedDeckId(deckId);
  };

  return {
    state,
    selectedDeckId,
    currentStudyCard,
    dailyProgress,
    practiceSession,
    selectDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    createCard,
    updateCard,
    deleteCard,
    deleteCards,
    reviewCurrentCard,
    markCurrentCardMastered,
    exportDeckJson,
    importDeckJson,
    updateSettings,
    exportAllJson,
    importAllJson,
    clearAllData,
    startPracticeCards,
    cancelPracticeCards,
    mockOffset,
    setMockOffset,
    getNow,
    debugClearTodayLogs,
    debugResetDeckCards,
    debugAddSampleDeck,
  };
}
