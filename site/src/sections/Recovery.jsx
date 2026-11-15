import { useRef, useState } from 'react';
import { useLang } from '../i18n.jsx';
import { useScrollProgress } from '../shared.jsx';
import WorkspaceFrame, { WORKSPACE_URLS } from '../components/WorkspaceFrame.jsx';

/* Sticky scroll story: left steps highlight as the visitor scrolls; the right side
 * is the real offline workspace (same demo board as Stage). */

const PHASE_VIEW = ['context', 'logic', 'context'];

export default function Recovery() {
  const { t } = useLang();
  const T = t.how;
  const ref = useRef(null);
  const p = useScrollProgress(ref);
  const [live, setLive] = useState(false);
  const phase = p < 0.36 ? 0 : p < 0.62 ? 1 : 2;
  const view = PHASE_VIEW[phase];
  const action = phase === 2 ? t.stage.ws.digest : null;

  return (
    <section id="how" className="recovery" ref={ref} aria-labelledby="recovery-title">
      <div className="recovery-sticky">
        <div className="wrap recovery-grid">
          <div className="recovery-copy">
            <div className="kicker">{T.kicker}</div>
            <h2 className="h2" id="recovery-title">{T.title[0]}<br />{T.title[1]}</h2>
            <ol className="steps" style={{ '--p': p.toFixed(3) }}>
              {T.steps.map(([title, desc], i) => (
                <li key={title} className={phase === i ? 'on' : phase > i ? 'done' : ''}>
                  <span className="k">0{i + 1}</span>
                  <div>
                    <b>{title}</b>
                    <p>{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="recovery-frame">
            <div className="stage-bar">
              <span className="dots"><i /><i /><i /></span>
              <span className="url"><i className="lock" />localhost:4317<em>/?{WORKSPACE_URLS[view]}</em></span>
              <span className="demo-badge">{t.stage.badge}</span>
            </div>
            <div className="recovery-body">
              <WorkspaceFrame
                view={view}
                live={live}
                onLive={() => setLive(true)}
                action={action}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
