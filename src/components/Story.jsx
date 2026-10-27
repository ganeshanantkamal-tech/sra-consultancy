import { useEffect, useRef, useState } from 'react';
import SectionHead from './SectionHead.jsx';
import { useContent } from '../content.jsx';

// Timeline curve in a 1000 x 200 box: a start point, one point per step, an end point.
const CURVE = [[0, 120], [110, 70], [380, 165], [650, 150], [900, 60], [1000, 40]];

// Catmull-Rom spline through the points, as cubic Bezier segments.
function segments(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    segs.push([
      p1,
      [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p2,
    ]);
  }
  return segs;
}

function bezierLength([a, b, c, d]) {
  let len = 0;
  let prev = a;
  for (let t = 1; t <= 40; t++) {
    const s = t / 40;
    const m = 1 - s;
    const pt = [0, 1].map((k) => m * m * m * a[k] + 3 * m * m * s * b[k] + 3 * m * s * s * c[k] + s * s * s * d[k]);
    len += Math.hypot(pt[0] - prev[0], pt[1] - prev[1]);
    prev = pt;
  }
  return len;
}

const SEGS = segments(CURVE);
const PATH = `M${CURVE[0]} ` + SEGS.map(([, b, c, d]) => `C${b} ${c} ${d}`).join(' ');
const LENGTHS = SEGS.map(bezierLength);
const TOTAL = LENGTHS.reduce((a, b) => a + b, 0);
// Fraction of the curve's length at which each step's node sits
const NODE_AT = CURVE.slice(1, -1).map((_, i) => LENGTHS.slice(0, i + 1).reduce((a, b) => a + b, 0) / TOTAL);

// The curve has a node for each of four steps; the CMS enforces exactly four.
const STEPS = 4;
const clamp = (v) => Math.min(1, Math.max(0, v));

// Scroll progress -> how much of the timeline is drawn. The line reaches node i just after step i begins.
function timelineProgress(p) {
  const reach = NODE_AT.map((_, i) => i / STEPS + 0.03);
  if (p <= reach[0]) return NODE_AT[0] * (p / reach[0]);
  for (let i = 0; i < reach.length - 1; i++) {
    if (p <= reach[i + 1]) {
      const t = (p - reach[i]) / (reach[i + 1] - reach[i]);
      return NODE_AT[i] + t * (NODE_AT[i + 1] - NODE_AT[i]);
    }
  }
  const last = reach.length - 1;
  return NODE_AT[last] + ((p - reach[last]) / (1 - reach[last])) * (1 - NODE_AT[last]);
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// Letters build in from `start` (if given) and break apart from `exit`, one after another.
function Word({ text, className, start = -1, exit }) {
  return (
    <div className={`story-word ${className}`} aria-hidden="true">
      {[...text].map((ch, i) => (
        <span key={i} style={{ '--a': start + i * 0.015, '--b': exit + i * 0.015 }}>{ch}</span>
      ))}
    </div>
  );
}

function Spots({ spots, className, start }) {
  return spots.map((s, i) => (
    <div
      key={s.label}
      className={`story-spot ${className}${s.x > 60 ? ' story-spot-left' : ''}`}
      style={{ left: `${s.x}%`, top: `${s.y}%`, '--a': start + i * 0.03 }}
    >
      <span className="spot-dot" />
      <span className="spot-label">{s.label}</span>
    </div>
  ));
}

function StaticStory({ story }) {
  return (
    <section className="section" id="story">
      <div className="wrap">
        <SectionHead title="See the" accent="difference">
          A typical terrace leak, from the damage inside to a dry, repainted room.
        </SectionHead>
        <div className="story-static">
          <figure>
            <img src={story.before.src} alt={story.before.alt} loading="lazy" />
            <figcaption>Before</figcaption>
          </figure>
          <figure>
            <img src={story.after.src} alt={story.after.alt} loading="lazy" />
            <figcaption>After</figcaption>
          </figure>
        </div>
        <ol className="story-static-steps">
          {story.steps.map((s) => (
            <li key={s.label}><strong>{s.label}</strong> {s.text}</li>
          ))}
        </ol>
        {story.isIllustration && <p className="story-note">Representative illustration, not a specific SRA project.</p>}
      </div>
    </section>
  );
}

export default function Story() {
  const { story } = useContent();
  const reduced = useReducedMotion();
  const sectionRef = useRef(null);
  const sceneRef = useRef(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = sectionRef.current.getBoundingClientRect();
      const p = clamp(-rect.top / (rect.height - window.innerHeight));
      sceneRef.current.style.setProperty('--p', p.toFixed(4));
      sceneRef.current.style.setProperty('--tp', timelineProgress(p).toFixed(4));
      setStep(Math.min(STEPS - 1, Math.floor(p * STEPS)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [reduced]);

  if (reduced) return <StaticStory story={story} />;

  const current = story.steps[step];

  return (
    <section className="story" id="story" ref={sectionRef} aria-labelledby="story-title">
      <div className="story-scene" ref={sceneRef}>
        <h2 id="story-title" className="visually-hidden">Before and after: repairing a terrace leak</h2>

        <div className="story-frame">
          <img className="story-img" src={story.before.src} alt={story.before.alt} />
          <img className="story-img story-after" src={story.after.src} alt={story.after.alt} />
          <div className="story-wipe" aria-hidden="true"><span /></div>
          <Spots spots={story.beforeSpots} className="spot-before" start={0.3} />
          <Spots spots={story.afterSpots} className="spot-after" start={0.87} />
        </div>

        <div className="story-shade" aria-hidden="true" />

        <Word text="Before" exit={0.22} />
        <Word text="After" start={0.74} exit={0.84} />

        <div className="story-card" aria-live="polite">
          <div key={step} className="story-card-inner">
            <p className="story-meta">{current.meta}</p>
            <h3>{current.label}</h3>
            <p>{current.text}</p>
            {story.isIllustration && <p className="story-card-note">Representative illustration</p>}
          </div>
        </div>

        <div className="story-rail" aria-hidden="true">
          <span className="rail-count">{String(step + 1).padStart(2, '0')}<small> / {String(STEPS).padStart(2, '0')}</small></span>
          {story.isIllustration && <span className="rail-note">Representative illustration</span>}
        </div>

        <div className="story-timeline">
          <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true">
            <path className="timeline-track" d={PATH} vectorEffect="non-scaling-stroke" />
            <path className="timeline-progress" d={PATH} pathLength="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <ol>
            {story.steps.map((s, i) => {
              const [x, y] = CURVE[i + 1];
              const state = i === step ? ' is-active' : i < step ? ' is-done' : '';
              return (
                <li key={s.label} className={`story-node${state}`} style={{ left: `${x / 10}%`, top: `${y / 2}%` }}>
                  <span className="node-dot">{i === step && String(i + 1).padStart(2, '0')}</span>
                  <span className="node-label">
                    <small>{s.meta}</small>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
