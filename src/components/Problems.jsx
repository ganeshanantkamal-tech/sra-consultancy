import { Activity, BrickWall, Columns3, Droplets, Grid3x3, Layers, Ruler, Waves } from 'lucide-react';
import SectionHead from './SectionHead.jsx';
import { useContent } from '../content.jsx';

const icons = { Activity, BrickWall, Columns3, Droplets, Grid3x3, Layers, Ruler, Waves };

export default function Problems() {
  const { problems } = useContent();
  return (
    <section className="section">
      <div className="wrap problems">
        <SectionHead title="Problems" accent="we repair">
          If you can see it on a wall, floor, slab or column, we can find the cause and fix it.
        </SectionHead>
        <ul className="problem-list">
          {problems.map((p) => {
            const Icon = icons[p.icon] || Activity;
            return (
              <li key={p.title}>
                <Icon size={22} strokeWidth={1.5} aria-hidden="true" />
                {p.title}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
