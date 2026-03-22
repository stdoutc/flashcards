import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CardRenderer } from '../components/CardRenderer';
import { useFlashcard } from '../context/FlashcardContext';
import type { Card } from '../domain/models';
import { AssocTreeMiniMap } from '../components/AssocTreeMiniMap';
import { openAssocRecallWindow } from './LabAssocRecallPage';

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

const STORAGE_PREFIX = 'flashcard-assoc-';
/** 每个节点最多子节点数（单向出边） */
const MAX_CHILDREN = 6;

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

  const [deckId, setDeckId] = useState<string>(state.decks[0]?.id ?? '');
  const [rootId, setRootId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  /** 父 → 有序子节点列表（树） */
  const [childrenMap, setChildrenMap] = useState<Record<string, string[]>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const focusCardRef = useRef<HTMLDivElement | null>(null);
  const topCardRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const [wirePoints, setWirePoints] = useState<Record<string, { x: number; y: number }>>({});

  const cardsOfDeck = useMemo(
    () => state.cards.filter((c) => c.deckId === deckId),
    [state.cards, deckId],
  );

  const cardById = useMemo(() => new Map(cardsOfDeck.map((c) => [c.id, c])), [cardsOfDeck]);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}${deckId}`, [deckId]);
  const loadedStorageKeyRef = useRef<string | null>(null);

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
      showFeedback('首张卡片已作为树根（联想模式默认从此张开始）');
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

  const clearAll = () => {
    setRootId(null);
    setFocusId(null);
    setChildrenMap({});
    setSearchQuery('');
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    showFeedback('已清空本卡组的联想图');
  };

  const clearFocusReset = () => {
    setRootId(null);
    setFocusId(null);
    setChildrenMap({});
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    showFeedback('已清空图谱，请重新添加首张卡片');
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
    loadedStorageKeyRef.current = null;
  }, [storageKey]);

  useEffect(() => {
    if (!deckId || cardsOfDeck.length === 0) return;
    if (loadedStorageKeyRef.current === storageKey) return;
    loadedStorageKeyRef.current = storageKey;

    const byId = new Map(cardsOfDeck.map((c) => [c.id, c]));
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setRootId(null);
        setFocusId(null);
        setChildrenMap({});
        return;
      }
      const parsed = JSON.parse(raw) as
        | AssocStateV4
        | AssocStateV3
        | AssocStateV2
        | AssocStateLegacy
        | Record<string, unknown>;

      if (parsed && typeof parsed === 'object' && 'v' in parsed && (parsed as AssocStateV4).v === 4) {
        const p = parsed as AssocStateV4;
        if (p.rootId && byId.has(p.rootId) && p.focusId && byId.has(p.focusId)) {
          const ch: Record<string, string[]> = {};
          for (const [pid, arr] of Object.entries(p.children ?? {})) {
            if (!byId.has(pid)) continue;
            const ok = (arr ?? []).filter((cid) => byId.has(cid));
            if (ok.length) ch[pid] = ok;
          }
          setRootId(p.rootId);
          setFocusId(p.focusId);
          setChildrenMap(ch);
        } else {
          setRootId(null);
          setFocusId(null);
          setChildrenMap({});
        }
        return;
      }

      if (parsed && typeof parsed === 'object' && 'v' in parsed && (parsed as AssocStateV3).v === 3) {
        const p = parsed as AssocStateV3;
        const edges = (p.edges ?? []).filter((e) => byId.has(e.a) && byId.has(e.b));
        const nodes = nodesFromUndirectedEdges(p.focusId, edges);
        for (const id of p.topIds ?? []) {
          if (byId.has(id)) nodes.add(id);
        }
        const root = p.focusId && byId.has(p.focusId) ? p.focusId : [...nodes][0];
        if (root && nodes.size) {
          const ch = spanningTreeFromUndirected(root, nodes, edges);
          setRootId(root);
          setFocusId(p.focusId && byId.has(p.focusId) ? p.focusId : root);
          setChildrenMap(ch);
        } else {
          setRootId(null);
          setFocusId(null);
          setChildrenMap({});
        }
        return;
      }

      if (parsed && typeof parsed === 'object' && 'v' in parsed && (parsed as AssocStateV2).v === 2) {
        const p = parsed as AssocStateV2;
        const edges = (p.edges ?? []).filter((e) => byId.has(e.a) && byId.has(e.b));
        const nodes = nodesFromUndirectedEdges(p.rootId, edges);
        const root = p.rootId && byId.has(p.rootId) ? p.rootId : [...nodes][0];
        if (root && nodes.size) {
          setRootId(root);
          setFocusId(root);
          setChildrenMap(spanningTreeFromUndirected(root, nodes, edges));
        } else {
          setRootId(null);
          setFocusId(null);
          setChildrenMap({});
        }
        return;
      }

      const legacy = parsed as AssocStateLegacy;
      if (legacy?.nodeIds?.length && Array.isArray(legacy.edges)) {
        const valid = legacy.nodeIds.filter((id) => byId.has(id));
        const edges = legacy.edges.filter((e) => byId.has(e.a) && byId.has(e.b));
        const nodes = new Set(valid);
        for (const e of edges) {
          nodes.add(e.a);
          nodes.add(e.b);
        }
        const root = valid[0];
        if (root && nodes.size) {
          setRootId(root);
          setFocusId(root);
          setChildrenMap(spanningTreeFromUndirected(root, nodes, edges));
        } else {
          setRootId(null);
          setFocusId(null);
          setChildrenMap({});
        }
        return;
      }
    } catch {
      // ignore
    }
  }, [storageKey, deckId, cardsOfDeck]);

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
    if (!deckId || !rootId || !focusId) return;
    const payload: AssocStateV4 = {
      v: 4,
      rootId,
      focusId,
      children: childrenMap,
    };
    try {
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // ignore
    }
  }, [deckId, childrenMap, focusId, rootId, storageKey]);

  const openRecallWindow = () => {
    if (!rootId) return;
    const w = openAssocRecallWindow(deckId, rootId, childrenMap);
    if (!w) showFeedback('无法打开新窗口，请允许本站弹窗后重试');
  };

  const focusNodeFromMiniMap = useCallback(
    (id: string) => {
      if (!treeNodes.has(id)) return;
      setFocusId(id);
      showFeedback('已切换到该起始节点');
    },
    [treeNodes, showFeedback],
  );

  const focusCard = focusId ? cardById.get(focusId) : null;
  const rootCard = rootId ? cardById.get(rootId) : null;

  return (
    <div className="lab-page">
      <div className="lab-header">
        <h2 className="lab-title">🧠 知识联想图谱</h2>
        <p className="lab-subtitle">
          数据结构为<strong>树</strong>（单向：父→子）。<strong>首张加入的卡片</strong>为树根；之后新卡片作为当前起始的子节点连边。切换起始后，上方仅显示下一级子节点。每节点最多 {MAX_CHILDREN} 个子节点。
        </p>
      </div>

      {feedback && (
        <div className="lab-assoc-feedback" role="status">
          {feedback}
        </div>
      )}

      <div className="lab-assoc-grid lab-assoc-grid-wireframe">
        <section className="lab-assoc-panel card-surface lab-assoc-panel-left">
          <h3 className="lab-section-title">搜索并选择卡片</h3>

          <label className="label" style={{ marginTop: 8 }}>
            卡组
          </label>
          <select
            className="input"
            value={deckId}
            onChange={(e) => {
              setDeckId(e.target.value);
              setRootId(null);
              setFocusId(null);
              setChildrenMap({});
            }}
          >
            {state.decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

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
              点击<strong>「加入图谱（首张）」</strong>将所选卡作为树根（联想模式默认从该张先序遍历整棵树）。
            </p>
          )}
          {rootId && (
            <p className="hint small" style={{ marginTop: 10 }}>
              以下为尚未加入树的卡片；已加入的不可重复添加。
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
                  onClick={() => addCardToGraph(c.id)}
                >
                  {!rootId ? '加入图谱（首张）' : '添加为子节点'}
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

        <section className="lab-assoc-panel card-surface lab-assoc-panel-graph lab-assoc-panel-graph-wireframe">
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
                    <button
                      type="button"
                      className="button button-ghost button-sm lab-assoc-focus-reset"
                      onClick={clearFocusReset}
                    >
                      重新选择起始
                    </button>
                  </div>
                </div>
              </div>

              <div className="lab-assoc-edge-list">
                <div className="lab-assoc-edge-title">单向边列表（父 → 子，移除将删除子树）</div>
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

              <div className="lab-assoc-recall">
                <div className="lab-assoc-edge-title">联想模式（新窗口）</div>
                <p className="hint small" style={{ marginBottom: 10 }}>
                  从<strong>树根</strong>起在子卡网格中联想；新窗口内可先翻面再选子卡。上方缩略图可总览关系并点击节点快速定位。
                </p>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={!rootId || nodesInGraph.length === 0}
                  onClick={openRecallWindow}
                >
                  打开联想窗口
                </button>
                {rootCard && (
                  <p className="hint small" style={{ marginTop: 10 }}>
                    树根（联想起点）：{truncate(rootCard.front || rootCard.back || '', 48)}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="lab-assoc-placeholder">
              <div className="lab-assoc-placeholder-icon">📋</div>
              <p className="lab-assoc-placeholder-text">请先在左侧将一张卡片「加入图谱」作为首张（树根）</p>
            </div>
          )}
        </section>
      </div>

      <div style={{ marginTop: 18, textAlign: 'center' }}>
        <Link to="/lab" className="button button-ghost">
          返回实验室
        </Link>
      </div>
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
