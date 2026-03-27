import AsyncStorage from "@react-native-async-storage/async-storage";
import { createEmptyState, DEFAULT_SETTINGS, type FlashcardState } from "../domain/models";

const STORAGE_KEY = "flashcard_mobile_state_v1";

function createSeedState(): FlashcardState {
  const base = createEmptyState();
  const now = Date.now();
  const deckId = "demo-deck";
  return {
    ...base,
    decks: [
      {
        id: deckId,
        name: "示例卡组",
        description: "移动端示例数据",
        tags: ["示例"],
        newPerDay: 20,
        reviewPerDay: 100,
        createdAt: now,
        updatedAt: now,
      },
    ],
    cards: [
      {
        id: "demo-1",
        deckId,
        cardType: "basic",
        front: "ubiquitous",
        back: "adj. 无处不在的；普遍存在的",
        tags: ["英语"],
        createdAt: now,
        updatedAt: now,
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      },
      {
        id: "demo-2",
        deckId,
        cardType: "basic",
        front: "牛顿第二定律",
        back: "F = m * a",
        tags: ["物理"],
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

function normalizeState(parsed: FlashcardState): FlashcardState {
  const state = parsed as FlashcardState & { stats?: { correctReviews?: number } };
  if (!state.settings) {
    state.settings = { ...DEFAULT_SETTINGS };
  }
  if (state.settings.doubaoApiKey === undefined) {
    state.settings.doubaoApiKey = "";
  }
  if (state.settings.doubaoModel === undefined) {
    state.settings.doubaoModel = DEFAULT_SETTINGS.doubaoModel;
  }
  if (state.settings.cardDisplayMode === undefined) {
    state.settings.cardDisplayMode = DEFAULT_SETTINGS.cardDisplayMode;
  }
  if (state.stats && "correctReviews" in state.stats) {
    const stats = state.stats as unknown as { correctReviews?: number };
    delete stats.correctReviews;
  }
  return state as FlashcardState;
}

export async function loadState(): Promise<FlashcardState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = createSeedState();
      await saveState(seed);
      return seed;
    }
    const parsed = JSON.parse(raw) as FlashcardState;
    return normalizeState(parsed);
  } catch {
    const seed = createSeedState();
    await saveState(seed);
    return seed;
  }
}

export async function saveState(state: FlashcardState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
