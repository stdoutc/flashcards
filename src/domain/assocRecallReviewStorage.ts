/**
 * 联想模式「已复习」进度：按 deck 持久化，树结构变化（指纹）后自动失效。
 */

const STORAGE_PREFIX = 'flashcard-assoc-recall-review-';

export function fingerprintAssocTree(rootId: string, children: Record<string, string[]>): string {
  return JSON.stringify({ rootId, children });
}

export function loadAssocRecallReviewed(
  deckId: string,
  rootId: string,
  children: Record<string, string[]>,
  validIds: Set<string>,
): Set<string> {
  const key = `${STORAGE_PREFIX}${deckId}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const data = JSON.parse(raw) as { rootId?: string; fp?: string; ids?: string[] };
    if (data.rootId !== rootId || data.fp !== fingerprintAssocTree(rootId, children)) {
      return new Set();
    }
    return new Set((data.ids ?? []).filter((id) => validIds.has(id)));
  } catch {
    return new Set();
  }
}

export function saveAssocRecallReviewed(
  deckId: string,
  rootId: string,
  children: Record<string, string[]>,
  ids: Set<string>,
): void {
  try {
    const key = `${STORAGE_PREFIX}${deckId}`;
    const payload = {
      rootId,
      fp: fingerprintAssocTree(rootId, children),
      ids: [...ids],
    };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearAssocRecallReviewed(deckId: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${deckId}`);
  } catch {
    /* ignore */
  }
}
