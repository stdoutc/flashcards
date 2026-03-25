import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFlashcard } from '../context/FlashcardContext';
import {
  createAssocProject,
  deleteAssocProject,
  listAssocProjects,
  updateAssocProjectMeta,
} from '../domain/assocProjectStorage';
import { Modal } from '../components/Modal';
import { openAssocRecallWindow } from './LabAssocRecallPage';

export const AssocHomePage: React.FC = () => {
  const { state } = useFlashcard();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [deckFilter, setDeckFilter] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  type ModalKind = 'create' | null;
  const [modal, setModal] = useState<ModalKind>(null);

  const [newName, setNewName] = useState('');
  const [newDeckId, setNewDeckId] = useState(state.decks[0]?.id ?? '');
  const newNameInputRef = useRef<HTMLInputElement>(null);

  const deckIdsKey = useMemo(() => state.decks.map((d) => d.id).sort().join('|'), [state.decks]);
  const projects = useMemo(() => listAssocProjects(), [refreshKey, deckIdsKey]);
  const deckNameById = useMemo(
    () => new Map(state.decks.map((d) => [d.id, d.name])),
    [state.decks],
  );

  const filteredProjects = useMemo(() => {
    const q = deckFilter.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => {
      const dn = deckNameById.get(p.deckId) ?? '';
      return `${p.name} ${dn}`.toLowerCase().includes(q);
    });
  }, [projects, deckFilter, deckNameById]);

  useEffect(() => {
    if (modal === 'create') {
      setNewName('');
      setNewDeckId(state.decks[0]?.id ?? '');
      setTimeout(() => newNameInputRef.current?.focus(), 50);
    }
  }, [modal, state.decks]);

  const closeModal = () => setModal(null);

  const toggleBulkMode = () => {
    setBulkMode((v) => !v);
    setSelectedProjectIds(new Set());
  };

  const toggleSelectProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const handleSelectAllProjects = () => {
    if (selectedProjectIds.size === filteredProjects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(filteredProjects.map((p) => p.id)));
    }
  };

  const handleBulkDeleteProjects = () => {
    if (selectedProjectIds.size === 0) return;
    if (!window.confirm(`确认删除选中的 ${selectedProjectIds.size} 个联想图谱吗？此操作不可撤销。`)) return;
    Array.from(selectedProjectIds).forEach((id) => deleteAssocProject(id));
    setSelectedProjectIds(new Set());
    setBulkMode(false);
    setRefreshKey((k) => k + 1);
  };

  const handleCreate = () => {
    if (!newDeckId) return;
    const p = createAssocProject(newName, newDeckId);
    closeModal();
    setNewName('');
    setRefreshKey((k) => k + 1);
    navigate(`/assoc/${p.id}`);
  };

  return (
    <div className="home-page">
      <div className="home-header">
        <div className="home-header-left">
          <h2 className="home-title">联想图谱</h2>
          <span className="home-deck-count">{projects.length} 个图谱</span>
        </div>

        <div className="home-header-right">
          <input
            className="input home-search"
            placeholder="搜索联想图谱…"
            value={deckFilter}
            onChange={(e) => setDeckFilter(e.target.value)}
          />
          <button type="button" className="button button-primary" onClick={() => setModal('create')}>
            ＋ 新建联想图谱
          </button>
          <button
            type="button"
            className={`button button-ghost home-bulk-btn ${bulkMode ? 'active' : ''}`}
            onClick={toggleBulkMode}
          >
            {bulkMode ? '取消批量' : '批量删除'}
          </button>
        </div>
      </div>

      {bulkMode && (
        <div className="home-bulk-toolbar card-surface">
          <button type="button" className="button button-ghost" onClick={handleSelectAllProjects}>
            {selectedProjectIds.size === filteredProjects.length && filteredProjects.length > 0
              ? '取消全选'
              : `全选 (${filteredProjects.length})`}
          </button>
          <span className="home-bulk-count">已选 {selectedProjectIds.size} 个图谱</span>
          <button
            type="button"
            className="button button-danger"
            disabled={selectedProjectIds.size === 0}
            onClick={handleBulkDeleteProjects}
          >
            删除所选
          </button>
        </div>
      )}

      <div className="deck-grid">
        {filteredProjects.map((p) => {
          const isChecked = selectedProjectIds.has(p.id);
          return (
          <div
            key={p.id}
            className={`deck-card ${bulkMode && isChecked ? 'deck-card-bulk-selected' : ''}`}
            onClick={() => (bulkMode ? toggleSelectProject(p.id) : undefined)}
          >
            {bulkMode && (
              <label className="deck-card-checkbox" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleSelectProject(p.id)}
                />
              </label>
            )}
            <div className="deck-card-body">
              <div className="deck-card-name">{p.name}</div>
              <div className="deck-card-chips">
                <span className="deck-chip deck-chip-total">
                  卡组：{deckNameById.get(p.deckId) ?? '已删除'}
                </span>
              </div>
            </div>
            {!bulkMode && (
              <div className="deck-card-actions">
                <Link to={`/assoc/${p.id}`} className="button button-primary deck-card-cta">
                  打开编辑
                </Link>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    if (!p.graph.rootId) {
                      window.alert('该图谱尚未设置起始节点，请先进入编辑页添加首张卡片。');
                      return;
                    }
                    // 有些浏览器在成功打开新标签页时仍可能返回 null，
                    // 为避免出现「已打开但还弹失败提示」的体验问题，这里不依赖返回值。
                    openAssocRecallWindow(p.deckId, p.graph.rootId, p.graph.children ?? {});
                  }}
                >
                  开始联想
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => {
                    const next = window.prompt('重命名联想图谱', p.name)?.trim();
                    if (!next) return;
                    updateAssocProjectMeta(p.id, { name: next });
                    setRefreshKey((k) => k + 1);
                  }}
                >
                  重命名
                </button>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={() => {
                    if (!window.confirm(`确认删除联想图谱「${p.name}」吗？`)) return;
                    deleteAssocProject(p.id);
                    setRefreshKey((k) => k + 1);
                  }}
                >
                  删除
                </button>
              </div>
            )}
          </div>
        )})}
      </div>

      {filteredProjects.length === 0 && (
        <div className="deck-empty">
          {deckFilter
            ? `没有匹配「${deckFilter}」的联想图谱。`
            : '还没有联想图谱，点击右上角「＋ 新建联想图谱」开始吧！'}
        </div>
      )}

      <Modal open={modal === 'create'} title="新建联想图谱" onClose={closeModal}>
        <div className="field">
          <label className="label" htmlFor="modal-assoc-name">
            图谱名称（可选）
          </label>
          <input
            id="modal-assoc-name"
            ref={newNameInputRef}
            className="input"
            placeholder="如：单词联想、函数推导记忆……"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <div style={{ marginTop: 10 }}>
            <label className="label">绑定卡组</label>
            <select className="input" value={newDeckId} onChange={(e) => setNewDeckId(e.target.value)}>
              {state.decks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <p className="hint small" style={{ marginTop: 6 }}>
            创建后进入图谱编辑页开始构建关联。
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="button button-ghost" onClick={closeModal}>
            关闭
          </button>
          <button type="button" className="button button-primary" onClick={handleCreate} disabled={!newDeckId}>
            创建
          </button>
        </div>
      </Modal>
    </div>
  );
};

