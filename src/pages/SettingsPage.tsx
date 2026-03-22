import React, { useMemo, useRef, useState } from 'react';
import { useFlashcard } from '../context/FlashcardContext';
import { DEFAULT_SETTINGS } from '../domain/models';

/* ── 小工具：格式化时间戳 ── */
function fmtDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

/* ── 设置项行 ── */
const SettingRow: React.FC<{
  label: string;
  desc?: string;
  children: React.ReactNode;
}> = ({ label, desc, children }) => (
  <div className="setting-row">
    <div className="setting-row-label">
      <span className="setting-label">{label}</span>
      {desc && <span className="setting-desc">{desc}</span>}
    </div>
    <div className="setting-row-control">{children}</div>
  </div>
);

/* ── 设置分区 ── */
const SettingSection: React.FC<{
  title: string;
  icon: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, icon, collapsed, onToggle, children }) => (
  <section className="setting-section card-surface">
    <button
      type="button"
      className="setting-section-title setting-section-toggle"
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <span className="setting-section-icon">{icon}</span>
      <span>{title}</span>
      <span className={`setting-section-caret ${collapsed ? '' : 'expanded'}`}>▾</span>
    </button>
    {!collapsed && <div className="setting-section-body">{children}</div>}
  </section>
);

/* ──────────────── 设置页主体 ──────────────── */
export const SettingsPage: React.FC = () => {
  const {
    state,
    updateSettings,
    exportAllJson,
    importAllJson,
    clearAllData,
  } = useFlashcard();

  const settings = state.settings;

  /* 数据管理状态 */
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exportCopied, setExportCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collapsedMap, setCollapsedMap] = useState({
    plan: true,
    data: true,
    ai: true,
    card: true,
    about: true,
  });

  /* 统计汇总 */
  const summary = useMemo(() => {
    const totalCards = state.cards.length;
    const masteredCards = state.cards.filter((c) => c.mastery >= 3).length;
    const masteryPct =
      totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;
    return { totalCards, masteredCards, masteryPct };
  }, [state]);

  /* ── 全量导出 ── */
  const handleExportAll = () => {
    const json = exportAllJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flashcard-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAll = () => {
    navigator.clipboard.writeText(exportAllJson()).then(() => {
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 2500);
    });
  };

  /* ── 全量导入（粘贴方式） ── */
  const handleImportPaste = () => {
    const text = importText.trim();
    if (!text) return;
    const ok = importAllJson(text);
    setImportMsg(
      ok
        ? { ok: true, text: '导入成功！所有数据已恢复。' }
        : { ok: false, text: '格式不正确，请确认是本应用导出的完整 JSON 文件。' },
    );
    if (ok) setImportText('');
    setTimeout(() => setImportMsg(null), 4000);
  };

  /* ── 全量导入（文件方式） ── */
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const ok = importAllJson(text);
      setImportMsg(
        ok
          ? { ok: true, text: `已从「${file.name}」恢复数据！` }
          : { ok: false, text: '文件格式不正确，无法导入。' },
      );
      setTimeout(() => setImportMsg(null), 4000);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  /* ── 清除全部数据 ── */
  const handleClearAll = () => {
    if (
      !window.confirm(
        '⚠️ 即将清除全部数据（卡组、卡片、学习记录），此操作不可撤销。\n\n建议先导出备份后再执行。确定继续吗？',
      )
    )
      return;
    clearAllData();
  };

  const toggleSection = (key: keyof typeof collapsedMap) => {
    setCollapsedMap((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleResetSettings = () => {
    if (!window.confirm('确定要恢复“设置项”为默认值吗？不会删除卡组和学习数据。')) return;
    updateSettings({ ...DEFAULT_SETTINGS });
  };

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <h2 className="settings-title">设置</h2>
        <p className="settings-subtitle">学习计划、数据备份与应用信息</p>
      </div>

      {/* ── 复习设置 ── */}
      <SettingSection
        title="复习设置"
        icon="🔁"
        collapsed={collapsedMap.plan}
        onToggle={() => toggleSection('plan')}
      >
        <h4 className="setting-subsection-title">学习计划默认值</h4>
        <p className="setting-section-desc">
          以下为新建卡组时使用的默认值，不影响已有卡组。如需调整已有卡组的每日上限，可在该卡组的「管理卡片」页顶部单独修改。
        </p>

        <SettingRow
          label="每日新卡上限"
          desc="每天最多学习多少张从未见过的新卡片"
        >
          <div className="setting-number-row">
            <input
              type="range"
              min={1}
              max={200}
              step={1}
              className="setting-range"
              value={settings.defaultNewPerDay}
              onChange={(e) =>
                updateSettings({ defaultNewPerDay: Number(e.target.value) })
              }
            />
            <input
              type="number"
              min={1}
              max={999}
              className="input setting-number-input"
              value={settings.defaultNewPerDay}
              onChange={(e) =>
                updateSettings({ defaultNewPerDay: Math.max(1, Number(e.target.value)) })
              }
            />
            <span className="setting-unit">张 / 天</span>
          </div>
        </SettingRow>

        <div className="setting-divider" />

        <SettingRow
          label="每日复习上限"
          desc="每天最多复习多少张已学过的到期卡片"
        >
          <div className="setting-number-row">
            <input
              type="range"
              min={1}
              max={500}
              step={5}
              className="setting-range"
              value={settings.defaultReviewPerDay}
              onChange={(e) =>
                updateSettings({ defaultReviewPerDay: Number(e.target.value) })
              }
            />
            <input
              type="number"
              min={1}
              max={9999}
              className="input setting-number-input"
              value={settings.defaultReviewPerDay}
              onChange={(e) =>
                updateSettings({ defaultReviewPerDay: Math.max(1, Number(e.target.value)) })
              }
            />
            <span className="setting-unit">张 / 天</span>
          </div>
        </SettingRow>
        <div className="setting-divider" />
        <SettingRow label="恢复默认设置" desc="将复习计划默认值与 AI 配置恢复为初始值">
          <button type="button" className="button button-ghost" onClick={handleResetSettings}>
            恢复默认设置
          </button>
        </SettingRow>
      </SettingSection>

      {/* ── 卡片管理设置 ── */}
      <SettingSection
        title="卡片管理设置"
        icon="🗂️"
        collapsed={collapsedMap.card}
        onToggle={() => toggleSection('card')}
      >
        <SettingRow
          label="卡片显示方式"
          desc="影响卡片管理页的“卡片列表”显示：正反两面或只显示正面。"
        >
          <select
            className="input"
            value={settings.cardDisplayMode}
            onChange={(e) => updateSettings({ cardDisplayMode: e.target.value as any })}
            style={{ width: '100%' }}
          >
            <option value="both">正反两面都显示（默认）</option>
            <option value="frontOnly">只显示正面</option>
          </select>
        </SettingRow>
      </SettingSection>

      {/* ── 数据管理 ── */}
      <SettingSection
        title="数据管理"
        icon="💾"
        collapsed={collapsedMap.data}
        onToggle={() => toggleSection('data')}
      >

        {/* 数据概览 */}
        <div className="data-summary">
          <div className="data-summary-item">
            <span className="data-summary-value">{state.decks.length}</span>
            <span className="data-summary-label">个卡组</span>
          </div>
          <div className="data-summary-item">
            <span className="data-summary-value">{summary.totalCards}</span>
            <span className="data-summary-label">张卡片</span>
          </div>
          <div className="data-summary-item">
            <span className="data-summary-value">{state.stats.totalReviews}</span>
            <span className="data-summary-label">次学习</span>
          </div>
          <div className="data-summary-item">
            <span className="data-summary-value">{summary.masteredCards}</span>
            <span className="data-summary-label">已掌握</span>
          </div>
          <div className="data-summary-item">
            <span className="data-summary-value">{summary.masteryPct}%</span>
            <span className="data-summary-label">掌握率</span>
          </div>
        </div>

        <div className="setting-divider" />

        {/* 导出 */}
        <SettingRow label="导出全部数据" desc="将所有卡组、卡片、学习记录打包成 JSON">
          <div className="setting-btn-row">
            <button type="button" className="button button-primary" onClick={handleExportAll}>
              下载备份文件
            </button>
            <button type="button" className="button button-ghost" onClick={handleCopyAll}>
              {exportCopied ? '✓ 已复制' : '复制到剪贴板'}
            </button>
          </div>
        </SettingRow>

        <div className="setting-divider" />

        {/* 导入 */}
        <SettingRow
          label="导入全部数据"
          desc="从备份 JSON 恢复数据（会覆盖当前所有数据）"
        >
          <div className="setting-btn-row">
            <button
              type="button"
              className="button"
              onClick={() => fileInputRef.current?.click()}
            >
              选择文件导入
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />
          </div>
        </SettingRow>

        <div className="field" style={{ marginTop: 10 }}>
          <label className="label" htmlFor="settings-import-paste">
            或粘贴 JSON 内容
          </label>
          <textarea
            id="settings-import-paste"
            className="textarea"
            style={{ minHeight: 90, fontFamily: 'monospace', fontSize: 12 }}
            placeholder="将备份 JSON 粘贴到此处，然后点击「粘贴导入」"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="setting-btn-row" style={{ marginTop: 6 }}>
            <button
              type="button"
              className="button button-primary"
              disabled={!importText.trim()}
              onClick={handleImportPaste}
            >
              粘贴导入
            </button>
            {importText && (
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setImportText('')}
              >
                清空
              </button>
            )}
          </div>
        </div>

        {importMsg && (
          <p className={`setting-msg ${importMsg.ok ? 'setting-msg-ok' : 'setting-msg-err'}`}>
            {importMsg.text}
          </p>
        )}

        <div className="setting-divider" />

        {/* 清除数据 */}
        <SettingRow label="清除全部数据" desc="删除所有卡组与学习记录，不可恢复">
          <button type="button" className="button button-danger" onClick={handleClearAll}>
            清除全部数据
          </button>
        </SettingRow>
      </SettingSection>

      {/* ── AI 配置 ── */}
      <SettingSection
        title="AI 智能识别（豆包）"
        icon="🤖"
        collapsed={collapsedMap.ai}
        onToggle={() => toggleSection('ai')}
      >
        <p className="setting-section-desc">
          配置豆包大模型 API，用于实验室页面的图片智能识别制卡功能。
          前往 <a href="https://console.volcengine.com/ark" target="_blank" rel="noreferrer" className="setting-link">火山引擎控制台</a> 获取 API Key 并开通视觉模型。
        </p>
        <SettingRow label="API Key" desc="豆包 / 火山引擎 ARK API Key">
          <input
            type="password"
            className="input"
            style={{ width: '100%', fontFamily: 'monospace' }}
            placeholder="请输入 API Key"
            value={settings.doubaoApiKey ?? ''}
            onChange={(e) => updateSettings({ doubaoApiKey: e.target.value })}
          />
        </SettingRow>
        <div className="setting-divider" />
        <SettingRow label="Endpoint ID" desc="在控制台「在线推理」创建接入点后获得，格式为 ep-xxxxxxxx">
          <input
            type="text"
            className="input"
            style={{ width: '100%', fontFamily: 'monospace' }}
            placeholder="ep-20250314-xxxxxxxx（从控制台复制）"
            value={settings.doubaoModel ?? ''}
            onChange={(e) => updateSettings({ doubaoModel: e.target.value })}
          />
        </SettingRow>
      </SettingSection>

      {/* ── 关于 ── */}
      <SettingSection
        title="关于"
        icon="ℹ️"
        collapsed={collapsedMap.about}
        onToggle={() => toggleSection('about')}
      >
        <div className="about-body">
          <div className="about-row">
            <span className="about-key">应用名称</span>
            <span className="about-val">卡片记忆学习 APP</span>
          </div>
          <div className="about-row">
            <span className="about-key">版本</span>
            <span className="about-val">0.1.0</span>
          </div>
          <div className="about-row">
            <span className="about-key">最近学习</span>
            <span className="about-val">{fmtDate(state.stats.lastStudyAt)}</span>
          </div>
          <div className="about-row">
            <span className="about-key">定位</span>
            <span className="about-val">
              多用途、高度自定义的卡片记忆工具，支持语言词汇、理科公式、考试考点、编程知识点等多场景学习。
            </span>
          </div>
          <div className="about-row">
            <span className="about-key">卡片格式</span>
            <span className="about-val">
              支持 Markdown 富文本、LaTeX 数学公式、代码块，以及 JSON 格式的卡组导入 / 导出。
            </span>
          </div>
          <div className="about-row">
            <span className="about-key">复习算法</span>
            <span className="about-val">
              基于间隔重复算法（Spaced Repetition），根据记忆遗忘曲线自动安排复习时间。
            </span>
          </div>
        </div>
      </SettingSection>
    </div>
  );
};
