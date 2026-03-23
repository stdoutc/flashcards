import React from 'react';
import { Link } from 'react-router-dom';

export const LabHomePage: React.FC = () => {
  return (
    <div className="lab-page">
      <div className="lab-header">
        <h2 className="lab-title">🧪 实验室</h2>
        <p className="lab-subtitle">测试功能合集</p>
      </div>

      <section className="lab-menu card-surface">
        <h3 className="lab-section-title">当前开放</h3>

        <div className="lab-menu-items">
          <Link to="/lab/ai" className="button button-primary lab-menu-item">
            AI 图片识别制卡
          </Link>

          <div className="lab-menu-desc-block">
            <p className="lab-menu-desc">
              上传图片（或截图后粘贴图片），AI 提取关键内容并生成闪卡草稿，支持你审核后导入卡组。
            </p>
          </div>

        </div>
      </section>
    </div>
  );
};

