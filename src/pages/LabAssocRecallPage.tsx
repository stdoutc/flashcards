import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AssocTreeMiniMap } from '../components/AssocTreeMiniMap';
import { CardRenderer } from '../components/CardRenderer';
import { findPathFromRoot } from '../domain/assocTree';
import { useFlashcard } from '../context/FlashcardContext';

const STORAGE_KEY_PREFIX = 'flashcard-assoc-recall-';

/** v2：带树结构，联想时按「起始卡 → 反面 → 子卡网格」遍历 */
export type AssocRecallPayloadV2 = {
  v: 2;
  deckId: string;
  rootId: string;
  children: Record<string, string[]>;
};

function countTreeNodes(rootId: string, children: Record<string, string[]>): number {
  let n = 0;
  const walk = (id: string) => {
    n++;
    for (const c of children[id] ?? []) walk(c);
  };
  walk(rootId);
  return n;
}

/** 收集树中所有 id（用于「全部遍历」进度） */
function collectAllIds(rootId: string, children: Record<string, string[]>): Set<string> {
  const s = new Set<string>();
  const walk = (id: string) => {
    s.add(id);
    for (const c of children[id] ?? []) walk(c);
  };
  walk(rootId);
  return s;
}

function truncateLabel(s: string, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '·';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const recallPayloadByKey = new Map<string, AssocRecallPayloadV2>();

function takePayload(k: string): AssocRecallPayloadV2 | null {
  const cached = recallPayloadByKey.get(k);
  if (cached) return cached;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${k}`);
    if (!raw) return null;
    const p = JSON.parse(raw) as AssocRecallPayloadV2 & { cardIds?: string[] };
    if (p?.v !== 2 || !p.deckId || !p.rootId || typeof p.children !== 'object') return null;
    recallPayloadByKey.set(k, p);
    localStorage.removeItem(`${STORAGE_KEY_PREFIX}${k}`);
    return p;
  } catch {
    return null;
  }
}

type Phase = 'showFront' | 'showBack' | 'pickChild';

/**
 * 联想模式：
 * 1. 先大卡片显示当前「起始」节点正面 → 点击翻面
 * 2. 再点击隐藏起始卡，同屏显示其所有子节点正面
 * 3. 点击某一子卡 → 将其设为新的起始节点并大卡片显示正面，循环
 * 4. 无子节点时提示；可返回上一层继续遍历直至覆盖完全部节点（进度可查看）
 */
export const LabAssocRecallPage: React.FC = () => {
  const { state } = useFlashcard();
  const [searchParams] = useSearchParams();
  const [payload, setPayload] = useState<AssocRecallPayloadV2 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** 从根到当前起始节点的路径（含当前），至少一项为 root */
  const [trail, setTrail] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('showFront');
  /** 已作为「起始卡」进入过正面阶段的节点（用于遍历进度） */
  const [visitedStarts, setVisitedStarts] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const k = searchParams.get('k');
    if (!k) {
      setLoadError('缺少联想数据参数，请从知识联想图谱页打开。');
      return;
    }
    const p = takePayload(k);
    if (!p) {
      setLoadError('联想数据已失效或已使用，请重新在图谱页打开窗口。');
      return;
    }
    setPayload(p);
    setTrail([p.rootId]);
    setPhase('showFront');
    setVisitedStarts(new Set([p.rootId]));
  }, [searchParams]);

  const { deckId, rootId, children } = payload ?? {
    deckId: '',
    rootId: '',
    children: {} as Record<string, string[]>,
  };

  const cardById = useMemo(() => {
    return new Map(state.cards.filter((c) => c.deckId === deckId).map((c) => [c.id, c]));
  }, [state.cards, deckId]);

  const treeSize = useMemo(
    () => (rootId ? countTreeNodes(rootId, children) : 0),
    [rootId, children],
  );

  const allIdsInTree = useMemo(
    () => (rootId ? collectAllIds(rootId, children) : new Set<string>()),
    [rootId, children],
  );

  const focusId = trail.length > 0 ? trail[trail.length - 1] : null;
  const focusCard = focusId ? cardById.get(focusId) : null;

  const childIds = useMemo(() => {
    if (!focusId) return [];
    return children[focusId] ?? [];
  }, [focusId, children]);

  const visitedCount = visitedStarts.size;
  const allVisited = treeSize > 0 && visitedCount >= allIdsInTree.size;

  /** 子卡网格：数量少格子大，数量多格子与字号缩小 */
  const pickGridStyle = useMemo((): React.CSSProperties => {
    const n = childIds.length;
    if (n <= 0) return {};
    const minW = n === 1 ? 300 : n <= 2 ? 240 : n <= 4 ? 170 : n <= 8 ? 130 : 100;
    const maxH = n <= 2 ? 260 : n <= 4 ? 200 : n <= 8 ? 160 : 120;
    const fontRem = n <= 2 ? 0.95 : n <= 4 ? 0.88 : n <= 8 ? 0.82 : 0.74;
    return {
      ['--assoc-pick-min' as string]: `${minW}px`,
      ['--assoc-pick-max-h' as string]: `${maxH}px`,
      ['--assoc-pick-font' as string]: `${fontRem}rem`,
    };
  }, [childIds.length]);

  /** 主区域大卡片：正面 / 反面点击 */
  const handleMainCardClick = useCallback(() => {
    if (!focusId || !focusCard) return;
    if (phase === 'showFront') {
      setPhase('showBack');
      return;
    }
    if (phase === 'showBack') {
      setPhase('pickChild');
      return;
    }
  }, [phase, focusId, focusCard]);

  /** 选择子节点为新起始 */
  const pickChildAsNewStart = useCallback(
    (childId: string) => {
      setTrail((t) => [...t, childId]);
      setPhase('showFront');
      setVisitedStarts((prev) => new Set(prev).add(childId));
    },
    [],
  );

  const goBackLevel = useCallback(() => {
    setTrail((t) => {
      if (t.length <= 1) return t;
      return t.slice(0, -1);
    });
    setPhase('pickChild');
  }, []);

  /** 缩略图点击：跳到该节点为起始（根到该点路径） */
  const jumpToNodeFromMiniMap = useCallback(
    (id: string) => {
      const path = findPathFromRoot(rootId, id, children);
      if (!path?.length) return;
      setTrail(path);
      setPhase('showFront');
      setVisitedStarts((prev) => new Set(prev).add(id));
    },
    [rootId, children],
  );

  const handleKeyDownMain = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleMainCardClick();
      }
    },
    [handleMainCardClick],
  );

  const handleKeyDownThumb = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickChildAsNewStart(id);
      }
    },
    [pickChildAsNewStart],
  );

  if (loadError) {
    return (
      <div className="lab-assoc-recall-page">
        <div className="lab-assoc-recall-inner lab-assoc-recall-error card-surface">
          <p>{loadError}</p>
          <Link to="/lab/assoc" className="button button-primary">
            返回知识联想图谱
          </Link>
        </div>
      </div>
    );
  }

  if (!payload || !focusId) {
    return (
      <div className="lab-assoc-recall-page">
        <div className="lab-assoc-recall-inner hint">加载中…</div>
      </div>
    );
  }

  if (!focusCard) {
    return (
      <div className="lab-assoc-recall-page">
        <div className="lab-assoc-recall-inner lab-assoc-recall-error card-surface">
          <p>找不到当前卡片数据，请确认牌组未变更后从图谱页重新打开。</p>
          <Link to="/lab/assoc" className="button button-primary">
            返回知识联想图谱
          </Link>
        </div>
      </div>
    );
  }

  const showFlip = phase === 'showFront' || phase === 'showBack';
  const flipped = phase === 'showBack';

  return (
    <div className="lab-assoc-recall-page">
      <header className="lab-assoc-recall-toolbar card-surface">
        <span className="lab-assoc-recall-title">联想模式</span>
        <span className="lab-assoc-recall-progress">
          树共 {treeSize} 张 · 已作起始 {visitedCount}/{allIdsInTree.size} · 深度 {trail.length}
        </span>
        <div className="lab-assoc-recall-toolbar-actions">
          {trail.length > 1 && (
            <button type="button" className="button button-ghost button-sm" onClick={goBackLevel}>
              返回上一层
            </button>
          )}
          <button type="button" className="button button-ghost button-sm" onClick={() => window.close()}>
            关闭窗口
          </button>
          <Link to="/lab/assoc" className="button button-ghost button-sm">
            返回图谱
          </Link>
        </div>
      </header>

      {treeSize > 0 && (
        <div className="lab-assoc-recall-minimap card-surface">
          <AssocTreeMiniMap
            rootId={rootId}
            children={children}
            focusId={focusId}
            trailIds={trail}
            markedIds={visitedStarts}
            getLabel={(id) =>
              truncateLabel(cardById.get(id)?.front ?? cardById.get(id)?.back ?? id, 10)
            }
            getTitle={(id) => {
              const c = cardById.get(id);
              if (!c) return id;
              const f = (c.front ?? '').trim();
              const b = (c.back ?? '').trim();
              return b ? `${f}\n——\n${b}` : f;
            }}
            onNodeClick={jumpToNodeFromMiniMap}
            caption="关系缩略图（当前路径高亮，绿环为已复习）"
          />
        </div>
      )}

      <p className="lab-assoc-recall-hint hint">
        先看<strong>起始卡正面</strong> → 点击看<strong>反面</strong> → 再点击<strong>隐藏起始卡</strong>并同屏显示<strong>所有子卡正面</strong> →
        点击某一子卡将其设为<strong>新起始</strong>并放大；重复直至走遍各分支。
        <span className="lab-assoc-recall-hint-note"> 带「已复习」标记的子卡表示本会话内曾进入过，关闭窗口后不保留。</span>
      </p>

      {allVisited && (
        <p className="lab-assoc-recall-context hint" style={{ color: 'var(--ok, #4ade80)' }}>
          已从各节点进入过起始流程，遍历完成。仍可返回上一层复习其他路径。
        </p>
      )}

      <div className="lab-assoc-recall-stage">
        {showFlip && (
          <div className="lab-assoc-recall-start-wrap">
            <div
              className="lab-assoc-flip-scene lab-assoc-recall-start-flip"
              role="button"
              tabIndex={0}
              onClick={handleMainCardClick}
              onKeyDown={handleKeyDownMain}
            >
              <div className={`lab-assoc-flip-inner ${flipped ? 'is-flipped' : ''}`}>
                <div className="lab-assoc-flip-face lab-assoc-flip-front card-surface">
                  <span className="lab-assoc-recall-face-label">起始 · 正面</span>
                  <div className="lab-assoc-recall-md">
                    <CardRenderer content={focusCard.front} compact />
                  </div>
                </div>
                <div className="lab-assoc-flip-face lab-assoc-flip-back card-surface">
                  <span className="lab-assoc-recall-face-label">起始 · 反面</span>
                  <div className="lab-assoc-recall-md">
                    {focusCard.back?.trim() ? (
                      <CardRenderer content={focusCard.back} compact />
                    ) : (
                      <p className="hint">（无背面内容）</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <p className="lab-assoc-recall-start-hint hint">
              {!flipped ? '点击翻面' : '再点击隐藏起始卡，显示子卡片（同屏）'}
            </p>
          </div>
        )}

        {phase === 'pickChild' && (
          <>
            {childIds.length === 0 ? (
              <div className="lab-assoc-recall-empty card-surface">
                <p>当前节点没有子节点。</p>
                {trail.length > 1 ? (
                  <button type="button" className="button button-primary" onClick={goBackLevel}>
                    返回上一层
                  </button>
                ) : (
                  <p className="hint">已到达树根且无分支。</p>
                )}
              </div>
            ) : (
              <div
                className="lab-assoc-recall-grid lab-assoc-recall-grid--pick"
                data-count={childIds.length}
                style={pickGridStyle}
              >
                {childIds.map((id) => {
                  const c = cardById.get(id);
                  if (!c) return null;
                  const reviewed = visitedStarts.has(id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`lab-assoc-recall-thumb card-surface lab-assoc-recall-thumb--pick${reviewed ? ' is-reviewed' : ''}`}
                      onClick={() => pickChildAsNewStart(id)}
                      onKeyDown={(e) => handleKeyDownThumb(e, id)}
                      aria-label={reviewed ? `已复习的子卡片：${c.front?.slice(0, 40) ?? id}` : undefined}
                    >
                      <span className="lab-assoc-recall-thumb-label">
                        子卡片 · 正面
                        {reviewed && <span className="lab-assoc-recall-reviewed-badge">已复习</span>}
                      </span>
                      <div className="lab-assoc-recall-thumb-md lab-assoc-recall-thumb-md--markdown">
                        <CardRenderer content={c.front} compact />
                      </div>
                      <span className="lab-assoc-recall-thumb-hint">
                        {reviewed ? '已复习 · 点击再次进入' : '点击作为新起始并放大'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export function openAssocRecallWindow(
  deckId: string,
  rootId: string,
  children: Record<string, string[]>,
): Window | null {
  const k = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const payload: AssocRecallPayloadV2 = { v: 2, deckId, rootId, children };
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${k}`, JSON.stringify(payload));
  } catch {
    return null;
  }
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '';
  const path = `${base}/lab/assoc/recall?k=${encodeURIComponent(k)}`;
  return window.open(
    path,
    'flashcardAssocRecall',
    'width=720,height=860,scrollbars=yes,resizable=yes',
  );
}
