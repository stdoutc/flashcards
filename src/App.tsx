import React from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { FlashcardProvider } from './context/FlashcardContext';
import { HomePage } from './pages/HomePage';
import { CardEditPage } from './pages/CardEditPage';
import { StudyPage } from './pages/StudyPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';
import { LabPage } from './pages/LabPage';
import { LabHomePage } from './pages/LabHomePage';
import { LabAssocPage } from './pages/LabAssocPage';
import { IS_DEBUG } from './features/decks/useFlashcardApp';
import { DebugPanel } from './debug/DebugPanel';

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
          <main className="app-main">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/deck/:deckId/cards" element={<CardEditPage />} />
              <Route path="/deck/:deckId/study" element={<StudyPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/lab" element={<LabHomePage />} />
              <Route path="/lab/ai" element={<LabPage />} />
              <Route path="/lab/assoc" element={<LabAssocPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
          {IS_DEBUG && <DebugPanel />}
        </div>
      </FlashcardProvider>
    </BrowserRouter>
  );
};
