import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptyState,
  DEFAULT_SETTINGS,
  type AppSettings,
  type Card,
  type Deck,
  type FlashcardState,
  type ReviewLogEntry,
  type ReviewRating,
} from "../domain/models";
import { getDailyProgress, getTodayStart, pickNextCard, RETIRED_MASTERY, scheduleReview } from "../domain/scheduler";
import { loadState, saveState } from "../services/localStore";

export interface AppViewModel {
  state: FlashcardState;
  ready: boolean;
  selectedDeckId: string | null;
  currentStudyCard: Card | null;
  practiceSession: PracticeSession | null;
  mockOffset: number;
  getNow: () => number;
  selectDeck: (deckId: string) => void;
  createDeck: (name: string) => void;
  updateDeck: (deckId: string, patch: Partial<Deck>) => void;
  deleteDeck: (deckId: string) => void;
  createCard: (deckId: string, draft: Omit<Card, "id" | "createdAt" | "updatedAt">) => void;
  updateCard: (cardId: string, patch: Partial<Card>) => void;
  deleteCard: (cardId: string) => void;
  deleteCards: (cardIds: string[]) => void;
  reviewCurrentCard: (rating: ReviewRating) => void;
  markCurrentCardMastered: () => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  exportDeckJson: (deckId: string) => string | null;
  importDeckJson: (json: string) => void;
  exportAllJson: () => string;
  importAllJson: (json: string) => boolean;
  clearAllData: () => void;
  startPracticeCards: (count: number) => void;
  cancelPracticeCards: () => void;
  dailyProgress: { newToday: number; reviewToday: number; newLimit: number } | null;
}

