import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Box, FileCheck2, ListTree, ScanSearch, Waypoints } from 'lucide-react';
import { useLang } from '../i18n.jsx';
import { reducedMotion, useInViewport } from '../shared.jsx';
import WorkspaceFrame, { WORKSPACE_URLS } from '../components/WorkspaceFrame.jsx';

const CircuitScene = lazy(() => import('../scene/CircuitScene.jsx'));

const TAB_IDS = ['context', 'audit', 'logic', 'all', 'board'];
const TAB_ICON = { context: ScanSearch, audit: FileCheck2, logic: Waypoints, all: ListTree, board: Box };

class SceneBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

const webglOk = () => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
};

export default function Stage() {
  const { t, lang } = useLang();
  const [view, setView] = useState('context');
  const frameRef = useRef(null);
  const onScreen = useInViewport(frameRef);
  const [live, setLive] = useState(false);
  const [gl] = useState(webglOk);
  const [boardSeen, setBoardSeen] = useState(false);
  if (view === 'board' && !boardSeen) setBoardSeen(true);
  const [name, cap] = t.stage.tabs[view];

  // Unfold: the window starts tilted back and settles flat as its top rises from the fold to near the nav.
  const [flat, setFlat] = useState(() => (reducedMotion() ? 1 : 0));
  useEffect(() => {
    if (reducedMotion()) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = frameRef.current;
      if (!el) return;
      const vh = window.innerHeight;
      const top = el.parentElement.getBoundingClientRect().top;
      const k = Math.min(1, Math.max(0, 1 - (top - vh * 0.14) / (vh * 0.7)));
      setFlat(1 - Math.pow(1 - k, 3));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section className="stage-wrap" id="views" aria-label={t.stage.aria}>
      <div className="wrap">
        <div className="stage-head">
          <div className="seg" role="tablist" aria-label={t.stage.aria}>
            {TAB_IDS.map((id) => {
              const I = TAB_ICON[id];
              const isSelected = view === id;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setView(id)}
                  className={`seg-tab${isSelected ? ' on' : ''}`}
                  type="button"
                >
                  <I size={14} strokeWidth={1.8} aria-hidden="true" />
                  <span>{t.stage.tabs[id][0]}</span>
                </button>
              );
            })}
          </div>
          <p className="stage-cap" key={view}>
            <span>{name}</span>
            {cap}
          </p>
        </div>

        <div className="stage-frame" style={{ transform: `translateY(${(1 - flat) * 28}px)`, opacity: 0.4 + flat * 0.6 }}>
          <div className="stage" ref={frameRef}>
            <div className="stage-bar">
              <span className="dots"><i /><i /><i /></span>
              <span className="url"><i className="lock" />localhost:4317<em>/?{WORKSPACE_URLS[view]}</em></span>
              <span className="demo-badge">{t.stage.badge}</span>
            </div>
            <div className="stage-body">
              <div className={`stage-pane${view !== 'board' ? ' on' : ''}`}>
                <WorkspaceFrame view={view} live={live} onLive={() => setLive(true)} />
              </div>
              <div className={`stage-pane abs${view === 'board' ? ' on' : ''}`}>
                <div className="stage-poster" />
                {gl && boardSeen && (
                  <SceneBoundary>
                    <Suspense fallback={null}>
                      <CircuitScene active={onScreen && view === 'board'} reduced={reducedMotion()} lang={lang} />
                    </Suspense>
                  </SceneBoundary>
                )}
                <div className="stage-hint">{t.stage.hint}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
