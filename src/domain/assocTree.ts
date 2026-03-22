/** 以 start 为根的子树，先序遍历节点 id 列表（含 start） */
export function preorderSubtree(
  startId: string,
  children: Record<string, string[]>,
): string[] {
  const out: string[] = [startId];
  for (const c of children[startId] ?? []) {
    out.push(...preorderSubtree(c, children));
  }
  return out;
}

/** 树根到目标节点的唯一路径（不含则返回 null） */
export function findPathFromRoot(
  rootId: string,
  targetId: string,
  children: Record<string, string[]>,
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

/** 树缩略图布局：叶子横坐标递增，父节点取子节点 x 均值（经典 tidy tree） */
export function layoutAssocTreeMiniMap(
  rootId: string,
  children: Record<string, string[]>,
): {
  positions: Map<string, { x: number; y: number; depth: number }>;
  maxDepth: number;
  nodeIds: string[];
} {
  let leafCounter = 0;
  const positions = new Map<string, { x: number; y: number; depth: number }>();

  const layout = (id: string, depth: number): number => {
    const kids = children[id] ?? [];
    if (kids.length === 0) {
      const x = leafCounter++;
      positions.set(id, { x, y: depth, depth });
      return x;
    }
    const childXs = kids.map((k) => layout(k, depth + 1));
    const x = childXs.reduce((a, b) => a + b, 0) / childXs.length;
    positions.set(id, { x, y: depth, depth });
    return x;
  };

  layout(rootId, 0);

  let minX = Infinity;
  let maxX = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
  }
  const span = maxX - minX || 1;
  const normalized = new Map<string, { x: number; y: number; depth: number }>();
  let maxDepth = 0;
  for (const [id, p] of positions) {
    maxDepth = Math.max(maxDepth, p.depth);
    normalized.set(id, {
      x: (p.x - minX) / span,
      y: p.y,
      depth: p.depth,
    });
  }

  const nodeIds = [...normalized.keys()];
  return { positions: normalized, maxDepth, nodeIds };
}
