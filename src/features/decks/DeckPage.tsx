import React, { useMemo, useState } from 'react';
import type { Card } from '../../domain/models';
import { useFlashcardApp } from './useFlashcardApp';

interface CardDraft {
  id?: string;
  front: string;
  back: string;
  tagsText: string;
}

export const DeckPage: React.FC = () => {
  const {
    state,
    selectedDeckId,
    currentStudyCard,
    selectDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    createCard,
    updateCard,
    deleteCard,
    reviewCurrentCard,
    exportDeckJson,
    importDeckJson,
  } = useFlashcardApp();

  const [newDeckName, setNewDeckName] = useState('');
  const [deckFilter, setDeckFilter] = useState('');
  const [cardDraft, setCardDraft] = useState<CardDraft>({
    front: '',
    back: '',
    tagsText: '',
  });
  const [jsonText, setJsonText] = useState('');

  const selectedDeck = useMemo(
    () => state.decks.find((d) => d.id === selectedDeckId) ?? null,
    [state.decks, selectedDeckId],
  );

  const visibleDecks = useMemo(
    () =>
      state.decks.filter((d) =>
        deckFilter.trim()
          ? (d.name + (d.tags ?? []).join(' ')).toLowerCase().includes(deckFilter.toLowerCase())
          : true,
      ),
    [state.decks, deckFilter],
  );

  const cardsOfSelectedDeck = useMemo(
    () => state.cards.filter((c) => c.deckId === selectedDeckId),
    [state.cards, selectedDeckId],
  );

  const masteredCount = cardsOfSelectedDeck.filter((c) => c.mastery >= 3).length;
  const newCount = cardsOfSelectedDeck.filter((c) => (c.mastery ?? 0) === 0).length;

  const handleCreateDeck = () => {
    const name = newDeckName.trim();
    if (!name) return;
    createDeck(name);
    setNewDeckName('');
  };

  const handleDeckRename = () => {
    if (!selectedDeck) return;
    const name = window.prompt('请输入新的卡组名称：', selectedDeck.name);
    if (!name) return;
    updateDeck(selectedDeck.id, { name: name.trim() });
  };

  const handleDeckDelete = () => {
    if (!selectedDeck) return;
    if (!window.confirm(`确定删除卡组「${selectedDeck.name}」及其所有卡片吗？`)) return;
    deleteDeck(selectedDeck.id);
  };

  const handleCardSubmit = () => {
    if (!selectedDeckId) return;
    const front = cardDraft.front.trim();
    const back = cardDraft.back.trim();
    if (!front || !back) return;

    const tags = cardDraft.tagsText
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (cardDraft.id) {
      updateCard(cardDraft.id, { front, back, tags });
    } else {
      const now = Date.now();
      const base: Omit<Card, 'id' | 'createdAt' | 'updatedAt'> = {
        deckId: selectedDeckId,
        cardType: 'basic',
        front,
        back,
        tags,
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      };
      createCard(selectedDeckId, base);
    }

    setCardDraft({ front: '', back: '', tagsText: '' });
  };

  const handleEditCard = (card: Card) => {
    setCardDraft({
      id: card.id,
      front: card.front,
      back: card.back,
      tagsText: (card.tags ?? []).join(', '),
    });
  };

  const handleDeleteCard = (card: Card) => {
    if (!window.confirm(`确定删除该卡片？\n\n${card.front}`)) return;
    deleteCard(card.id);
  };

  const handleExport = () => {
    if (!selectedDeckId) return;
    const json = exportDeckJson(selectedDeckId);
    if (!json) return;
    setJsonText(json);
  };

  const handleImport = () => {
    if (!jsonText.trim()) return;
    importDeckJson(jsonText);
    setJsonText('');
  };

  const accuracy =
    state.stats.totalReviews > 0
      ? Math.round((state.stats.correctReviews / state.stats.totalReviews) * 100)
      : 0;

  return (
    <div className="layout-split">
      <section className="card-surface">
        <div className="section-header">
          <span className="section-header-title">卡组管理</span>
        </div>

        <div className="field">
          <label className="label">新建卡组</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="例如：考研英语、线性代数、算法面试题……"
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
            />
            <button
              type="button"
              className="button button-primary"
              onClick={handleCreateDeck}
              disabled={!newDeckName.trim()}
            >
              新建
            </button>
          </div>
          <p className="hint small">面向多场景：语言词汇、理科公式、考试考点、编程知识点等。</p>
        </div>

        <div className="field">
          <label className="label">筛选卡组</label>
          <input
            className="input"
            placeholder="按名称或标签过滤"
            value={deckFilter}
            onChange={(e) => setDeckFilter(e.target.value)}
          />
        </div>

        <div className="deck-list">
          {visibleDecks.map((deck) => (
            <div
              key={deck.id}
              className={`deck-item ${deck.id === selectedDeckId ? 'selected' : ''}`}
              onClick={() => selectDeck(deck.id)}
            >
              <div className="deck-item-main">
                <span className="deck-name">{deck.name}</span>
                <span className="deck-meta">
                  {state.cards.filter((c) => c.deckId === deck.id).length} 张卡片
                </span>
              </div>
              <div className="deck-item-actions">
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectDeck(deck.id);
                    handleDeckRename();
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectDeck(deck.id);
                    handleDeckDelete();
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
          {visibleDecks.length === 0 && (
            <p className="hint">暂无卡组，请先在上方新建一个卡组开始。</p>
          )}
        </div>

        <hr className="divider" />

        <div>
          <div className="section-header">
            <span className="section-header-title">导入 / 导出</span>
          </div>
          <div className="import-export">
            <button
              type="button"
              className="button button-ghost"
              disabled={!selectedDeckId}
              onClick={handleExport}
            >
              导出当前卡组 (JSON)
            </button>
            <button
              type="button"
              className="button"
              disabled={!jsonText.trim()}
              onClick={handleImport}
            >
              从 JSON 导入卡组
            </button>
          </div>
          <p className="hint small">
            JSON 结构适配未来 XML / AI 批量转化，可复制到外部工具处理后再导入。
          </p>
          <textarea
            className="textarea"
            placeholder="这里会显示导出的 JSON；也可以粘贴外部 JSON 后点击导入。"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
        </div>
      </section>

      <section className="card-surface">
        <div className="layout-stack">
          <div>
            <div className="section-header">
              <span className="section-header-title">卡片编辑</span>
              <div className="toolbar">
                <span className="pill-muted">
                  {cardDraft.id ? '编辑现有卡片' : '新建卡片'}
                </span>
                <div className="toolbar-spacer" />
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => setCardDraft({ front: '', back: '', tagsText: '' })}
                >
                  清空
                </button>
              </div>
            </div>

            {selectedDeck ? (
              <>
                <div className="field">
                  <label className="label">正面：单词 / 问题 / 提示</label>
                  <textarea
                    className="textarea"
                    value={cardDraft.front}
                    onChange={(e) => setCardDraft((d) => ({ ...d, front: e.target.value }))}
                    placeholder="例如：快速排序的时间复杂度？"
                  />
                </div>
                <div className="field">
                  <label className="label">反面：解释 / 答案</label>
                  <textarea
                    className="textarea"
                    value={cardDraft.back}
                    onChange={(e) => setCardDraft((d) => ({ ...d, back: e.target.value }))}
                    placeholder="平均时间复杂度 O(n log n)，最坏 O(n^2)。"
                  />
                  <p className="hint small">
                    未来可扩展为 Markdown / HTML 编辑，插入公式、代码、多媒体等。
                  </p>
                </div>
                <div className="field">
                  <label className="label">标签（逗号分隔）</label>
                  <input
                    className="input"
                    value={cardDraft.tagsText}
                    onChange={(e) =>
                      setCardDraft((d) => ({
                        ...d,
                        tagsText: e.target.value,
                      }))
                    }
                    placeholder="如：算法, 排序, 重要"
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={handleCardSubmit}
                    disabled={!cardDraft.front.trim() || !cardDraft.back.trim()}
                  >
                    {cardDraft.id ? '保存修改' : '添加卡片'}
                  </button>
                </div>
              </>
            ) : (
              <p className="hint">请先在左侧新建并选择一个卡组，再添加卡片。</p>
            )}
          </div>

          <div>
            <div className="section-header">
              <span className="section-header-title">卡片列表</span>
              <span className="pill">
                {cardsOfSelectedDeck.length} 张 · 新 {newCount} · 掌握 {masteredCount}
              </span>
            </div>
            <div className="card-list">
              {cardsOfSelectedDeck.map((card) => (
                <div key={card.id} className="card-row">
                  <div className="card-row-main" onClick={() => handleEditCard(card)}>
                    <div className="card-front">{card.front}</div>
                    <div className="card-back">{card.back}</div>
                  </div>
                  <div className="card-row-actions">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={() => handleEditCard(card)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={() => handleDeleteCard(card)}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
              {cardsOfSelectedDeck.length === 0 && (
                <p className="hint">当前卡组暂无卡片，请在上方先添加几张。</p>
              )}
            </div>
          </div>

          <div>
            <div className="section-header">
              <span className="section-header-title">学习 / 复习</span>
            </div>
            {currentStudyCard && selectedDeck ? (
              <div className="study-card">
                <div>
                  <div className="study-front">{currentStudyCard.front}</div>
                  <div className="study-back">{currentStudyCard.back}</div>
                </div>
                <div className="study-actions">
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => reviewCurrentCard('again')}
                  >
                    再来一次
                  </button>
                  <button
                    type="button"
                    className="button"
                    onClick={() => reviewCurrentCard('hard')}
                  >
                    较难
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => reviewCurrentCard('good')}
                  >
                    记得住
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => reviewCurrentCard('easy')}
                  >
                    很简单
                  </button>
                </div>
                <p className="hint small">
                  基于间隔重复思想的简单调度：会根据你的反馈调整下次出现时间。
                </p>
              </div>
            ) : (
              <p className="hint">
                暂无可学习的卡片，请确认已选择卡组且卡组中有卡片。系统会根据到期时间自动安排下一张。
              </p>
            )}

            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">累计学习次数</div>
                <div className="stat-value">{state.stats.totalReviews}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">正确率</div>
                <div className="stat-value">{accuracy}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">已掌握卡片</div>
                <div className="stat-value">
                  {masteredCount}/{cardsOfSelectedDeck.length || 0}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

