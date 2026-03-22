import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { AssocRecallPayloadV2 } from '../domain/assocRecallPayload';
import { AssocRecallContent } from './LabAssocRecallContent';

const STORAGE_KEY_PREFIX = 'flashcard-assoc-recall-';

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

export type { AssocRecallPayloadV2 } from '../domain/assocRecallPayload';

/**
 * 联想模式独立路由：通过 ?k= 从 localStorage 取一次性 payload。
 */
export const LabAssocRecallPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [payload, setPayload] = useState<AssocRecallPayloadV2 | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const k = searchParams.get('k');
    if (!k) {
      setLoadError('缺少联想数据参数，请从知识联想图谱页打开。');
      return;
    }
    const p = takePayload(k);
    if (!p) {
      setLoadError('联想数据已失效或已使用，请重新在图谱页打开联想。');
      return;
    }
    setPayload(p);
  }, [searchParams]);

  if (loadError) {
    return (
      <div className="lab-assoc-recall-page lab-assoc-recall-page--fullscreen">
        <div className="lab-assoc-recall-inner lab-assoc-recall-error card-surface">
          <p>{loadError}</p>
          <Link to="/lab/assoc" className="button button-primary">
            返回知识联想图谱
          </Link>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="lab-assoc-recall-page lab-assoc-recall-page--fullscreen">
        <div className="lab-assoc-recall-inner hint">加载中…</div>
      </div>
    );
  }

  return <AssocRecallContent payload={payload} variant="page" />;
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
  return window.open(path, '_blank', 'noopener,noreferrer');
}
