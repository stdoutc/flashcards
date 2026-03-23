import { flextree } from 'd3-flextree';

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

export type LayoutAssocTreeMiniMapOptions = {
  /** 用于估算同层横向占位，减轻标签重叠 */
  getLabel?: (id: string) => string;
  /** 与缩略图截断一致，用于宽度估算 */
  labelMaxChars?: number;
  /**
   * 各节点标签在归一化横坐标 [0,1] 上的「半宽」（由 UI 用 Canvas 实测后传入）。
   * 若提供则优先用于拉开同层间距，避免仅靠字符数估算导致中文标签重叠。
   */
  labelHalfWidthNorm?: Map<string, number>;
};

/** 树缩略图布局：叶子横坐标递增，父节点取子节点 x 均值（经典 tidy tree） */
export function layoutAssocTreeMiniMap(
  rootId: string,
  children: Record<string, string[]>,
  options?: LayoutAssocTreeMiniMapOptions,
): {
  positions: Map<string, { x: number; y: number; depth: number }>;
  maxDepth: number;
  nodeIds: string[];
} {
  const getLabel = options?.getLabel;
  const labelMaxChars = options?.labelMaxChars ?? 10;
  const labelHalfWidthNorm = options?.labelHalfWidthNorm;
  const buildTree = (id: string): { id: string; children?: { id: string; children?: unknown[] }[] } => {
    const kids = children[id] ?? [];
    return kids.length ? { id, children: kids.map((c) => buildTree(c)) } : { id };
  };

  const rootData = buildTree(rootId);
  const gap = 0.04;
  const baseNodeWidth = 0.06;
  const layout = flextree({
    children: (d: { id: string; children?: { id: string }[] }) => d.children ?? null,
    nodeSize: (n: { data: { id: string } }) => {
      const id = n.data.id;
      const halfW =
        labelHalfWidthNorm?.get(id) ??
        (getLabel ? estimateLabelHalfWidthNorm(getLabel(id), labelMaxChars) : 0.05);
      return [Math.max(baseNodeWidth, halfW * 2 + gap), 1];
    },
    spacing: () => gap,
  });

  const tree = layout.hierarchy(rootData);
  layout(tree);

  const positions = new Map<string, { x: number; y: number; depth: number }>();
  let minX = Infinity;
  let maxDepth = 0;
  for (const node of tree.descendants() as Array<{ x: number; depth: number; data: { id: string } }>) {
    minX = Math.min(minX, node.x);
    maxDepth = Math.max(maxDepth, node.depth);
  }
  for (const node of tree.descendants() as Array<{ x: number; depth: number; data: { id: string } }>) {
    positions.set(node.data.id, {
      x: node.x - minX,
      y: node.depth,
      depth: node.depth,
    });
  }

  const nodeIds = [...positions.keys()];
  return { positions, maxDepth, nodeIds };
}

/** 按截断后字符数估算标签「半宽」（归一化 x），使同层中心距 ≥ 两标签半宽之和（无 Canvas 实测时的回退） */
function estimateLabelHalfWidthNorm(raw: string, maxChars: number): number {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  const len = Math.min(t.length || 1, maxChars);
  // 中文偏宽，略放大系数；再留出与圆节点的水平余量
  return 0.027 * len + 0.038;
}

