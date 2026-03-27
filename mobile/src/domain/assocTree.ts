export function preorderSubtree(startId: string, children: Record<string, string[]>): string[] {
  const out: string[] = [startId];
  for (const c of children[startId] ?? []) out.push(...preorderSubtree(c, children));
  return out;
}

export function findPathFromRoot(
  rootId: string,
  targetId: string,
  children: Record<string, string[]>
): string[] | null {
  const path: string[] = [];
  let found = false;
  function dfs(id: string): void {
    if (found) return;
    path.push(id);
    if (id === targetId) {
      found = true;
      return;
    }
    for (const c of children[id] ?? []) {
      dfs(c);
      if (found) return;
    }
    path.pop();
  }
  dfs(rootId);
  return found ? path : null;
}
