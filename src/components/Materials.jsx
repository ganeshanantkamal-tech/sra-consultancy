import SectionHead from './SectionHead.jsx';
import { useContent } from '../content.jsx';

export default function Materials() {
  const { materials: { list: materials, brands, note } } = useContent();
  return (
    <section className="section" id="materials">
      <div className="wrap materials">
        <div>
          <SectionHead title="Material" accent="supply">
            Quality construction and waterproofing materials from reputed manufacturers, with technical support on how
            to use them on your site.
          </SectionHead>
          <ul className="material-list">
            {materials.map((m) => <li key={m}>{m}</li>)}
          </ul>
        </div>

        <div className="brands">
          <h3>Authorised supply and technical support for</h3>
          <ul>
            {brands.map((b) => (
              <li key={b.company}>
                <strong>{b.company}</strong>
                {b.brand && <span>{b.brand}</span>}
              </li>
            ))}
          </ul>
          {note && <p className="brands-note">{note}</p>}
        </div>
      </div>
    </section>
  );
}
