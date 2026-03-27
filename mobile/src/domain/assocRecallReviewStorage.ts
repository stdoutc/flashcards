import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_PREFIX = "flashcard-assoc-recall-review-";

export function fingerprintAssocTree(rootId: string, children: Record<string, string[]>): string {
  return JSON.stringify({ rootId, children });
}

export async function loadAssocRecallReviewed(
  deckId: string,
  rootId: string,
  children: Record<string, string[]>,
  validIds: Set<string>
): Promise<Set<string>> {
  const key = `${STORAGE_PREFIX}${deckId}`;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return new Set();
    const data = JSON.parse(raw) as { rootId?: string; fp?: string; ids?: string[] };
    if (data.rootId !== rootId || data.fp !== fingerprintAssocTree(rootId, children)) return new Set();
    return new Set((data.ids ?? []).filter((id) => validIds.has(id)));
  } catch {
    return new Set();
  }
}

export async function saveAssocRecallReviewed(
  deckId: string,
  rootId: string,
  children: Record<string, string[]>,
  ids: Set<string>
): Promise<void> {
  try {
    const key = `${STORAGE_PREFIX}${deckId}`;
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ rootId, fp: fingerprintAssocTree(rootId, children), ids: [...ids] })
    );
  } catch {
    // ignore
  }
}

export async function clearAssocRecallReviewed(deckId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${STORAGE_PREFIX}${deckId}`);
  } catch {
    // ignore
  }
}
