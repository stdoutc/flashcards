import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFlashcard } from '../context/FlashcardContext';
import type { ReviewLogEntry } from '../domain/models';

/* ── 工具函数 ─────────────────────────────────── */
function dayKey(ts: number): string {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function todayKey(): string {
  return dayKey(Date.now());
}

/** 连续学习天数（streak），允许今天尚未学习 */
function computeStreak(reviewLogs: ReviewLogEntry[]): number {
  if (!reviewLogs.length) return 0;
  const daySet = new Set(reviewLogs.map((l) => dayKey(l.reviewedAt)));
  const DAY = 24 * 60 * 60 * 1000;
  let cursor = Date.now();
  // 若今天还没学习，从昨天开始检查
  if (!daySet.has(dayKey(cursor))) cursor -= DAY;
  let streak = 0;
  while (daySet.has(dayKey(cursor))) {
    streak++;
    cursor -= DAY;
  }
  return streak;
}

function fmtDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/* ── 小型 KPI 卡片 ─────────────────────────────── */
const KpiCard: React.FC<{
  value: string | number;
  label: string;
  color?: string;
}> = ({ value, label, color }) => (
  <div className="stat-kpi-card">
    <span className="stat-kpi-value" style={color ? { color } : undefined}>
      {value}
    </span>
    <span className="stat-kpi-label">{label}</span>
  </div>
);

/* ── 横向进度条 ────────────────────────────────── */
const HBar: React.FC<{
  label: string;
  count: number;
  total: number;
  color: string;
}> = ({ label, count, total, color }) => {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="stat-hbar-row">
      <span className="stat-hbar-label">{label}</span>
      <div className="stat-hbar-track">
        <div
          className="stat-hbar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="stat-hbar-count">
        {count}
        <span className="stat-hbar-pct">（{Math.round(pct)}%）</span>
      </span>
    </div>
  );
};

/* ── 统计分区 ──────────────────────────────────── */
const StatSection: React.FC<{
  title: string;
  icon: string;
  children: React.ReactNode;
}> = ({ title, icon, children }) => (
  <section className="stat-section card-surface">
    <h3 className="stat-section-title">
      <span className="stat-section-icon">{icon}</span>
      {title}
    </h3>
    <div className="stat-section-body">{children}</div>
  </section>
);