interface PracticeSession {
  runId: number;
  target: number;
  remaining: number;
  deckId: string;
  dayStart: number;
}

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function useFlashcardApp(): AppViewModel {
  const [state, setState] = useState<FlashcardState>(() => createEmptyState());
  const [ready, setReady] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [mockOffset, setMockOffset] = useState(0);
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const getNow = useCallback(() => Date.now() + mockOffset, [mockOffset]);
  const todayStart = useMemo(() => getTodayStart(getNow()), [getNow]);

  useEffect(() => {
    let mounted = true;
    loadState().then((loaded) => {
      if (!mounted) return;
      setState(loaded);
      setSelectedDeckId(loaded.decks[0]?.id ?? null);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveState(state);
  }, [ready, state]);

  const selectedDeck = useMemo(
    () => state.decks.find((d) => d.id === selectedDeckId) ?? null,
    [state.decks, selectedDeckId]
  );

  const selectedDeckCards = useMemo(
    () => state.cards.filter((c) => c.deckId === selectedDeckId),
    [state.cards, selectedDeckId]
  );

  const isPracticeActiveForSelectedDeck =
    !!practiceSession &&
    practiceSession.deckId === selectedDeckId &&
    practiceSession.dayStart === todayStart;

  const currentStudyCard = useMemo(() => {
    if (!selectedDeckId || !selectedDeck) return null;
    const now = getNow();
    if (isPracticeActiveForSelectedDeck && practiceSession) {
      if (practiceSession.remaining <= 0) return null;
      return pickNextCard(selectedDeckCards, now);
    }
    return pickNextCard(selectedDeckCards, now, {
      deckId: selectedDeckId,
      newPerDay: selectedDeck.newPerDay,
      reviewLogs: state.reviewLogs,
    });
  }, [
    selectedDeckId,
    selectedDeck,
    selectedDeckCards,
    state.reviewLogs,
    getNow,
    isPracticeActiveForSelectedDeck,
    practiceSession,
  ]);

  const dailyProgress = useMemo(() => {
    if (!selectedDeckId || !selectedDeck) return null;
    const { newToday, reviewToday } = getDailyProgress(state.reviewLogs, selectedDeckId, getNow());
    const extraLimit = isPracticeActiveForSelectedDeck && practiceSession ? practiceSession.target : 0;
    const configuredNewLimit = selectedDeck.newPerDay + extraLimit;
    const currentNewCards = selectedDeckCards.filter((c) => c.lastReviewAt === null).length;
    const totalNewPool = newToday + currentNewCards;
    const clampedByCardCount = Math.min(totalNewPool, configuredNewLimit);
    const newLimit = Math.max(clampedByCardCount, newToday);
    return { newToday, reviewToday, newLimit };
  }, [
    selectedDeckId,
    selectedDeck,
    state.reviewLogs,
    selectedDeckCards,
    getNow,
    isPracticeActiveForSelectedDeck,
    practiceSession,
  ]);

  const updateState = useCallback((updater: (prev: FlashcardState) => FlashcardState) => {
    setState((prev) => updater(prev));
  }, []);

  const selectDeck = (deckId: string) => setSelectedDeckId(deckId);

  const createDeck = (name: string) => {
    const now = Date.now();
    const id = makeId("deck");
    updateState((prev) => ({
      ...prev,
      decks: [
        ...prev.decks,
        {
          id,
          name: name.trim() || "新卡组",
          description: "",
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
      decks: prev.decks.map((d) => (d.id === deckId ? { ...d, ...patch, updatedAt: now } : d)),
    }));
  };

  const deleteDeck = (deckId: string) => {
    updateState((prev) => ({
      ...prev,
      decks: prev.decks.filter((d) => d.id !== deckId),
      cards: prev.cards.filter((c) => c.deckId !== deckId),
      reviewLogs: prev.reviewLogs.filter((l) => l.deckId !== deckId),
    }));
    setSelectedDeckId((current) => {
      if (current !== deckId) return current;
      const left = state.decks.filter((d) => d.id !== deckId);
      return left[0]?.id ?? null;
    });
  };

  const createCard = (deckId: string, draft: Omit<Card, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now();
    updateState((prev) => ({
      ...prev,
      cards: [
        ...prev.cards,
        {
          id: makeId("card"),
          ...draft,
          createdAt: now,
          updatedAt: now,
        },
      ],
    }));
  };

  const updateCard = (cardId: string, patch: Partial<Card>) => {
    const now = Date.now();
    updateState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === cardId ? { ...c, ...patch, updatedAt: now } : c)),
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
      id: makeId("log"),
      cardId: updatedCard.id,
      deckId: updatedCard.deckId,
      rating,
      reviewedAt: now,
      intervalBefore: currentStudyCard.interval,
      intervalAfter: updatedCard.interval,
    };
    updateState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
      reviewLogs: [...prev.reviewLogs, log],
      stats: {
        totalReviews: prev.stats.totalReviews + 1,
        lastStudyAt: now,
      },
    }));

    setPracticeSession((prev) => {
      if (!prev) return prev;
      if (prev.deckId !== selectedDeckId) return prev;
      if (prev.dayStart !== todayStart) return prev;
      if (prev.remaining <= 0) return prev;
      return { ...prev, remaining: Math.max(0, prev.remaining - 1) };
    });
  };

  const markCurrentCardMastered = () => {
    if (!currentStudyCard) return;
    const now = getNow();
    const updatedCard: Card = {
      ...currentStudyCard,
      mastery: RETIRED_MASTERY,
      reviewState: "review",
      learningStep: 0,
      nextReview: null,
      lastReviewAt: now,
      reps: (currentStudyCard.reps ?? 0) + 1,
      updatedAt: now,
    };
    updateState((prev) => ({
      ...prev,
      cards: prev.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
      reviewLogs: [
        ...prev.reviewLogs,
        {
          id: makeId("log"),
          cardId: updatedCard.id,
          deckId: updatedCard.deckId,
          rating: "easy",
          reviewedAt: now,
          intervalBefore: currentStudyCard.interval,
          intervalAfter: updatedCard.interval,
        },
      ],
      stats: {
        totalReviews: prev.stats.totalReviews + 1,
        lastStudyAt: now,
      },
    }));

    setPracticeSession((prev) => {
      if (!prev) return prev;
      if (prev.deckId !== selectedDeckId) return prev;
      if (prev.dayStart !== todayStart) return prev;
      if (prev.remaining <= 0) return prev;
      return { ...prev, remaining: Math.max(0, prev.remaining - 1) };
    });
  };

  const updateSettings = (patch: Partial<AppSettings>) => {
    updateState((prev) => ({
      ...prev,
      settings: { ...(prev.settings ?? DEFAULT_SETTINGS), ...patch },
    }));
  };

  const startPracticeCards = (count: number) => {
    if (!selectedDeckId) return;
    const n = Math.max(1, Math.floor(Number.isFinite(count) ? count : 1));
    const capped = Math.min(500, n);
    setPracticeSession({
      runId: Date.now(),
      target: capped,
      remaining: capped,
      deckId: selectedDeckId,
      dayStart: todayStart,
    });
  };

  const cancelPracticeCards = () => setPracticeSession(null);

  const exportDeckJson = (deckId: string): string | null => {
    const deck = state.decks.find((d) => d.id === deckId);
    if (!deck) return null;
    const cards = state.cards.filter((c) => c.deckId === deckId);
    return JSON.stringify({ version: 1, deck, cards }, null, 2);
  };

  const importDeckJson = (json: string) => {
    try {
      const parsed = JSON.parse(json) as { deck: Deck; cards: Card[] };
      if (!parsed.deck || !Array.isArray(parsed.cards)) return;
      const now = Date.now();
      const newDeckId = makeId("deck_import");
      const clonedDeck: Deck = {
        ...parsed.deck,
        id: newDeckId,
        createdAt: now,
        updatedAt: now,
        newPerDay: state.settings?.defaultNewPerDay ?? DEFAULT_SETTINGS.defaultNewPerDay,
        reviewPerDay: state.settings?.defaultReviewPerDay ?? DEFAULT_SETTINGS.defaultReviewPerDay,
      };
      const clonedCards: Card[] = parsed.cards.map((c) => ({
        ...c,
        id: makeId("card_import"),
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

  const exportAllJson = (): string => JSON.stringify({ version: 1, exportedAt: Date.now(), ...state }, null, 2);

  const importAllJson = (json: string): boolean => {
    try {
      const parsed = JSON.parse(json) as Partial<FlashcardState>;
      if (!Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) return false;
      const nextState: FlashcardState = {
        decks: parsed.decks,
        cards: parsed.cards,
        reviewLogs: parsed.reviewLogs ?? [],
        stats: parsed.stats ?? createEmptyState().stats,
        settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      };
      setState(nextState);
      setSelectedDeckId(nextState.decks[0]?.id ?? null);
      return true;
    } catch {
      return false;
    }
  };

  const clearAllData = () => {
    const empty = createEmptyState();
    setState(empty);
    setSelectedDeckId(null);
  };

  useEffect(() => {
    if (!selectedDeckId && state.decks.length > 0) {
      setSelectedDeckId(state.decks[0].id);
    }
  }, [selectedDeckId, state.decks]);

  return {
    state,
    ready,
    selectedDeckId,
    currentStudyCard,
    practiceSession,
    mockOffset,
    getNow,
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
    updateSettings,
    exportDeckJson,
    importDeckJson,
    exportAllJson,
    importAllJson,
    clearAllData,
    startPracticeCards,
    cancelPracticeCards,
    dailyProgress,
  };
}
