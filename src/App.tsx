import React from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { FlashcardProvider } from './context/FlashcardContext';
import { HomePage } from './pages/HomePage';
import { CardEditPage } from './pages/CardEditPage';
import { StudyPage } from './pages/StudyPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';
import { LabPage } from './pages/LabPage';
import { LabHomePage } from './pages/LabHomePage';
import { LabAssocPage } from './pages/LabAssocPage';
import { LabAssocRecallPage } from './pages/LabAssocRecallPage';
import { AssocHomePage } from './pages/AssocHomePage';
import { IS_DEBUG } from './features/decks/useFlashcardApp';
import { DebugPanel } from './debug/DebugPanel';

/** 联想模式页占满主区域宽度与高度（需在 Router 内） */
const AppMain: React.FC = () => {
  const { pathname } = useLocation();
  const assocRecallFull =
    pathname === '/assoc/recall' ||
    pathname.endsWith('/assoc/recall') ||
    pathname === '/lab/assoc/recall' ||
    pathname.endsWith('/lab/assoc/recall');
  const labAssocGraphPage =
    (/^\/assoc\/[^/]+$/.test(pathname) && !pathname.endsWith('/recall')) ||
    pathname === '/lab/assoc' ||
    (pathname.endsWith('/lab/assoc') && !pathname.endsWith('/lab/assoc/recall'));
  return (
    <main
      className={`app-main${assocRecallFull ? ' app-main--assoc-recall' : ''}${labAssocGraphPage ? ' app-main--lab-assoc' : ''}`}
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/deck/:deckId/cards" element={<CardEditPage />} />
        <Route path="/deck/:deckId/study" element={<StudyPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/lab" element={<LabHomePage />} />
        <Route path="/lab/ai" element={<LabPage />} />
        <Route path="/assoc" element={<AssocHomePage />} />
        <Route path="/assoc/:projectId" element={<LabAssocPage />} />
        <Route path="/assoc/recall" element={<LabAssocRecallPage />} />
        <Route path="/lab/assoc" element={<Navigate to="/assoc" replace />} />
        <Route path="/lab/assoc/recall" element={<Navigate to="/assoc/recall" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </main>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <FlashcardProvider>
        <div className={`app-root ${IS_DEBUG ? 'app-root--debug' : ''}`}>
          {IS_DEBUG && <div className="dbg-banner">🐛 调试模式</div>}
          <header className="app-header">
            <Link to="/" className="app-header-home">
              <h1>卡片记忆学习 APP</h1>
              <p className="app-subtitle">多用途 · 高度自定义 · 支持多端</p>
            </Link>
            <nav className="app-nav">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? 'active' : ''}`
                }
              >
                卡组
              </NavLink>
              <NavLink
                to="/stats"
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? 'active' : ''}`
                }
              >
                统计
              </NavLink>
              <NavLink
                to="/assoc"
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? 'active' : ''}`
                }
              >
                联想
              </NavLink>
              <NavLink
                to="/lab"
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? 'active' : ''}`
                }
              >
                实验室
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `app-nav-link ${isActive ? 'active' : ''}`
                }
              >
                设置
              </NavLink>
            </nav>
          </header>
          <AppMain />
          {IS_DEBUG && <DebugPanel />}
        </div>
      </FlashcardProvider>
    </BrowserRouter>
  );
};
