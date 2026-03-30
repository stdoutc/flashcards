import React, { useState } from 'react';
import { useFlashcard } from '../context/FlashcardContext';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const DebugPanel: React.FC = () => {
  const {
    state,
    selectedDeckId,
    mockOffset,
    setMockOffset,
    getNow,
    debugClearTodayLogs,
    debugResetDeckCards,
    debugAddSampleDeck,
  } = useFlashcard();

  const [open, setOpen] = useState(false);
  const [customDays, setCustomDays] = useState('1');
  const [customMinutes, setCustomMinutes] = useState('30');
  const [jumpDate, setJumpDate] = useState('');
  const [showRaw, setShowRaw] = useState(false);
  const [opMsg, setOpMsg] = useState<string | null>(null);

  const now = getNow();
  const isTimeMocked = mockOffset !== 0;

  function flash(msg: string) {
    setOpMsg(msg);
    setTimeout(() => setOpMsg(null), 2500);
  }

  function shiftDays(days: number) {
    setMockOffset(mockOffset + days * DAY);
    flash(`时间已${days > 0 ? '前进' : '后退'} ${Math.abs(days)} 天`);
  }

  function shiftMinutes(minutes: number) {
    setMockOffset(mockOffset + minutes * MINUTE);
    flash(`时间已${minutes > 0 ? '前进' : '后退'} ${Math.abs(minutes)} 分钟`);
  }

  function handleCustomShift() {
    const d = parseFloat(customDays);
    if (isNaN(d)) return;
    setMockOffset(mockOffset + d * DAY);
    flash(`时间已偏移 ${d} 天`);
  }

  function handleCustomMinuteShift() {
    const minutes = parseFloat(customMinutes);
    if (isNaN(minutes) || minutes === 0) return;
    setMockOffset(mockOffset + minutes * MINUTE);
    flash(`时间已偏移 ${minutes} 分钟`);
  }

  function handleJumpDate() {
    if (!jumpDate) return;
    const target = new Date(jumpDate).getTime();
    if (isNaN(target)) return;
    setMockOffset(target - Date.now());
    flash(`已跳转至 ${jumpDate}`);
    setJumpDate('');
  }

  function handleResetTime() {
    setMockOffset(0);
    flash('时间已重置为实际时间');
  }

  function handleClearToday() {
    debugClearTodayLogs();
    flash('今日复习记录已清空');
  }

  function handleResetDeck() {
    if (!selectedDeckId) return;
    const deck = state.decks.find((d) => d.id === selectedDeckId);
    if (!window.confirm(`确认重置「${deck?.name ?? selectedDeckId}」内所有卡片的调度数据？`)) return;
    debugResetDeckCards(selectedDeckId);
    flash('选中卡组已重置为全新状态');
  }

  function handleAddSample() {
    debugAddSampleDeck();
    flash('示例卡组已添加');
  }

  const selectedDeck = state.decks.find((d) => d.id === selectedDeckId);
  const selectedCards = state.cards.filter((c) => c.deckId === selectedDeckId);
  const newCount = selectedCards.filter((c) => c.lastReviewAt === null).length;
  const dueCount = selectedCards.filter(
    (c) => c.lastReviewAt !== null && (c.nextReview ?? 0) <= now,
  ).length;

  return (
    <>
      {/* 悬浮触发按钮 */}
      <button
        className={`dbg-toggle-btn ${open ? 'dbg-toggle-btn--open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="开发者调试面板"
      >
        🐛
        {isTimeMocked && <span className="dbg-time-badge">⏱</span>}
      </button>

      {open && (
        <div className="dbg-panel">
          <div className="dbg-panel-header">
            <span className="dbg-panel-title">🐛 开发者调试面板</span>
            <button className="dbg-close-btn" onClick={() => setOpen(false)}>✕</button>
          </div>

          {opMsg && <div className="dbg-op-msg">{opMsg}</div>}

          {/* ── 时间控制 ── */}
          <section className="dbg-section">
            <h4 className="dbg-section-title">⏰ 时间控制</h4>
            <div className="dbg-time-display">
              <div className="dbg-time-row">
                <span className="dbg-time-label">实际时间</span>
                <span className="dbg-time-val">{fmtTs(Date.now())}</span>
              </div>
              <div className={`dbg-time-row ${isTimeMocked ? 'dbg-time-mocked' : ''}`}>
                <span className="dbg-time-label">模拟时间</span>
                <span className="dbg-time-val">{fmtTs(now)}</span>
              </div>
              {isTimeMocked && (
                <div className="dbg-time-offset">
                  偏移：{mockOffset > 0 ? '+' : ''}
                  {(mockOffset / DAY).toFixed(2)} 天
                </div>
              )}
            </div>

            <div className="dbg-btn-row">
              <button className="dbg-btn dbg-btn-sm" onClick={() => shiftDays(-1)}>−1天</button>
              <button className="dbg-btn dbg-btn-primary" onClick={() => shiftDays(1)}>+1天</button>
              <button className="dbg-btn dbg-btn-primary" onClick={() => shiftDays(3)}>+3天</button>
              <button className="dbg-btn dbg-btn-primary" onClick={() => shiftDays(7)}>+7天</button>
              <button className="dbg-btn dbg-btn-primary" onClick={() => shiftDays(30)}>+30天</button>
            </div>

            <div className="dbg-btn-row">
              <button className="dbg-btn dbg-btn-sm" onClick={() => shiftMinutes(-10)}>−10分</button>
              <button className="dbg-btn dbg-btn-primary" onClick={() => shiftMinutes(10)}>+10分</button>
              <button className="dbg-btn dbg-btn-primary" onClick={() => shiftMinutes(30)}>+30分</button>
              <button className="dbg-btn dbg-btn-primary" onClick={() => shiftMinutes(60)}>+60分</button>
            </div>

            <div className="dbg-input-row">
              <label className="dbg-label">自定义天数</label>
              <input
                type="number"
                className="dbg-input"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                step="0.5"
              />
              <button className="dbg-btn dbg-btn-primary" onClick={handleCustomShift}>
                前进
              </button>
            </div>

            <div className="dbg-input-row">
              <label className="dbg-label">自定义分钟</label>
              <input
                type="number"
                className="dbg-input"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value)}
                step="1"
              />
              <button className="dbg-btn dbg-btn-primary" onClick={handleCustomMinuteShift}>
                跳跃
              </button>
            </div>

            <div className="dbg-input-row">
              <label className="dbg-label">跳转到日期</label>
              <input
                type="date"
                className="dbg-input"
                value={jumpDate}
                onChange={(e) => setJumpDate(e.target.value)}
              />
              <button
                className="dbg-btn dbg-btn-primary"
                onClick={handleJumpDate}
                disabled={!jumpDate}
              >
                跳转
              </button>
            </div>

            {isTimeMocked && (
              <button className="dbg-btn dbg-btn-danger dbg-full-btn" onClick={handleResetTime}>
                重置为实际时间
              </button>
            )}
          </section>

          {/* ── 数据操作 ── */}
          <section className="dbg-section">
            <h4 className="dbg-section-title">🗄️ 数据操作</h4>

            <div className="dbg-info-row">
              <span>选中卡组：</span>
              <strong>{selectedDeck?.name ?? '（未选择）'}</strong>
            </div>
            {selectedDeck && (
              <div className="dbg-chips">
                <span className="dbg-chip">共 {selectedCards.length} 张</span>
                <span className="dbg-chip dbg-chip-blue">新 {newCount}</span>
                <span className="dbg-chip dbg-chip-amber">待复 {dueCount}</span>
              </div>
            )}

            <div className="dbg-btn-col">
              <button
                className="dbg-btn dbg-full-btn"
                onClick={handleClearToday}
                disabled={!selectedDeckId}
                title="删除模拟「今天」的全部复习日志，以便重新测试每日上限"
              >
                🗑️ 清空今日复习记录
              </button>
              <button
                className="dbg-btn dbg-full-btn dbg-btn-danger"
                onClick={handleResetDeck}
                disabled={!selectedDeckId}
                title="将选中卡组的所有卡片重置为从未学习状态"
              >
                🔄 重置选中卡组调度
              </button>
              <button
                className="dbg-btn dbg-full-btn dbg-btn-green"
                onClick={handleAddSample}
                title="添加一个包含多种题型的示例卡组"
              >
                ✨ 添加示例卡组
              </button>
            </div>
          </section>

          {/* ── 状态检查 ── */}
          <section className="dbg-section">
            <h4 className="dbg-section-title">
              🔍 状态检查
              <button
                className="dbg-btn dbg-btn-sm dbg-toggle-raw"
                onClick={() => setShowRaw((v) => !v)}
              >
                {showRaw ? '收起' : '展开 JSON'}
              </button>
            </h4>
            <div className="dbg-stat-grid">
              <span>卡组</span><strong>{state.decks.length}</strong>
              <span>卡片</span><strong>{state.cards.length}</strong>
              <span>日志</span><strong>{state.reviewLogs.length}</strong>
              <span>总复习</span><strong>{state.stats.totalReviews}</strong>
            </div>
            {showRaw && (
              <pre className="dbg-raw">
                {JSON.stringify({ decks: state.decks.length, cards: state.cards.length, recentLogs: state.reviewLogs.slice(-5) }, null, 2)}
              </pre>
            )}
          </section>
        </div>
      )}
    </>
  );
};
