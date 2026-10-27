import { useEffect, useRef, useState } from 'react';
import SectionHead from './SectionHead.jsx';
import HouseSection from './HouseSection.jsx';
import { useContent } from '../content.jsx';

export default function Process() {
  const { process: { steps: process, isIllustration } } = useContent();
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const figRef = useRef(null);

  // The step nearest the reading line is active. On phones the drawing is pinned above the steps,
  // so the reading line sits in the space below it.
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const fig = figRef.current.getBoundingClientRect();
      const stacked = window.matchMedia('(max-width: 959px)').matches;
      const line = stacked ? fig.bottom + (window.innerHeight - fig.bottom) * 0.35 : window.innerHeight * 0.5;
      let best = 0;
      let bestDist = Infinity;
      [...listRef.current.children].forEach((li, i) => {
        const r = li.getBoundingClientRect();
        const dist = Math.abs(r.top + r.height / 2 - line);
        if (dist < bestDist) { bestDist = dist; best = i; }
      });
      setActive(best);
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
  }, []);

  return (
    <section className="section" id="process">
      <div className="wrap process">
        <SectionHead className="process-head" title="From drawing to" accent="durable structure">
          One consultancy for the diagnosis, the repair design, the materials and the supervision.
        </SectionHead>

        <figure className="house-figure" ref={figRef}>
          <div className="process-photos">
            {process.map((step, i) => (
              <img
                key={step.image}
                src={step.image}
                alt={i === active ? step.alt : ''}
                aria-hidden={i !== active}
                className={i === active ? 'is-active' : ''}
                loading="lazy"
              />
            ))}
            {isIllustration && <span className="photo-note">Representative illustration</span>}
          </div>
          <div className="house-inset">
            <HouseSection step={active} />
          </div>
        </figure>

        <ol className="annotations" ref={listRef}>
          {process.map((step, i) => (
            <li key={step.title} className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)}>
              <span className="annotation-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
