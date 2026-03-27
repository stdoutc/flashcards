export type CardType = "basic" | "cloze" | "choice";

export type ReviewRating = "again" | "hard" | "good" | "easy";
export type ReviewState = "new" | "learning" | "review" | "relearning";

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
  reviewState?: ReviewState;
  learningStep?: number;
  reps?: number;
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

export type CardDisplayMode = "both" | "frontOnly";

export interface AppSettings {
  defaultNewPerDay: number;
  defaultReviewPerDay: number;
  doubaoApiKey: string;
  doubaoModel: string;
  cardDisplayMode: CardDisplayMode;
}

export interface FlashcardState {
  decks: Deck[];
  cards: Card[];
  reviewLogs: ReviewLogEntry[];
  stats: StudyStats;
  settings: AppSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  defaultNewPerDay: 20,
  defaultReviewPerDay: 100,
  doubaoApiKey: "",
  doubaoModel: "doubao-1-5-vision-pro-32k-250115",
  cardDisplayMode: "both",
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
  };
}
