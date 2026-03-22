import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFlashcard } from '../context/FlashcardContext';
import type { Card } from '../domain/models';

type AssocEdge = { a: string; b: string }; // 无向边：a,b 始终排序存储

type AssocState = {
  nodeIds: string[];
  edges: AssocEdge[];
};

function edgeKey(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${x}__${y}`;
}

function normalizeEdge(a: string, b: string): AssocEdge {
  const [x, y] = a < b ? [a, b] : [b, a];
  return { a: x, b: y };
}

function truncate(s: string, n: number): string {
  const t = (s ?? '').trim();
  if (!t) return '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const STORAGE_PREFIX = 'flashcard-assoc-';

export const LabAssocPage: React.FC = () => {
  const { state } = useFlashcard();

  const [deckId, setDeckId] = useState<string>(state.decks[0]?.id ?? '');
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [edges, setEdges] = useState<AssocEdge[]>([]);

  // 图编辑：点击两个节点创建/删除连接（只创建，删除走列表按钮）
  const [pickedNodeId, setPickedNodeId] = useState<string | null>(null);

  // 联想记忆模式
  const [recallStartId, setRecallStartId] = useState<string>('');
  const [recallPath, setRecallPath] = useState<string[]>([]);

  const cardsOfDeck = useMemo(
    () => state.cards.filter((c) => c.deckId === deckId),
    [state.cards, deckId],
  );

  const selectedCards = useMemo(
    () => selectedNodeIds.map((id) => cardsOfDeck.find((c) => c.id === id)).filter(Boolean) as Card[],
    [cardsOfDeck, selectedNodeIds],
  );

  const selectedNodeSet = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);

  const storageKey = useMemo(() => `${STORAGE_PREFIX}${deckId}`, [deckId]);

  // 加载已保存的联想图（仅当切换到已有 deck 时）
  useEffect(() => {
    if (!deckId) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AssocState;
      if (!parsed || !Array.isArray(parsed.nodeIds) || !Array.isArray(parsed.edges)) return;
      setSelectedNodeIds(parsed.nodeIds);
      setEdges(parsed.edges);
      setPickedNodeId(null);
      setRecallStartId('');
      setRecallPath([]);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // 保存图状态（nodeIds + edges）
  useEffect(() => {
    if (!deckId) return;
    const next: AssocState = { nodeIds: selectedNodeIds, edges };
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // ignore（比如禁用 localStorage）
    }
  }, [deckId, edges, selectedNodeIds, storageKey]);

  const edgeSet = useMemo(() => new Set(edges.map((e) => edgeKey(e.a, e.b))), [edges]);

  const canBuildGraph = selectedNodeIds.length >= 2;

  const nodesLayout = useMemo(() => {
    const N = Math.max(1, selectedNodeIds.length);
    const W = 620;
    const H = 340;
    const cx = W / 2;
    const cy = H / 2;
    const R = Math.min(W, H) * 0.36;

    // 顺时针放置；避免每次渲染抖动，基于 nodeIds 的顺序计算
    return selectedNodeIds.map((id, i) => {
      const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
      return {
        id,
        x: cx + R * Math.cos(ang),
        y: cy + R * Math.sin(ang),
      };
    });
  }, [selectedNodeIds]);

  const posById = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    nodesLayout.forEach((n) => m.set(n.id, { x: n.x, y: n.y }));
    return m;
  }, [nodesLayout]);

  const createOrKeepEdge = (a: string, b: string) => {
    if (a === b) return;
    if (!selectedNodeSet.has(a) || !selectedNodeSet.has(b)) return;
    const norm = normalizeEdge(a, b);
    const k = edgeKey(norm.a, norm.b);
    if (edgeSet.has(k)) return; // 已存在
    setEdges((prev) => [...prev, norm]);
  };

  const handleNodeClick = (id: string) => {
    if (!selectedNodeSet.has(id)) return;

    if (!pickedNodeId) {
      setPickedNodeId(id);
      return;
    }
    if (pickedNodeId === id) {
      setPickedNodeId(null);
      return;
    }

    createOrKeepEdge(pickedNodeId, id);
    setPickedNodeId(null);
  };

  const removeEdge = (a: string, b: string) => {
    const norm = normalizeEdge(a, b);
    const k = edgeKey(norm.a, norm.b);
    setEdges((prev) => prev.filter((e) => edgeKey(e.a, e.b) !== k));
  };

  const startRecall = () => {
    if (!recallStartId) return;
    setRecallPath([recallStartId]);
  };

  const currentRecallId = recallPath.length > 0 ? recallPath[recallPath.length - 1] : '';

  const neighbors = useMemo(() => {
    if (!currentRecallId) return [];
    const out: string[] = [];
    for (const e of edges) {
      if (e.a === currentRecallId) out.push(e.b);
      else if (e.b === currentRecallId) out.push(e.a);
    }
    // 去重 + 稳定顺序（按 selectedNodeIds 顺序）
    const set = new Set(out);
    const order = selectedNodeIds.filter((id) => set.has(id));
    return order;
  }, [currentRecallId, edges, selectedNodeIds]);

  const onPickRecallNext = (id: string) => {
    if (!id) return;
    setRecallPath((prev) => [...prev, id]);
  };

  const handleApplySelection = () => {
    // 只保留仍在选中的 node 的边
    const sel = new Set(selectedNodeIds);
    setEdges((prev) => prev.filter((e) => sel.has(e.a) && sel.has(e.b)));
    setPickedNodeId(null);
    setRecallStartId('');
    setRecallPath([]);
  };

  const toggleSelectNodeForBuild = (id: string) => {
    setSelectedNodeIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const recallCard = useMemo(() => {
    return cardsOfDeck.find((c) => c.id === currentRecallId) ?? null;
  }, [cardsOfDeck, currentRecallId]);

  const recallStartCard = useMemo(() => {
    return cardsOfDeck.find((c) => c.id === recallStartId) ?? null;
  }, [cardsOfDeck, recallStartId]);

  const edgeList = useMemo(() => {
    const cardById = new Map(cardsOfDeck.map((c) => [c.id, c]));
    return edges
      .map((e) => ({
        ...e,
        aFront: cardById.get(e.a)?.front ?? '',
        bFront: cardById.get(e.b)?.front ?? '',
      }))
      .sort((x, y) => x.aFront.localeCompare(y.aFront));
  }, [cardsOfDeck, edges]);

  return (
    <div className="lab-page">
      <div className="lab-header">
        <h2 className="lab-title">🧠 知识联想图谱</h2>
        <p className="lab-subtitle">选择卡组，把部分卡片关联成无向图，然后按连接联想记忆</p>
      </div>

      <div className="lab-assoc-grid">
        {/* 左：选择卡片 */}
        <section className="lab-assoc-panel card-surface">
          <h3 className="lab-section-title">1) 选择卡组与参与卡片</h3>

          <label className="label" style={{ marginTop: 8 }}>卡组</label>
          <select className="input" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
            {state.decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>

          <div className="lab-assoc-card-picker">
            <div className="lab-assoc-picker-title">参与卡片（勾选后生成图）</div>
            <div className="lab-assoc-card-list">
              {cardsOfDeck.length === 0 && (
                <p className="hint">该卡组暂无卡片。</p>
              )}
              {cardsOfDeck.map((c) => {
                const checked = selectedNodeSet.has(c.id);
                return (
                  <label key={c.id} className={`lab-assoc-card-item ${checked ? 'checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelectNodeForBuild(c.id)}
                    />
                    <span className="lab-assoc-card-text">{truncate(c.front || c.back || '', 22)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="lab-assoc-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={selectedNodeIds.length < 2}
              onClick={handleApplySelection}
              title={selectedNodeIds.length < 2 ? '至少选择 2 张卡才能构建无向图' : '生成/更新联想图'}
            >
              生成图
            </button>
            <button
              type="button"
              className="button button-ghost"
              onClick={() => {
                setSelectedNodeIds([]);
                setEdges([]);
                setPickedNodeId(null);
                setRecallStartId('');
                setRecallPath([]);
              }}
            >
              清空
            </button>
          </div>
        </section>

        {/* 右：无向图编辑 + 联想 */}
        <section className="lab-assoc-panel card-surface">
          <h3 className="lab-section-title">2) 在图上建立连接（无向边）</h3>

          <div className="lab-assoc-hint-row">
            <span className="hint small">
              操作：先点击一张卡，再点击另一张卡，就会建立一条无向连接。
            </span>
            {pickedNodeId && (
              <span className="lab-assoc-picked">
                已选中：{truncate(cardsOfDeck.find((c) => c.id === pickedNodeId)?.front ?? '卡片', 18)}
              </span>
            )}
          </div>

          <div className="lab-assoc-graph">
            <svg width="100%" viewBox="0 0 620 340" className="lab-assoc-svg">
              {/* edges */}
              <g>
                {edges.map((e) => {
                  const p1 = posById.get(e.a);
                  const p2 = posById.get(e.b);
                  if (!p1 || !p2) return null;
                  const isHot = recallPath[recallPath.length - 1] === e.a || recallPath[recallPath.length - 1] === e.b;
                  return (
                    <line
                      key={edgeKey(e.a, e.b)}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke={isHot ? 'rgba(56,189,248,0.9)' : 'rgba(148,163,184,0.35)'}
                      strokeWidth={isHot ? 2.2 : 1.6}
                      strokeLinecap="round"
                    />
                  );
                })}
              </g>

              {/* nodes */}
              <g>
                {nodesLayout.map((n) => {
                  const c = cardsOfDeck.find((x) => x.id === n.id);
                  const isPicked = pickedNodeId === n.id;
                  return (
                    <g
                      key={n.id}
                      className="lab-assoc-node"
                      onClick={() => handleNodeClick(n.id)}
                      style={{ cursor: selectedNodeSet.has(n.id) ? 'pointer' : 'default' }}
                    >
                      <circle
                        cx={n.x}
                        cy={n.y}
                        r={isPicked ? 18 : 14}
                        fill={isPicked ? 'rgba(56,189,248,0.18)' : 'rgba(125,211,252,0.12)'}
                        stroke={isPicked ? 'rgba(56,189,248,0.95)' : 'rgba(125,211,252,0.55)'}
                        strokeWidth={isPicked ? 2.2 : 1.6}
                      />
                      <text x={n.x} y={n.y - 18} textAnchor="middle" fontSize={10} fill="rgba(125,211,252,0.9)">
                        #{selectedNodeIds.indexOf(n.id) + 1}
                      </text>
                      <text
                        x={n.x}
                        y={n.y + 4}
                        textAnchor="middle"
                        fontSize={11}
                        fill="rgba(241,245,249,0.95)"
                      >
                        {truncate(c?.front ?? c?.back ?? '', 8) || '卡'}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="lab-assoc-edge-list">
            <div className="lab-assoc-edge-title">3) 连接列表（可删除）</div>
            {edges.length === 0 ? (
              <p className="hint small" style={{ marginTop: 6 }}>尚未建立连接。</p>
            ) : (
              <div className="lab-assoc-edge-items">
                {edgeList.map((e) => (
                  <div key={edgeKey(e.a, e.b)} className="lab-assoc-edge-item">
                    <span className="lab-assoc-edge-text">
                      {truncate(e.aFront, 18)} <span className="lab-assoc-edge-sep">↔</span> {truncate(e.bFront, 18)}
                    </span>
                    <button
                      type="button"
                      className="button button-ghost button-sm"
                      onClick={() => removeEdge(e.a, e.b)}
                      title="删除该无向连接"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lab-assoc-recall">
            <div className="lab-assoc-edge-title">4) 联想记忆（从某张卡开始）</div>
            <div className="lab-assoc-recall-row">
              <select
                className="input"
                value={recallStartId}
                onChange={(e) => setRecallStartId(e.target.value)}
                disabled={selectedNodeIds.length === 0}
              >
                <option value="">请选择起点卡</option>
                {selectedCards.map((c) => (
                  <option key={c.id} value={c.id}>{truncate(c.front || c.back || '', 28)}</option>
                ))}
              </select>
              <button
                type="button"
                className="button button-primary"
                disabled={!recallStartId}
                onClick={startRecall}
              >
                开始联想
              </button>
            </div>

            {recallPath.length > 0 && recallCard && (
              <div className="lab-assoc-recall-body">
                <div className="lab-assoc-recall-current">
                  <div className="lab-assoc-recall-current-title">当前卡：</div>
                  <div className="lab-assoc-recall-current-text">{recallCard.front || recallCard.back}</div>
                </div>
                <div className="lab-assoc-recall-neighbors">
                  <div className="lab-assoc-recall-current-title">可联想下一张（点击继续）</div>
                  {neighbors.length === 0 ? (
                    <p className="hint small">没有相连的卡。</p>
                  ) : (
                    <div className="lab-assoc-neighbor-grid">
                      {neighbors.map((id) => {
                        const c = cardsOfDeck.find((x) => x.id === id);
                        return (
                          <button
                            key={id}
                            type="button"
                            className="button button-ghost lab-assoc-neighbor-btn"
                            onClick={() => onPickRecallNext(id)}
                          >
                            {truncate(c?.front || c?.back || '', 20)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="lab-assoc-recall-path">
                  <div className="lab-assoc-recall-current-title">联想路径：</div>
                  <div className="lab-assoc-path-chips">
                    {recallPath.map((id) => {
                      const c = cardsOfDeck.find((x) => x.id === id);
                      return (
                        <span key={id} className="chip" title={c?.front || c?.back || ''}>
                          {truncate(c?.front || c?.back || '', 12)}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="button button-ghost"
                    onClick={() => {
                      setRecallPath([]);
                      setRecallStartId(recallStartId);
                    }}
                    style={{ marginTop: 10, alignSelf: 'flex-end' }}
                  >
                    重新开始
                  </button>
                </div>
              </div>
            )}

            {recallPath.length === 0 && recallStartCard && (
              <p className="hint small" style={{ marginTop: 8 }}>
                已选起点：{truncate(recallStartCard.front || recallStartCard.back || '', 40)}（点击“开始联想”后显示相连卡片）
              </p>
            )}
          </div>
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

