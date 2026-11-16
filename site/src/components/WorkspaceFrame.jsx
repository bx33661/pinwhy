import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MousePointerClick } from 'lucide-react';
import { useSiteTheme } from '@/lib/theme';
import { useLang } from '../i18n.jsx';

/* The real pinwhy workspace, exported offline from a synthetic demo board (site/scripts/make-demo.mjs). */
export const FRAME_W = 1280;
export const FRAME_H = 800;
export const WORKSPACE_URLS = {
  context: 'view=context',
  audit: 'workspace=audit&issue=g1&candidate=fd1',
  logic: 'view=logic',
  all: 'view=all',
  board: 'view=context&scene=2.5d',
};

function prepareWorkspaceStorage(theme, locale) {
  try {
    localStorage.setItem('pinwhy-theme-v3', theme);
    localStorage.setItem('pinwhy-pref-locale', JSON.stringify(locale));
  } catch { /* the workspace falls back to the system theme and language */ }
}

/** Clicks a control inside the same-origin workspace by its aria-label or visible text. */
export function pressWorkspace(frame, label) {
  const doc = frame?.contentDocument;
  if (!doc || !label) return false;
  const btn = [...doc.querySelectorAll('button, [role="radio"]')].find((b) => b.getAttribute('aria-label') === label || b.textContent.trim() === label);
  if (!btn) return false;
  btn.click();
  return true;
}

function pressAuditCandidate(frame, id) {
  const doc = frame?.contentDocument;
  if (!doc || !id) return false;
  const btn = [...doc.querySelectorAll('nav button, section button')].find((b) => b.textContent.includes(`· ${id}`));
  if (!btn) return false;
  btn.click();
  return true;
}

/**
 * Scaled offline workspace iframe with a still until the visitor opts in.
 * @param {'context'|'audit'|'logic'|'all'|'board'} view
 * @param {string|null} [action] optional control label to press after load (e.g. digest)
 */
export default function WorkspaceFrame({ view = 'context', live, onLive, action = null, className = '' }) {
  const { resolved } = useSiteTheme();
  const { lang, t } = useLang();
  const ws = t.stage.ws;
  const box = useRef(null);
  const frame = useRef(null);
  const [scale, setScale] = useState(1);
  const [focus, setFocus] = useState(false);
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState(null);
  const still = view === 'board' ? 'context' : view;

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setScale(e.contentRect.width / FRAME_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The live workspace loads only on request; the language reloads it, the theme is applied in place.
  useEffect(() => {
    if (!live) return;
    prepareWorkspaceStorage(resolved, ws.locale);
    setReady(false);
    setSrc(`/demo/board-${lang}.html?${WORKSPACE_URLS[still]}`);
  }, [live, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const doc = frame.current?.contentDocument;
    if (doc && doc.documentElement.dataset.theme !== resolved) {
      pressWorkspace(frame.current, resolved === 'dark' ? ws.toDark : ws.toLight);
    }
  }, [resolved, ready, ws]);

  useEffect(() => {
    if (!ready || view === 'board') return undefined;
    const f = frame.current;
    let fitTimer;
    let actionTimer;
    const timer = setTimeout(() => {
      if (view === 'audit') {
        pressWorkspace(f, ws.audit);
        fitTimer = setTimeout(() => pressAuditCandidate(f, ws.auditCandidate), 120);
      } else {
        pressWorkspace(f, ws.general);
        setTimeout(() => pressWorkspace(f, ws[view]), 60);
        fitTimer = setTimeout(() => pressWorkspace(f, ws.fit), 650);
      }
      if (action) actionTimer = setTimeout(() => pressWorkspace(f, action), 900);
    }, 0);
    return () => {
      clearTimeout(timer);
      clearTimeout(fitTimer);
      clearTimeout(actionTimer);
    };
  }, [view, ready, ws, action]);

  const load = () => {
    const win = frame.current?.contentWindow;
    const doc = frame.current?.contentDocument;
    if (!doc || !win?.__PINWHY_DATA__) return;
    const style = doc.createElement('style');
    style.textContent = '::-webkit-scrollbar{width:0;height:0}';
    doc.head.appendChild(style);
    setTimeout(() => { setReady(true); setFocus(true); }, 700);
  };

  return (
    <div className={`ws${className ? ` ${className}` : ''}`} ref={box} style={{ height: FRAME_H * scale }} onPointerLeave={() => setFocus(false)}>
      <img
        className={`ws-still${ready ? ' gone' : ''}`}
        src={`/shots/stage-${still}-${lang}-${resolved}.webp`}
        alt={t.stage.tabs[still][0]}
        width={FRAME_W}
        height={FRAME_H}
        decoding="async"
      />
      {src && (
        <iframe
          ref={frame}
          key={src.split('?')[0]}
          title={t.stage.frameTitle}
          src={src}
          onLoad={load}
          tabIndex={focus ? 0 : -1}
          style={{
            width: FRAME_W,
            height: FRAME_H,
            transform: `scale(${scale})`,
            pointerEvents: focus ? 'auto' : 'none',
            opacity: ready ? 1 : 0,
          }}
        />
      )}
      {!live && (
        <button className="ws-open" onClick={onLive} type="button">
          <span className="ws-open-btn">
            <MousePointerClick size={16} strokeWidth={1.8} aria-hidden="true" />
            {t.stage.open}
          </span>
        </button>
      )}
      {live && !ready && (
        <div className="ws-loading" role="status">
          <i />
          {t.stage.loading}
        </div>
      )}
      {ready && !focus && (
        <button className="ws-shield" onClick={() => setFocus(true)} aria-label={t.stage.shield} type="button">
          <span>{t.stage.shield}</span>
        </button>
      )}
    </div>
  );
}
