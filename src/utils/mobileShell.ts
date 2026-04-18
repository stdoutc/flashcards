/**
 * 由 Expo `mobile` WebView 在页面脚本执行前注入 `window.__FLASHCARD_MOBILE_SHELL__`。
 * 用于在壳内与桌面/移动浏览器区分行为（例如暂时隐藏「联想」入口）。
 */
declare global {
  interface Window {
    __FLASHCARD_MOBILE_SHELL__?: boolean;
  }
}

export function isFlashcardMobileShell(): boolean {
  if (typeof window === 'undefined') return false;
  return window.__FLASHCARD_MOBILE_SHELL__ === true;
}
