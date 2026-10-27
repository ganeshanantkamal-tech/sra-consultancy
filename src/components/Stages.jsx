import { useState } from 'react';
import SectionHead from './SectionHead.jsx';
import { useContent } from '../content.jsx';

function ItemList({ items }) {
  return (
    <ul className="stage-list">
      {items.map((item) => <li key={item}>{item}</li>)}
    </ul>
  );
}

export default function Stages() {
  const { stages } = useContent();
  const [activeId, setActiveId] = useState(stages[0].id);
  const stage = stages.find((s) => s.id === activeId);

  function onKeyDown(e) {
    const i = stages.findIndex((s) => s.id === activeId);
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next === null) return;
    const target = stages[(next + stages.length) % stages.length];
    setActiveId(target.id);
    document.getElementById(`tab-${target.id}`).focus();
  }

  return (
    <section className="section" id="stages">
      <div className="wrap">
        <SectionHead title="Before, during and" accent="after construction">
          Structural enhancement costs least when it starts with the soil. We also take on buildings that already have
          problems.
        </SectionHead>

        <div className="tabs" role="tablist" aria-label="Construction stage" onKeyDown={onKeyDown}>
          {stages.map((s, i) => (
            <button
              key={s.id}
              id={`tab-${s.id}`}
              role="tab"
              aria-selected={s.id === activeId}
              aria-controls="stage-panel"
              tabIndex={s.id === activeId ? 0 : -1}
              className={`tab${s.id === activeId ? ' is-active' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              <span className="tab-num">{String(i + 1).padStart(2, '0')}</span>
              {s.title}
            </button>
          ))}
        </div>

        <div className="stage-panel" id="stage-panel" role="tabpanel" aria-labelledby={`tab-${stage.id}`}>
          <p className="stage-summary">{stage.summary}</p>
          {stage.items && <ItemList items={stage.items} />}
          {stage.groups && (
            <div className="stage-groups">
              {stage.groups.map((g) => (
                <div key={g.title}>
                  <h3>{g.title}</h3>
                  <ItemList items={g.items} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
