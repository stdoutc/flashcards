import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Link } from 'react-router-dom';
import { useFlashcard } from '../context/FlashcardContext';
import { Modal } from '../components/Modal';

type ModalKind = 'create' | 'import' | 'export' | null;

export const HomePage: React.FC = () => {
  const {
    state,
    selectedDeckId,
    selectDeck,
    createDeck,
    updateDeck,
    deleteDeck,
    exportDeckJson,
    importDeckJson,
  } = useFlashcard();

  const [deckFilter, setDeckFilter] = useState('');
  const [modal, setModal] = useState<ModalKind>(null);

  // 新建卡组
  const [newDeckName, setNewDeckName] = useState('');
  const newDeckInputRef = useRef<HTMLInputElement>(null);

  // 导入卡组
  const [importJson, setImportJson] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  // 导出卡组
  const [exportJson, setExportJson] = useState('');
  const [exportDeckName, setExportDeckName] = useState('');
  const [copyMsg, setCopyMsg] = useState('');

  const closeModal = () => setModal(null);

  // 打开「新建」时自动聚焦
  useEffect(() => {
    if (modal === 'create') {
      setTimeout(() => newDeckInputRef.current?.focus(), 50);
    }
  }, [modal]);

  const visibleDecks = useMemo(
    () =>
      state.decks.filter((d) =>
        deckFilter.trim()
          ? (d.name + (d.tags ?? []).join(' ')).toLowerCase().includes(deckFilter.toLowerCase())
          : true,
      ),
    [state.decks, deckFilter],
  );

  const deckStats = useMemo(() => {
    const now = Date.now();
    const map: Record<string, { total: number; due: number; newCount: number }> = {};
    for (const deck of state.decks) {
      const cards = state.cards.filter((c) => c.deckId === deck.id);
      const due = cards.filter(
        (c) => c.lastReviewAt !== null && (c.nextReview ?? 0) <= now,
      ).length;
      const newCount = cards.filter((c) => c.lastReviewAt === null).length;
      map[deck.id] = { total: cards.length, due, newCount };
    }
    return map;
  }, [state.decks, state.cards]);

  // ── 新建卡组 ──
  const handleCreateDeck = () => {
    const name = newDeckName.trim();
    if (!name) return;
    createDeck(name);
    setNewDeckName('');
    closeModal();
  };

  // ── 重命名 ──
  const handleDeckRename = (deckId: string) => {
    const deck = state.decks.find((d) => d.id === deckId);
    if (!deck) return;
    const name = window.prompt('请输入新的卡组名称：', deck.name);
    if (!name) return;
    updateDeck(deckId, { name: name.trim() });
  };

  // ── 删除 ──
  const handleDeckDelete = (deckId: string) => {
    const deck = state.decks.find((d) => d.id === deckId);
    if (!deck) return;
    if (!window.confirm(`确定删除卡组「${deck.name}」及其所有卡片吗？`)) return;
    deleteDeck(deckId);
  };

  // ── 导出（独立模态框） ──
  const handleOpenExport = (deckId: string) => {
    const json = exportDeckJson(deckId);
    if (!json) return;
    const deck = state.decks.find((d) => d.id === deckId);
    setExportJson(json);
    setExportDeckName(deck?.name ?? '');
    setCopyMsg('');
    setModal('export');
  };

  const handleCopyToClipboard = () => {
    if (!exportJson) return;
    navigator.clipboard
      .writeText(exportJson)
      .then(() => {
        setCopyMsg('已复制到剪贴板！');
        setTimeout(() => setCopyMsg(''), 2500);
      })
      .catch(() => {
        setCopyMsg('复制失败，请手动选中文本复制。');
        setTimeout(() => setCopyMsg(''), 3000);
      });
  };

  const handleDownloadJson = () => {
    if (!exportJson) return;
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportDeckName || 'deck'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── 导入（独立模态框） ──
  const handleImport = () => {
    const text = importJson.trim();
    if (!text) return;
    importDeckJson(text);
    setImportJson('');
    setImportFileName('');
    closeModal();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportJson((ev.target?.result as string) ?? '');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="home-page">

      {/* ── 顶部栏 ── */}
      <div className="home-header">
        <div className="home-header-left">
          <h2 className="home-title">我的卡组</h2>
          <span className="home-deck-count">{state.decks.length} 个卡组</span>
        </div>
        <div className="home-header-right">
          <input
            className="input home-search"
            placeholder="搜索卡组…"
            value={deckFilter}
            onChange={(e) => setDeckFilter(e.target.value)}
          />
          <button
            type="button"
            className="button button-primary"
            onClick={() => setModal('create')}
          >
            ＋ 新建卡组
          </button>
          <button
            type="button"
            className="button"
            onClick={() => { setImportJson(''); setModal('import'); }}
          >
            ↓ 导入卡组
          </button>
        </div>
      </div>

      {/* ── 卡组网格 ── */}
      <div className="deck-grid">
        {visibleDecks.map((deck) => {
          const st = deckStats[deck.id] ?? { total: 0, due: 0, newCount: 0 };
          return (
            <div
              key={deck.id}
              className={`deck-card ${deck.id === selectedDeckId ? 'deck-card-selected' : ''}`}
              onClick={() => selectDeck(deck.id)}
            >
              <div className="deck-card-body">
                <div className="deck-card-name">{deck.name}</div>
                <div className="deck-card-chips">
                  <span className="deck-chip deck-chip-total">{st.total} 张</span>
                  {st.newCount > 0 && (
                    <span className="deck-chip deck-chip-new">新 {st.newCount}</span>
                  )}
                  {st.due > 0 && (
                    <span className="deck-chip deck-chip-due">待复习 {st.due}</span>
                  )}
                </div>
              </div>

              <div className="deck-card-actions" onClick={(e) => e.stopPropagation()}>
                <Link
                  to={`/deck/${deck.id}/study`}
                  className="button button-primary deck-card-cta"
                >
                  开始复习
                </Link>
                <Link to={`/deck/${deck.id}/cards`} className="button button-ghost">
                  管理卡片
                </Link>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => handleDeckRename(deck.id)}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => handleOpenExport(deck.id)}
                >
                  导出
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => handleDeckDelete(deck.id)}
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}

        {visibleDecks.length === 0 && (
          <div className="deck-empty">
            {deckFilter
              ? `没有匹配「${deckFilter}」的卡组。`
              : '还没有卡组，点击右上角「＋ 新建卡组」开始吧！'}
          </div>
        )}
      </div>

      {/* ── 模态框：新建卡组 ── */}
      <Modal open={modal === 'create'} title="新建卡组" onClose={closeModal}>
        <div className="field">
          <label className="label" htmlFor="modal-deck-name">卡组名称</label>
          <input
            id="modal-deck-name"
            ref={newDeckInputRef}
            className="input"
            placeholder="如：考研英语、线性代数、算法面试题……"
            value={newDeckName}
            onChange={(e) => setNewDeckName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateDeck()}
          />
          <p className="hint small" style={{ marginTop: 5 }}>
            支持语言词汇、理科公式、考试考点、编程知识点等多场景。
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-ghost" onClick={closeModal}>
            关闭
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={handleCreateDeck}
            disabled={!newDeckName.trim()}
          >
            创建
          </button>
        </div>
      </Modal>

      {/* ── 模态框：导出卡组 ── */}
      <Modal
        open={modal === 'export'}
        title={`导出卡组${exportDeckName ? `：${exportDeckName}` : ''}`}
        onClose={closeModal}
      >
        <div className="field">
          <div className="export-modal-toolbar">
            <span className="label" style={{ margin: 0 }}>JSON 内容</span>
            <div className="export-modal-actions">
              {copyMsg && <span className="export-copy-msg">{copyMsg}</span>}
              <button
                type="button"
                className="button button-primary"
                onClick={handleCopyToClipboard}
              >
                复制到剪贴板
              </button>
              <button
                type="button"
                className="button button-ghost"
                onClick={handleDownloadJson}
              >
                下载 .json
              </button>
            </div>
          </div>
          <textarea
            className="textarea export-json-textarea"
            readOnly
            value={exportJson}
          />
          <p className="hint small" style={{ marginTop: 5 }}>
            可将此 JSON 分享给他人，或粘贴到「导入卡组」中恢复；也支持通过 AI 批量编辑后再导回。
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-ghost" onClick={closeModal}>
            关闭
          </button>
        </div>
      </Modal>

      {/* ── 模态框：导入卡组 ── */}
      <Modal open={modal === 'import'} title="导入卡组（JSON）" onClose={closeModal}>
        {/* 文件上传区 */}
        <div className="import-file-zone" onClick={() => importFileRef.current?.click()}>
          <span className="import-file-icon">📂</span>
          <span className="import-file-text">
            {importFileName ? importFileName : '点击选择 .json 文件，或将文件拖到此处'}
          </span>
          <button type="button" className="button button-ghost import-file-btn">
            选择文件
          </button>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>

        <div className="import-divider">
          <span>或粘贴 JSON 内容</span>
        </div>

        <div className="field">
          <textarea
            id="modal-import-json"
            className="textarea"
            style={{ minHeight: 130 }}
            placeholder={"将 JSON 粘贴到此处，然后点击「导入」。\n可从「导出卡组」对话框或外部工具获取 JSON。"}
            value={importJson}
            onChange={(e) => { setImportJson(e.target.value); setImportFileName(''); }}
          />
          <p className="hint small" style={{ marginTop: 5 }}>
            导入后将作为新卡组添加，不影响现有数据。
          </p>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button button-ghost"
            disabled={!importJson.trim()}
            onClick={() => { setImportJson(''); setImportFileName(''); }}
          >
            清空
          </button>
          <button type="button" className="button button-ghost" onClick={closeModal}>
            取消
          </button>
          <button
            type="button"
            className="button button-primary"
            disabled={!importJson.trim()}
            onClick={handleImport}
          >
            导入
          </button>
        </div>
      </Modal>

    </div>
  );
};
