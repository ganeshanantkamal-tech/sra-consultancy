import { MessageCircle, Phone } from 'lucide-react';
import HouseSection from './HouseSection.jsx';
import { whatsappLink } from '../data.js';
import { useContent } from '../content.jsx';

// A sample of what a client receives after a site visit. Tagged "Sample" so it is not read as a real report.
const findings = [
  { level: 'High', issue: 'Seepage through the terrace slab', fix: 'Terrace waterproofing' },
  { level: 'High', issue: 'Leak below the sunken bathroom', fix: 'Sunken slab treatment' },
  { level: 'Medium', issue: 'Crack in a ground-floor wall', fix: 'Crack injection' },
  { level: 'Medium', issue: 'Rising damp at plinth level', fix: 'Damp-proof course' },
];

function InspectionReport() {
  return (
    <figure className="report" aria-label="Sample site inspection report">
      <header className="report-head">
        <div>
          <span className="report-label">Site inspection report</span>
          <strong>G+1 residence, Akola</strong>
        </div>
        <span className="report-tag">Sample</span>
      </header>
      <div className="report-drawing">
        <HouseSection step={0} />
      </div>
      <ol className="report-findings">
        {findings.map((f) => (
          <li key={f.issue}>
            <span className={`level level-${f.level.toLowerCase()}`}>{f.level}</span>
            <span className="finding">
              {f.issue}
              <small>Recommended: {f.fix}</small>
            </span>
          </li>
        ))}
      </ol>
      <footer className="report-foot">
        <span>SRA Consultancy</span>
        <span>Sheet 01 of 04</span>
      </footer>
    </figure>
  );
}

export default function Hero() {
  const { hero, phone } = useContent();
  const inspection = whatsappLink(['Hello SRA Consultancy,', '', 'I would like to book a site inspection.'], phone.whatsapp);

  return (
    <section className="hero" id="top">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          {hero.kicker && <p className="hero-kicker">{hero.kicker}</p>}
          <h1>
            {hero.title} <span className="accent">{hero.accent}</span>
          </h1>
          <p className="hero-lede">{hero.lede}</p>
          <div className="hero-actions">
            <a className="btn btn-dark" href={inspection} target="_blank" rel="noopener">
              <MessageCircle size={16} aria-hidden="true" /> Book a site inspection
            </a>
            <a className="btn btn-line" href={`tel:${phone.tel}`}>
              <Phone size={16} aria-hidden="true" /> Call {phone.display}
            </a>
          </div>
          <ul className="hero-proof">
            {hero.proof.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
        <InspectionReport />
      </div>
    </section>
  );
}
