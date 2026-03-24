import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CardRenderer } from '../components/CardRenderer';
import { useFlashcard } from '../context/FlashcardContext';
import type { Card } from '../domain/models';
import { AssocTreeMiniMap } from '../components/AssocTreeMiniMap';
import { openAssocRecallWindow } from './LabAssocRecallPage';
import {
  getAssocProject,
  saveAssocProjectGraph,
  updateAssocProjectMeta,
} from '../domain/assocProjectStorage';

/** 无向边（旧版） */
type AssocEdge = { a: string; b: string };

type AssocStateV4 = {
  v: 4;
  rootId: string;
  focusId: string;
  children: Record<string, string[]>;
};

type AssocStateV3 = {
  v: 3;
  focusId: string;
  topIds: string[];
  edges: AssocEdge[];
};

type AssocStateV2 = {
  v: 2;
  rootId: string;
  edges: AssocEdge[];
  linkTargetId: string;
};

type AssocStateLegacy = {
  nodeIds: string[];
  edges: AssocEdge[];
};

/** 每个节点最多子节点数（单向出边） */
const MAX_CHILDREN = 6;
/** 桌面双栏：左栏合理高度下限（与 CSS min-height 一致）。右栏低于此高度时不做左右等高对齐，避免矮视窗下列表被压得过扁。 */
const ASSOC_LEFT_PANEL_MIN_HEIGHT_PX = 520;

function truncate(s: string, n: number): string {
  const t = (s ?? '').trim();
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** 收集树中全部节点 id */
function collectTreeNodes(rootId: string | null, children: Record<string, string[]>): Set<string> {
  const s = new Set<string>();
  if (!rootId) return s;
  s.add(rootId);
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of children[id] ?? []) {
      if (!s.has(c)) {
        s.add(c);
        stack.push(c);
      }
    }
  }
  return s;
}

/** 收集某节点的子树（含自身） */
function collectSubtreeIds(nodeId: string, children: Record<string, string[]>): Set<string> {
  const s = new Set<string>();
  const dfs = (id: string) => {
    s.add(id);
    for (const c of children[id] ?? []) dfs(c);
  };
  dfs(nodeId);
  return s;
}

/** 从父节点移除一条子边并删除该子节点的整棵子树 */
function removeChildSubtree(
  children: Record<string, string[]>,
  parentId: string,
  childId: string,
): Record<string, string[]> {
  const arr = children[parentId];
  if (!arr || !arr.includes(childId)) return children;
  const subtree = collectSubtreeIds(childId, children);
  const next: Record<string, string[]> = { ...children };
  next[parentId] = arr.filter((x) => x !== childId);
  if (next[parentId].length === 0) delete next[parentId];
  for (const id of subtree) {
    delete next[id];
  }
  return next;
}

/** 将树中的某节点 id 替换为新 id，保持父子结构不变（新 id 必须未在树中使用） */
function replaceNodeIdInTree(
  children: Record<string, string[]>,
  fromId: string,
  toId: string,
): Record<string, string[]> {
  if (fromId === toId) return children;
  const next: Record<string, string[]> = {};
  for (const [parent, arr] of Object.entries(children)) {
    const mappedParent = parent === fromId ? toId : parent;
    next[mappedParent] = arr.map((c) => (c === fromId ? toId : c));
  }
  return next;
}

/** 无向图 → 以 root 为根的 BFS 生成树（children 映射） */
function spanningTreeFromUndirected(
  root: string,
  nodes: Set<string>,
  edges: AssocEdge[],
): Record<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const id of nodes) adj.set(id, []);
  for (const e of edges) {
    if (nodes.has(e.a) && nodes.has(e.b)) {
      adj.get(e.a)!.push(e.b);
      adj.get(e.b)!.push(e.a);
    }
  }
  const children: Record<string, string[]> = {};
  const visited = new Set<string>([root]);
  const q: string[] = [root];
  while (q.length) {
    const u = q.shift()!;
    for (const v of adj.get(u) ?? []) {
      if (!visited.has(v)) {
        visited.add(v);
        if (!children[u]) children[u] = [];
        children[u].push(v);
        q.push(v);
      }
    }
  }
  return children;
}

