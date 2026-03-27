import { createContext, useContext, type ReactNode } from "react";
import { useFlashcardApp, type AppViewModel } from "../hooks/useFlashcardApp";

const FlashcardContext = createContext<AppViewModel | null>(null);

export function FlashcardProvider({ children }: { children: ReactNode }) {
  const value = useFlashcardApp();
  return <FlashcardContext.Provider value={value}>{children}</FlashcardContext.Provider>;
}

export function useFlashcard(): AppViewModel {
  const ctx = useContext(FlashcardContext);
  if (!ctx) throw new Error("useFlashcard must be used within FlashcardProvider");
  return ctx;
}
