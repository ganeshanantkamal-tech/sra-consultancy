import { useState } from 'react';
import { useContent } from '../content.jsx';

export default function Services() {
  const { services } = useContent();
  const [active, setActive] = useState(0);
  // content can arrive from Sanity with fewer services than the built-in list
  const service = services[Math.min(active, services.length - 1)];

  return (
    <section className="section" id="services">
      <div className="wrap services">
        <div className="services-stage">
          <div className="tiles" role="group" aria-label="Choose a service">
            {services.map((s, i) => (
              <button
                key={s.title}
                className={`tile tile-${i + 1}${i === active ? ' is-active' : ''}`}
                aria-pressed={i === active}
                onClick={() => setActive(i)}
              >
                <img src={s.image} alt="" loading="lazy" />
                <span className="tile-label">{s.short}</span>
              </button>
            ))}
          </div>

          <div className="service-detail" aria-live="polite">
            <h3>{service.title}</h3>
            <ul>
              {service.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>

        <h2 className="vertical-title" aria-label="What we do: services">
          {/* big word first: in vertical-rl the first line sits rightmost */}
          <span className="vertical-big" aria-hidden="true">Services</span>
          <span className="vertical-small accent" aria-hidden="true">What we do</span>
        </h2>
      </div>
    </section>
  );
}