/** 从旧版无向边集得到节点集合 */
function nodesFromUndirectedEdges(rootId: string | null, edges: AssocEdge[]): Set<string> {
  const s = new Set<string>();
  if (rootId) s.add(rootId);
  for (const e of edges) {
    s.add(e.a);
    s.add(e.b);
  }
  return s;
}

export const LabAssocPage: React.FC = () => {
  const { state } = useFlashcard();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  const [deckId, setDeckId] = useState<string>(state.decks[0]?.id ?? '');
  const [rootId, setRootId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  /** 父 → 有序子节点列表（树） */
  const [childrenMap, setChildrenMap] = useState<Record<string, string[]>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('');
  const [projectLoaded, setProjectLoaded] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const lastSavedSnapshotRef = useRef('');

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const rightPanelRef = useRef<HTMLElement | null>(null);
  const focusCardRef = useRef<HTMLDivElement | null>(null);
  const topCardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [wirePoints, setWirePoints] = useState<Record<string, { x: number; y: number }>>({});
  /** 桌面双栏：左栏高度与右栏一致（避免 Flex 行高=max(左,右) 导致左侧更长） */
  const [assocTwoColLeftHeightPx, setAssocTwoColLeftHeightPx] = useState<number | null>(null);

  const cardsOfDeck = useMemo(
    () => state.cards.filter((c) => c.deckId === deckId),
    [state.cards, deckId],
  );

  const cardById = useMemo(() => new Map(cardsOfDeck.map((c) => [c.id, c])), [cardsOfDeck]);

  /** 当前起始节点的直接子节点（仅下一级，用于上方展示） */
  const topIds = useMemo(() => (focusId ? childrenMap[focusId] ?? [] : []), [childrenMap, focusId]);

  const treeNodes = useMemo(
    () => collectTreeNodes(rootId, childrenMap),
    [rootId, childrenMap],
  );

  const usedSet = treeNodes;

  const nodesInGraph = useMemo(() => [...treeNodes], [treeNodes]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cardsOfDeck;
    return cardsOfDeck.filter((c) => `${c.front}\n${c.back}`.toLowerCase().includes(q));
  }, [cardsOfDeck, searchQuery]);

  const listCards = useMemo(() => {
    if (!rootId) return filteredCards;
    return filteredCards.filter((c) => !usedSet.has(c.id));
  }, [filteredCards, rootId, usedSet]);

  const directedEdges = useMemo(() => {
    const out: { parent: string; child: string }[] = [];
    for (const [p, arr] of Object.entries(childrenMap)) {
      for (const c of arr) out.push({ parent: p, child: c });
    }
    return out.sort((a, b) => {
      const af = cardById.get(a.parent)?.front ?? '';
      const bf = cardById.get(b.parent)?.front ?? '';
      return af.localeCompare(bf);
    });
  }, [childrenMap, cardById]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), 3800);
  }, []);

  const graphSnapshot = useMemo(
    () => JSON.stringify({ rootId, focusId, children: childrenMap }),
    [rootId, focusId, childrenMap],
  );

  /** 子节点数 */
  const childCount = useCallback(
    (id: string) => childrenMap[id]?.length ?? 0,
    [childrenMap],
  );

  /** 首张卡片自动成为树根；之后作为当前起始的子节点加入 */
  const addCardToGraph = (id: string) => {
    if (!rootId) {
      setRootId(id);
      setFocusId(id);
      setChildrenMap({});
      showFeedback('首张卡片已加入图谱');
      return;
    }
    if (!focusId) return;
    if (usedSet.has(id)) {
      showFeedback('该卡片已使用，不能重复添加');
      return;
    }
    const n = childCount(focusId);
    if (n >= MAX_CHILDREN) {
      showFeedback(`当前起始卡片已有 ${MAX_CHILDREN} 个子节点，无法继续添加`);
      return;
    }
    setChildrenMap((prev) => ({
      ...prev,
      [focusId]: [...(prev[focusId] ?? []), id],
    }));
  };

  /** 仅允许点击当前起始的**直接子节点**成为新起始 */
  const promoteToFocus = (id: string) => {
    if (!focusId || id === focusId) return;
    if (!topIds.includes(id)) return;
    setFocusId(id);
    showFeedback('已设为新的起始卡片；上方仅显示下一级子节点');
  };

  const removeDirectedEdge = (parentId: string, childId: string) => {
    setChildrenMap((prev) => removeChildSubtree(prev, parentId, childId));
  };

  const startReplaceNode = useCallback(
    (nodeId: string) => {
      if (!treeNodes.has(nodeId)) return;
      setReplaceTargetId(nodeId);
      showFeedback('已进入替换模式：请在左侧选择一张卡片替换该节点');
    },
    [treeNodes, showFeedback],
  );

  const cancelReplaceNode = useCallback(() => {
    setReplaceTargetId(null);
    showFeedback('已取消替换模式');
  }, [showFeedback]);

  const applyReplaceNode = useCallback(
    (nextId: string) => {
      if (!replaceTargetId) return;
      if (!treeNodes.has(replaceTargetId)) {
        setReplaceTargetId(null);
        return;
      }
      if (usedSet.has(nextId)) {
        showFeedback('该卡片已在图谱中，无法用于替换');
        return;
      }
      setChildrenMap((prev) => replaceNodeIdInTree(prev, replaceTargetId, nextId));
      if (rootId === replaceTargetId) setRootId(nextId);
      if (focusId === replaceTargetId) setFocusId(nextId);
      setReplaceTargetId(null);
      showFeedback('已替换节点卡片，树结构保持不变');
    },
    [replaceTargetId, treeNodes, usedSet, rootId, focusId, showFeedback],
  );

  const clearAll = () => {
    setRootId(null);
    setFocusId(null);
    setChildrenMap({});
    setSearchQuery('');
    showFeedback('已清空当前联想图谱');
  };

  const measureWires = useCallback(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    const wr = ws.getBoundingClientRect();
    const center = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - wr.left,
        y: r.top + r.height / 2 - wr.top,
      };
    };
    const next: Record<string, { x: number; y: number }> = {};
    if (focusId) {
      const c = center(focusCardRef.current);
      if (c) next[focusId] = c;
    }
    for (const id of topIds) {
      const c = center(topCardRefs.current.get(id) ?? null);
      if (c) next[id] = c;
    }
    setWirePoints(next);
  }, [focusId, topIds]);

  useLayoutEffect(() => {
    measureWires();
  }, [measureWires, childrenMap, feedback]);

  useLayoutEffect(() => {
    const rightEl = rightPanelRef.current;
    if (!rightEl) return;

    const mq = window.matchMedia('(min-width: 900px)');
    const update = () => {
      if (!mq.matches) {
        setAssocTwoColLeftHeightPx(null);
        return;
      }
      const h = Math.round(rightEl.getBoundingClientRect().height);
      // 右栏过矮时不强制左栏等高，交给 CSS min-height 保证列表可视区
      if (h < ASSOC_LEFT_PANEL_MIN_HEIGHT_PX) {
        setAssocTwoColLeftHeightPx(null);
        return;
      }
      setAssocTwoColLeftHeightPx(h);
    };

    const ro = new ResizeObserver(update);
    ro.observe(rightEl);
    mq.addEventListener('change', update);
    window.addEventListener('resize', update);
    update();

    return () => {
      ro.disconnect();
      mq.removeEventListener('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  useEffect(() => {
    const ws = workspaceRef.current;
    if (!ws) return;
    const ro = new ResizeObserver(() => measureWires());
    ro.observe(ws);
    window.addEventListener('resize', measureWires);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureWires);
    };
  }, [measureWires]);

  useEffect(() => {
    setProjectLoaded(false);
    if (!projectId) {
      navigate('/assoc', { replace: true });
      return;
    }
    const p = getAssocProject(projectId);
    if (!p) {
      navigate('/assoc', { replace: true });
      return;
    }
    setProjectName(p.name);
    const nextDeckId = state.decks.some((d) => d.id === p.deckId)
      ? p.deckId
      : state.decks[0]?.id ?? '';
    setDeckId(nextDeckId);
    if (nextDeckId !== p.deckId) {
      updateAssocProjectMeta(projectId, { deckId: nextDeckId });
    }
    setRootId(p.graph.rootId);
    setFocusId(p.graph.focusId);
    setChildrenMap(p.graph.children ?? {});
    lastSavedSnapshotRef.current = JSON.stringify({
      rootId: p.graph.rootId,
      focusId: p.graph.focusId,
      children: p.graph.children ?? {},
    });
    setHasUnsavedChanges(false);
    setProjectLoaded(true);
  }, [projectId, state.decks, navigate]);

  useEffect(() => {
    if (replaceTargetId && !treeNodes.has(replaceTargetId)) {
      setReplaceTargetId(null);
    }
  }, [replaceTargetId, treeNodes]);

  useEffect(() => {
    if (rootId && !cardById.has(rootId)) {
      setRootId(null);
      setFocusId(null);
      setChildrenMap({});
    }
    if (focusId && !cardById.has(focusId)) {
      setFocusId(rootId && cardById.has(rootId) ? rootId : null);
    }
    setChildrenMap((prev) => {
      const next: Record<string, string[]> = {};
      for (const [pid, arr] of Object.entries(prev)) {
        if (!cardById.has(pid)) continue;
        const ok = arr.filter((cid) => cardById.has(cid));
        if (ok.length) next[pid] = ok;
      }
      return next;
    });
  }, [cardById, focusId, rootId]);

  useEffect(() => {
    if (!projectLoaded) return;
    setHasUnsavedChanges(graphSnapshot !== lastSavedSnapshotRef.current);
  }, [projectLoaded, graphSnapshot]);

  const saveCurrentGraph = useCallback(() => {
    if (!projectId || !projectLoaded) return;
    saveAssocProjectGraph(projectId, {
      rootId,
      focusId,
      children: childrenMap,
    });
    lastSavedSnapshotRef.current = graphSnapshot;
    setHasUnsavedChanges(false);
    showFeedback('已保存图谱');
  }, [projectId, projectLoaded, rootId, focusId, childrenMap, graphSnapshot, showFeedback]);

  const autoSaveTimerRef = useRef<number | null>(null);
  const persistGraphSilent = useCallback(() => {
    if (!projectId || !projectLoaded) return;
    saveAssocProjectGraph(projectId, {
      rootId,
      focusId,
      children: childrenMap,
    });
    lastSavedSnapshotRef.current = graphSnapshot;
    setHasUnsavedChanges(false);
  }, [projectId, projectLoaded, rootId, focusId, childrenMap, graphSnapshot]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // 兜底：在浏览器触发卸载时同步持久化，避免电脑重启/异常关闭导致丢失。
      // localStorage 写入是同步的，一般能在 beforeunload 阶段完成。
      persistGraphSilent();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges, persistGraphSilent]);

  // 图谱编辑目前是“手动保存”，但如果发生电脑重启/异常退出，可能不会触发 `beforeunload`。
  // 这里做一个防抖自动保存，确保重启后可恢复图谱，而不是回到 root/focus 为空的状态。
  useEffect(() => {
    if (!projectLoaded || !projectId) return;
    if (!hasUnsavedChanges) return;

    if (autoSaveTimerRef.current != null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = window.setTimeout(() => {
      autoSaveTimerRef.current = null;
      persistGraphSilent();
    }, 800);

    return () => {
      if (autoSaveTimerRef.current != null) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [projectLoaded, projectId, hasUnsavedChanges, persistGraphSilent, graphSnapshot]);

  const openRecallInNewTab = useCallback(() => {
    if (!rootId) return;
    const w = openAssocRecallWindow(deckId, rootId, childrenMap);
    if (!w) showFeedback('无法打开新标签页，请允许本站弹窗后重试');
  }, [deckId, rootId, childrenMap, showFeedback]);

  const focusNodeFromMiniMap = useCallback(
    (id: string) => {
      if (!treeNodes.has(id)) return;
      setFocusId(id);
      showFeedback('已切换到该起始节点');
    },
    [treeNodes, showFeedback],
  );

  const focusCard = focusId ? cardById.get(focusId) : null;

  const showAssocBottomToolbar = Boolean(rootId && nodesInGraph.length > 0);

  return (
    <div
      className={`lab-page lab-page--assoc-graph${showAssocBottomToolbar ? ' lab-page--assoc-toolbar' : ''}`}
    >
      <div className="lab-header">
        <h2 className="lab-title">🧠 {projectName || '未命名联想图谱'}</h2>
        <p className="lab-subtitle">
          在左侧加入卡片并在右侧编辑起始/节点；随时可在下方工具栏打开联想回忆。
        </p>
      </div>

      {feedback && (
        <div className="lab-assoc-feedback" role="status">
          {feedback}
        </div>
      )}

      <div className="lab-assoc-grid lab-assoc-grid-wireframe">
        <section
          className="lab-assoc-panel card-surface lab-assoc-panel-left"
          style={
            assocTwoColLeftHeightPx != null
              ? {
                  height: assocTwoColLeftHeightPx,
                  minHeight: assocTwoColLeftHeightPx,
                  maxHeight: assocTwoColLeftHeightPx,
                  overflow: 'hidden',
                }
              : undefined
          }
        >
          <h3 className="lab-section-title">搜索并选择卡片</h3>

          <label className="label" style={{ marginTop: 8 }}>
            卡组（创建图谱时已绑定）
          </label>
          <div className="input" aria-readonly="true">
            {state.decks.find((d) => d.id === deckId)?.name ?? '未绑定卡组'}
          </div>

          <div className="lab-assoc-search-block">
            <label className="label">搜索</label>
            <input
              className="input"
              type="search"
              placeholder="关键词筛选正面 / 背面…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
          </div>

          {!rootId && (
            <p className="hint small" style={{ marginTop: 10 }}>
              点击<strong>「加入图谱（首张）」</strong>加入首张卡片。
            </p>
          )}
          {rootId && (
            <p className="hint small" style={{ marginTop: 10 }}>
              未加入图谱的卡片可继续添加；已加入的不可重复添加。
            </p>
          )}
          {replaceTargetId && (
            <p className="hint small" style={{ marginTop: 8 }}>
              当前为<strong>替换模式</strong>：点击下方任一卡片可替换节点；
              <button
                type="button"
                className="button button-ghost button-sm"
                style={{ marginLeft: 8 }}
                onClick={() => setReplaceTargetId(null)}
              >
                取消替换
              </button>
            </p>
          )}

          <div className="lab-assoc-results lab-assoc-results-left" role="list">
            {cardsOfDeck.length === 0 && <p className="hint">该卡组暂无卡片。</p>}
            {listCards.map((c) => (
              <article key={c.id} className="lab-assoc-result-card" role="listitem">
                <AssocCardSnippet card={c} />
                <button
                  type="button"
                  className="button button-primary lab-assoc-result-btn"
                  onClick={() =>
                    replaceTargetId ? applyReplaceNode(c.id) : addCardToGraph(c.id)
                  }
                >
                  {replaceTargetId
                    ? '替换该节点'
                    : !rootId
                      ? '加入图谱（首张）'
                      : '添加为子节点'}
                </button>
              </article>
            ))}

            {rootId && listCards.length === 0 && (
              <p className="hint small">没有可添加的卡片（全部已加入或搜索无结果）。</p>
            )}
          </div>

          <div className="lab-assoc-actions">
            <button type="button" className="button button-ghost" onClick={clearAll}>
              清空本卡组图谱
            </button>
          </div>
        </section>

        <section
          ref={rightPanelRef}
          className="lab-assoc-panel card-surface lab-assoc-panel-graph lab-assoc-panel-graph-wireframe"
        >
          <h3 className="lab-section-title">联想图（树）</h3>

          {rootId && treeNodes.size > 0 && (
            <AssocTreeMiniMap
              className="lab-assoc-minimap-wrap"
              rootId={rootId}
              children={childrenMap}
              focusId={focusId}
              getLabel={(id) =>
                truncate(cardById.get(id)?.front ?? cardById.get(id)?.back ?? id, 10)
              }
              getTitle={(id) => {
                const c = cardById.get(id);
                if (!c) return id;
                const f = (c.front ?? '').trim();
                const b = (c.back ?? '').trim();
                return b ? `${f}\n——\n${b}` : f;
              }}
              onNodeClick={focusNodeFromMiniMap}
              caption="关系缩略图"
            />
          )}

          {focusId && focusCard ? (
            <>
              <div
                ref={workspaceRef}
                className="lab-assoc-workspace"
                aria-label="联想图工作区：上方为当前起始的子节点，下方为起始卡片"
              >
                <svg className="lab-assoc-wires" aria-hidden>
                  <defs>
                    <marker
                      id="lab-assoc-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="7"
                      refY="4"
                      orient="auto"
                      markerUnits="strokeWidth"
                    >
                      <path d="M0,0 L8,4 L0,8 Z" fill="rgba(129,140,248,0.85)" />
                    </marker>
                  </defs>
                  {topIds.map((cid) => {
                    const pf = wirePoints[focusId];
                    const pt = wirePoints[cid];
                    if (!pf || !pt) return null;
                    return (
                      <line
                        key={`${focusId}-${cid}`}
                        x1={pf.x}
                        y1={pf.y}
                        x2={pt.x}
                        y2={pt.y}
                        stroke="rgba(129,140,248,0.65)"
                        strokeWidth={1.9}
                        strokeLinecap="round"
                        markerEnd="url(#lab-assoc-arrow)"
                      />
                    );
                  })}
                </svg>

                <div className="lab-assoc-top-zone">
                  <div className="lab-assoc-zone-label">子节点（下一级，点击设为新的起始）</div>
                  <div className="lab-assoc-top-row">
                    {topIds.length === 0 && (
                      <p className="lab-assoc-top-empty hint">
                        从左栏添加卡片，将作为当前起始的子节点显示于此
                      </p>
                    )}
                    {topIds.map((id) => {
                      const c = cardById.get(id);
                      if (!c) return null;
                      const subs = childCount(id);
                      return (
                        <div
                          key={id}
                          ref={(el) => {
                            if (el) topCardRefs.current.set(id, el);
                            else topCardRefs.current.delete(id);
                          }}
                          className="lab-assoc-top-card"
                          role="button"
                          tabIndex={0}
                          onClick={() => promoteToFocus(id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              promoteToFocus(id);
                            }
                          }}
                        >
                          <span className="lab-assoc-top-card-deg">子节点 {subs}/{MAX_CHILDREN}</span>
                          <div className="lab-assoc-top-card-body">
                            <CardRenderer content={c.front} className="lab-assoc-md" compact />
                          </div>
                          {c.back?.trim() ? (
                            <details className="lab-assoc-graph-details">
                              <summary>背面</summary>
                              <div className="lab-assoc-top-card-back">
                                <CardRenderer content={c.back} className="lab-assoc-md" compact />
                              </div>
                            </details>
                          ) : null}

                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              marginTop: 10,
                              flexWrap: 'wrap',
                            }}
                          >
                            <button
                              type="button"
                              className="button button-ghost button-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (replaceTargetId === id) {
                                  cancelReplaceNode();
                                  return;
                                }
                                startReplaceNode(id);
                              }}
                            >
                              {replaceTargetId === id ? '取消更改' : '更改'}
                            </button>
                            <button
                              type="button"
                              className="button button-ghost button-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeDirectedEdge(focusId, id);
                              }}
                            >
                              删除
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lab-assoc-focus-zone">
                  <div className="lab-assoc-zone-label">当前起始卡片（父节点）</div>
                  <div ref={focusCardRef} className="lab-assoc-focus-card">
                    <span className="lab-assoc-pill lab-assoc-pill-root">起始</span>
                    <span className="lab-assoc-card-deg-focus">
                      子节点 {childCount(focusId)}/{MAX_CHILDREN}
                    </span>
                    <div className="lab-assoc-focus-card-body">
                      <CardRenderer content={focusCard.front} className="lab-assoc-md" compact />
                    </div>
                    {focusCard.back?.trim() ? (
                      <details className="lab-assoc-graph-details">
                        <summary>背面</summary>
                        <div className="lab-assoc-focus-card-back">
                          <CardRenderer content={focusCard.back} className="lab-assoc-md" compact />
                        </div>
                      </details>
                    ) : null}

                    <div
                      style={{
                        display: 'flex',
                        gap: 8,
                        marginTop: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <button
                        type="button"
                        className="button button-ghost button-sm"
                        onClick={() => {
                          if (replaceTargetId === focusId) {
                            cancelReplaceNode();
                            return;
                          }
                          startReplaceNode(focusId);
                        }}
                      >
                        {replaceTargetId === focusId ? '取消更改' : '更改'}
                      </button>
                      <button
                        type="button"
                        className="button button-ghost button-sm"
                        onClick={() => {
                          clearAll();
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <details className="lab-assoc-edge-details">
                <summary className="lab-assoc-edge-summary">
                  单向边列表（父 → 子，移除将删除子树）
                </summary>
                <div className="lab-assoc-edge-list">
                  {directedEdges.length === 0 ? (
                    <p className="hint small">添加子节点后将在此列出有向边。</p>
                  ) : (
                    <div className="lab-assoc-edge-items">
                      {directedEdges.map((e) => (
                        <div key={`${e.parent}-${e.child}`} className="lab-assoc-edge-item">
                          <span className="lab-assoc-edge-text">
                            {truncate(cardById.get(e.parent)?.front ?? '', 20)}{' '}
                            <span className="lab-assoc-edge-sep">→</span>{' '}
                            {truncate(cardById.get(e.child)?.front ?? '', 20)}
                          </span>
                          <button
                            type="button"
                            className="button button-ghost button-sm"
                            onClick={() => removeDirectedEdge(e.parent, e.child)}
                          >
                            移除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </>
          ) : (
            <div className="lab-assoc-placeholder">
              <div className="lab-assoc-placeholder-icon">📋</div>
              <p className="lab-assoc-placeholder-text">请先在左侧点击「加入图谱」加入首张卡片</p>
            </div>
          )}
        </section>
      </div>

      {!showAssocBottomToolbar && (
        <div style={{ marginTop: 18, textAlign: 'center' }}>
          <button type="button" className="button button-ghost" onClick={() => navigate('/assoc')}>
            返回联想首页
          </button>
        </div>
      )}

      {showAssocBottomToolbar && (
        <nav className="lab-assoc-bottom-toolbar" aria-label="知识联想图谱工具栏">
          <div className="lab-assoc-bottom-toolbar-inner">
            <div className="lab-assoc-bottom-toolbar-lead">
              <span className="lab-assoc-bottom-toolbar-icon" aria-hidden>
                🧠
              </span>
              <div className="lab-assoc-bottom-toolbar-text">
                <span className="lab-assoc-bottom-toolbar-title">联想模式</span>
                <span className="lab-assoc-bottom-toolbar-sub">新标签页 · 全屏练习</span>
              </div>
            </div>
            <div className="lab-assoc-bottom-toolbar-actions">
              <button
                type="button"
                className="button button-primary button-sm lab-assoc-bottom-toolbar-btn"
                onClick={saveCurrentGraph}
                disabled={!projectLoaded || !hasUnsavedChanges}
              >
                保存图谱
              </button>
              <button
                type="button"
                className="button button-primary button-sm lab-assoc-bottom-toolbar-btn"
                onClick={openRecallInNewTab}
              >
                在新标签页打开联想
              </button>
              {hasUnsavedChanges ? (
                <span className="hint small" style={{ color: 'var(--warn, #f59e0b)' }}>
                  有未保存更改
                </span>
              ) : (
                <span className="hint small">已保存</span>
              )}
              <button
                type="button"
                className="button button-ghost button-sm lab-assoc-bottom-toolbar-link"
                onClick={() => navigate('/assoc')}
              >
                返回联想首页
              </button>
            </div>
          </div>
        </nav>
      )}
    </div>
  );
};

function AssocCardSnippet({ card }: { card: Card }) {
  return (
    <div className="lab-assoc-snippet-inner">
      <div className="lab-assoc-snippet-face">
        <span className="lab-assoc-snippet-label">正面</span>
        <div className="lab-assoc-snippet-body">
          <CardRenderer content={card.front} className="lab-assoc-md" compact />
        </div>
      </div>
      {card.back?.trim() ? (
        <details className="lab-assoc-details">
          <summary>背面</summary>
          <div className="lab-assoc-snippet-body">
            <CardRenderer content={card.back} className="lab-assoc-md" compact />
          </div>
        </details>
      ) : null}
    </div>
  );
}
