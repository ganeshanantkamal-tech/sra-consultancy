import { Building, Building2, Factory, HardHat, House, Landmark, Route, Store } from 'lucide-react';
import SectionHead from './SectionHead.jsx';
import { useContent } from '../content.jsx';

const icons = { Building, Building2, Factory, HardHat, House, Landmark, Route, Store };

export default function Buildings() {
  const { buildings } = useContent();
  return (
    <section className="section" id="buildings">
      <div className="wrap">
        <SectionHead title="Buildings" accent="we work on">
          From bungalows to bridges. Buildings get waterproofing and structural repair; civil structures get structural
          repair.
        </SectionHead>
        <ul className="building-grid">
          {buildings.map((b) => {
            const Icon = icons[b.icon] || Building2;
            return (
              <li key={b.title} className="building">
                <Icon className="building-icon" size={30} strokeWidth={1.25} aria-hidden="true" />
                <h3>{b.title}</h3>
                <p>{b.note}</p>
                <p className="building-tags">{b.tags.join(' / ')}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
