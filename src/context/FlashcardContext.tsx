import React, { createContext, useContext } from 'react';
import type { AppViewModel } from '../features/decks/useFlashcardApp';
import { useFlashcardApp } from '../features/decks/useFlashcardApp';

const FlashcardContext = createContext<AppViewModel | null>(null);

export const FlashcardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const value = useFlashcardApp();
  return (
    <FlashcardContext.Provider value={value}>
      {children}
    </FlashcardContext.Provider>
  );
};

export function useFlashcard(): AppViewModel {
  const ctx = useContext(FlashcardContext);
  if (!ctx) throw new Error('useFlashcard must be used within FlashcardProvider');
  return ctx;
}