/* ══════════════ 数据统计页主体 ══════════════ */
export const StatsPage: React.FC = () => {
  const { state } = useFlashcard();

  /* ── 综合 KPI ── */
  const kpi = useMemo(() => {
    const totalCards = state.cards.length;
    const masteredCards = state.cards.filter((c) => c.mastery >= 3).length;
    const masteryPct =
      totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;
    const streak = computeStreak(state.reviewLogs);
    return {
      totalDecks: state.decks.length,
      totalCards,
      totalReviews: state.stats.totalReviews,
      masteredCards,
      masteryPct,
      streak,
      lastStudy: state.stats.lastStudyAt,
    };
  }, [state]);

  /* ── 今日统计 ── */
  const today = useMemo(() => {
    const tk = todayKey();
    const todayLogs = state.reviewLogs.filter((l) => dayKey(l.reviewedAt) === tk);
    const todayCardIds = new Set(todayLogs.map((l) => l.cardId));
    const prevCardIds = new Set(
      state.reviewLogs
        .filter((l) => dayKey(l.reviewedAt) < tk)
        .map((l) => l.cardId),
    );
    // 今日首次接触的卡片数（新卡）
    let newCards = 0;
    todayCardIds.forEach((id) => {
      if (!prevCardIds.has(id)) newCards++;
    });
    // 今日触碰到的卡片中，当前掌握度 >= 3 的数量
    const masteredToday = state.cards.filter(
      (c) => todayCardIds.has(c.id) && c.mastery >= 3,
    ).length;
    return {
      count: todayLogs.length,
      newCards,
      masteredToday,
    };
  }, [state.reviewLogs, state.cards]);

  /* ── 最近 14 天日志量 ── */
  const dailyActivity = useMemo(() => {
    const days = 14;
    const result: { label: string; count: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      const end = d.getTime() + 24 * 60 * 60 * 1000;
      const start = d.getTime();
      const count = state.reviewLogs.filter(
        (l) => l.reviewedAt >= start && l.reviewedAt < end,
      ).length;
      result.push({ label: key.slice(5), count });
    }
    return result;
  }, [state.reviewLogs]);

  /* ── 掌握度分布 ── */
  const masteryDist = useMemo(() => {
    const dist = [0, 0, 0, 0, 0, 0];
    for (const card of state.cards) {
      const lvl = Math.min(5, Math.max(0, card.mastery));
      dist[lvl]++;
    }
    return dist;
  }, [state.cards]);

  const masteryLabels = ['未学习', '初学', '学习中', '熟练', '掌握', '精通'];
  const masteryColors = ['#6b7280', '#f59e0b', '#f97316', '#3b82f6', '#22c55e', '#0ea5e9'];

  /* ── 各卡组统计 ── */
  const deckStats = useMemo(() => {
    const now = Date.now();
    return state.decks.map((deck) => {
      const cards = state.cards.filter((c) => c.deckId === deck.id);
      const mastered = cards.filter((c) => c.mastery >= 3).length;
      const newCards = cards.filter((c) => c.lastReviewAt === null).length;
      const due = cards.filter(
        (c) => c.lastReviewAt !== null && (c.nextReview ?? 0) <= now,
      ).length;
      const reviewCount = state.reviewLogs.filter((l) => l.deckId === deck.id).length;
      const masteryPct =
        cards.length > 0 ? Math.round((mastered / cards.length) * 100) : 0;
      // 各掌握等级卡片数（Lv0~Lv5）
      const lvDist = [0, 0, 0, 0, 0, 0];
      cards.forEach((c) => lvDist[Math.min(5, Math.max(0, c.mastery))]++);
      return {
        deck,
        total: cards.length,
        mastered,
        masteryPct,
        newCards,
        due,
        reviewCount,
        lvDist,
      };
    });
  }, [state]);

  /* ── 折线图悬停节点 ── */
  const [hoveredDayIdx, setHoveredDayIdx] = useState<number | null>(null);

  /* ── 空数据提示 ── */
  const isEmpty = state.cards.length === 0 && state.reviewLogs.length === 0;

  return (
    <div className="stats-page">
      <div className="stats-page-header">
        <h2 className="stats-title">数据统计</h2>
        <p className="stats-subtitle">学习历史 · 掌握情况 · 卡组分析</p>
      </div>

      {isEmpty ? (
        <div className="stats-empty card-surface">
          <div className="stats-empty-icon">📊</div>
          <p className="stats-empty-text">暂无数据</p>
          <p className="stats-empty-sub">
            先去
            <Link to="/" className="stats-empty-link">
              首页
            </Link>
            创建卡组并开始学习，统计数据将在这里展示。
          </p>
        </div>
      ) : (
        <>
          {/* ── 综合概览 ── */}
          <StatSection title="综合概览" icon="📋">
            <div className="stat-kpi-grid">
              <KpiCard value={kpi.totalDecks} label="卡组数量" />
              <KpiCard value={kpi.totalCards} label="卡片总数" />
              <KpiCard value={kpi.masteredCards} label="已掌握" color="#22c55e" />
              <KpiCard value={kpi.totalReviews} label="累计学习" />
              <KpiCard
                value={kpi.totalCards > 0 ? `${kpi.masteryPct}%` : '—'}
                label="综合掌握率"
                color={kpi.masteryPct >= 80 ? '#22c55e' : kpi.masteryPct >= 50 ? '#f59e0b' : undefined}
              />
              <KpiCard
                value={kpi.streak}
                label="连续学习天"
                color={kpi.streak >= 7 ? '#f59e0b' : undefined}
              />
            </div>
            <div className="stat-last-study">
              最近学习：{fmtDate(kpi.lastStudy)}
            </div>
          </StatSection>

          {/* ── 今日统计 ── */}
          <StatSection title="今日" icon="☀️">
            <div className="stat-kpi-grid stat-kpi-grid-sm">
              <KpiCard value={today.count} label="今日学习" />
              <KpiCard value={today.newCards} label="今日新卡" color="#38bdf8" />
              <KpiCard value={today.masteredToday} label="今日已掌握" color="#22c55e" />
            </div>
          </StatSection>

          {/* ── 最近 14 天学习量 ── */}
          <StatSection title="最近 14 天学习量" icon="📅">
            {(() => {
              const niceStep = (raw: number): number => {
                if (raw <= 0) return 1;
                const exp = Math.floor(Math.log10(raw));
                const base = raw / Math.pow(10, exp);
                const niceBase = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
                return niceBase * Math.pow(10, exp);
              };

              const W = 560;
              const H = 150;
              const PAD_TOP = 12;
              const PAD_BOTTOM = 28;
              const PAD_LEFT = 36;
              const PAD_RIGHT = 8;
              const chartH = H - PAD_TOP - PAD_BOTTOM;
              const chartW = W - PAD_LEFT - PAD_RIGHT;
              const maxVal = Math.max(1, ...dailyActivity.map((d) => d.count));
              const targetSegments = 4;
              const step = niceStep(maxVal / targetSegments);
              const axisMax = Math.max(step * targetSegments, Math.ceil(maxVal / step) * step);
              const yTicks = Array.from({ length: targetSegments + 1 }, (_, i) => {
                const value = i * step;
                const ratio = value / axisMax;
                return {
                  value,
                  y: PAD_TOP + (1 - ratio) * chartH,
                };
              });
              const pts = dailyActivity.map((d, i) => ({
                x: PAD_LEFT + (i / (dailyActivity.length - 1)) * chartW,
                y: PAD_TOP + (1 - d.count / axisMax) * chartH,
                label: d.label.replace('-', '/'),
                count: d.count,
                idx: i,
              }));
              const linePoints = pts.map((p) => `${p.x},${p.y}`).join(' ');
              const fillD =
                `M ${pts[0].x},${PAD_TOP + chartH} ` +
                pts.map((p) => `L ${p.x},${p.y}`).join(' ') +
                ` L ${pts[pts.length - 1].x},${PAD_TOP + chartH} Z`;

              // 悬停点的 tooltip 数据
              const hovPt = hoveredDayIdx !== null ? pts[hoveredDayIdx] : null;
              // tooltip 框宽高
              const TW = 72; const TH = 30;
              // tooltip 框左上角坐标，防止超出右侧/顶部/左侧
              const tx = Math.max(PAD_LEFT, Math.min(hovPt ? hovPt.x - TW / 2 : 0, W - TW));
              const ty = hovPt ? Math.max(0, hovPt.y - TH - 10) : 0;

              return (
                <svg
                  className="stat-line-chart"
                  viewBox={`0 0 ${W} ${H}`}
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Y 轴网格线与刻度 */}
                  {yTicks.map((t, i) => (
                    <g key={`y-tick-${i}`}>
                      <line
                        x1={PAD_LEFT}
                        y1={t.y}
                        x2={W - PAD_RIGHT}
                        y2={t.y}
                        stroke="rgba(148,163,184,0.16)"
                        strokeWidth={1}
                      />
                      <text
                        x={PAD_LEFT - 6}
                        y={t.y + 4}
                        textAnchor="end"
                        fontSize={10}
                        fill="rgba(148,163,184,0.85)"
                      >
                        {t.value}
                      </text>
                    </g>
                  ))}

                  {/* 坐标轴 */}
                  <line
                    x1={PAD_LEFT}
                    y1={PAD_TOP}
                    x2={PAD_LEFT}
                    y2={PAD_TOP + chartH}
                    stroke="rgba(148,163,184,0.3)"
                    strokeWidth={1}
                  />
                  <line
                    x1={PAD_LEFT}
                    y1={PAD_TOP + chartH}
                    x2={W - PAD_RIGHT}
                    y2={PAD_TOP + chartH}
                    stroke="rgba(148,163,184,0.3)"
                    strokeWidth={1}
                  />

                  {/* 填充区域 */}
                  <path d={fillD} fill="url(#lineGrad)" />

                  {/* 折线 */}
                  <polyline
                    points={linePoints}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {/* 数据点 + 日期标签 */}
                  {pts.map((p) => {
                    const isHovered = hoveredDayIdx === p.idx;
                    return (
                      <g
                        key={p.label}
                        className="stat-line-node"
                        onMouseEnter={() => setHoveredDayIdx(p.idx)}
                        onMouseLeave={() => setHoveredDayIdx(null)}
                      >
                        {/* 扩大悬停区域的透明圆 */}
                        <circle cx={p.x} cy={p.y} r={10} fill="transparent" />

                        {/* 悬停时的外圈光晕 */}
                        {isHovered && (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r={8}
                            fill="var(--accent)"
                            fillOpacity={0.15}
                            stroke="var(--accent)"
                            strokeWidth={1.5}
                            strokeOpacity={0.4}
                          />
                        )}

                        {/* 数据点主圆 */}
                        <circle
                          className="stat-line-dot"
                          cx={p.x}
                          cy={p.y}
                          r={isHovered ? 5 : 3.5}
                          opacity={1}
                          stroke={isHovered ? '#fff' : 'none'}
                          strokeWidth={isHovered ? 1.5 : 0}
                        />

                        {/* 日期标签：悬停时高亮 */}
                        <text
                          className="stat-line-date"
                          x={p.x}
                          y={H - 4}
                          textAnchor="middle"
                          fontWeight={isHovered ? 'bold' : 'normal'}
                          fill={isHovered ? 'var(--accent)' : undefined}
                        >
                          {p.label}
                        </text>
                      </g>
                    );
                  })}

                  {/* 悬停节点的 tooltip */}
                  {hovPt && (
                    <g className="stat-line-tooltip" pointerEvents="none">
                      <rect
                        x={tx}
                        y={ty}
                        width={TW}
                        height={TH}
                        rx={5}
                        ry={5}
                        fill="rgba(15,23,42,0.88)"
                        stroke="rgba(148,163,184,0.3)"
                        strokeWidth={1}
                      />
                      {/* 小三角箭头 */}
                      <path
                        d={`M ${Math.max(tx + 6, Math.min(hovPt.x - 5, tx + TW - 6))},${ty + TH} L ${Math.max(tx + 6, Math.min(hovPt.x, tx + TW - 6))},${ty + TH + 6} L ${Math.max(tx + 6, Math.min(hovPt.x + 5, tx + TW - 6))},${ty + TH}`}
                        fill="rgba(15,23,42,0.88)"
                        stroke="rgba(148,163,184,0.3)"
                        strokeWidth={1}
                      />
                      <text
                        x={tx + TW / 2}
                        y={ty + 12}
                        textAnchor="middle"
                        fontSize={10}
                        fill="rgba(148,163,184,0.9)"
                        fontFamily="system-ui,sans-serif"
                      >
                        {hovPt.label}
                      </text>
                      <text
                        x={tx + TW / 2}
                        y={ty + 24}
                        textAnchor="middle"
                        fontSize={12}
                        fill="#f1f5f9"
                        fontFamily="system-ui,sans-serif"
                        fontWeight="bold"
                      >
                        学习次数 {hovPt.count}
                      </text>
                    </g>
                  )}
                </svg>
              );
            })()}
          </StatSection>

          {/* ── 掌握度分布 ── */}
          {kpi.totalCards > 0 && (
            <StatSection title="掌握度分布" icon="🧠">
              <div className="stat-dist-list">
                {masteryDist.map((count, lvl) => (
                  <HBar
                    key={lvl}
                    label={`${masteryLabels[lvl]}（Lv${lvl}）`}
                    count={count}
                    total={kpi.totalCards}
                    color={masteryColors[lvl]}
                  />
                ))}
              </div>
            </StatSection>
          )}

          {/* ── 各卡组明细 ── */}
          {deckStats.length > 0 && (
            <StatSection title="各卡组明细" icon="🗂️">
              <div className="stat-deck-list">
                {deckStats.map(
                  ({ deck, total, mastered, masteryPct, newCards, due, reviewCount, lvDist }) => (
                    <div key={deck.id} className="stat-deck-row">
                      <div className="stat-deck-name-row">
                        <span className="stat-deck-name">{deck.name}</span>
                        {total > 0 && (
                          <span
                            className="stat-deck-mastery-badge"
                            style={{
                              color: masteryPct >= 80 ? '#22c55e' : masteryPct >= 50 ? '#f59e0b' : '#94a3b8',
                            }}
                          >
                            掌握率 {masteryPct}%
                          </span>
                        )}
                      </div>
                      <div className="stat-deck-meta">
                        <span className="stat-deck-chip stat-deck-chip-total">
                          共 {total} 张
                        </span>
                        <span className="stat-deck-chip stat-deck-chip-new">
                          未学 {newCards}
                        </span>
                        <span className="stat-deck-chip stat-deck-chip-due">
                          待复 {due}
                        </span>
                        <span className="stat-deck-chip stat-deck-chip-mastered">
                          已掌握 {mastered}
                        </span>
                        {reviewCount > 0 && (
                          <span className="stat-deck-chip stat-deck-chip-acc">
                            学习次数 {reviewCount}
                          </span>
                        )}
                      </div>
                      {/* 掌握度分段条：Lv5（精通）在左 → Lv0（未学习）在右 */}
                      {total > 0 && (
                        <div className="stat-deck-lv-bar" title={`掌握率 ${masteryPct}%`}>
                          {[5, 4, 3, 2, 1, 0].map((lvl) =>
                            lvDist[lvl] > 0 ? (
                              <div
                                key={lvl}
                                className="stat-deck-lv-seg"
                                style={{
                                  width: `${(lvDist[lvl] / total) * 100}%`,
                                  background: masteryColors[lvl],
                                }}
                                title={`${masteryLabels[lvl]}：${lvDist[lvl]} 张`}
                              />
                            ) : null,
                          )}
                        </div>
                      )}
                      <div className="stat-deck-actions">
                        <Link
                          to={`/deck/${deck.id}/study`}
                          className="button button-sm button-primary"
                        >
                          学习
                        </Link>
                        <Link
                          to={`/deck/${deck.id}/cards`}
                          className="button button-sm"
                        >
                          管理
                        </Link>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </StatSection>
          )}
        </>
      )}
    </div>
  );
};
