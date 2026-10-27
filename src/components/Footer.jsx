import { MessageCircle, Phone } from 'lucide-react';
import { Logo } from './Header.jsx';
import { whatsappLink } from '../data.js';
import { useContent } from '../content.jsx';

export default function Footer() {
  const { phone, offices, footer } = useContent();
  const inspection = whatsappLink(['Hello SRA Consultancy,', '', 'I would like to book a site inspection.'], phone.whatsapp);

  return (
    <footer className="site-footer">
      <section className="footer-cta" aria-labelledby="footer-cta-title">
        <div className="wrap">
          <h2 id="footer-cta-title">
            {footer.title} <span className="accent">{footer.accent}</span>
          </h2>
          <div className="footer-cta-actions">
            <a className="btn btn-gold" href={inspection} target="_blank" rel="noopener">
              <MessageCircle size={16} aria-hidden="true" /> Book a site inspection
            </a>
            <a className="btn btn-light" href={`tel:${phone.tel}`}>
              <Phone size={16} aria-hidden="true" /> Call {phone.display}
            </a>
          </div>
          <ul className="footer-offices">
            {offices.map((o) => (
              <li key={o.label}>
                <span className="footer-office-label">{o.label}</span>
                {/* short line only; full addresses are in the Contact section just above */}
                {o.person && <span>{o.person}</span>}
                <a href={`tel:${o.phone.tel}`}>{o.phone.display}</a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="footer-bar">
        <div className="wrap footer-row">
          <p>© {new Date().getFullYear()} SRA Consultancy. All rights reserved.</p>
          <div className="footer-logo">
            <Logo light />
            <span>Consultancy</span>
          </div>
          <p className="footer-right">Structural repair and waterproofing consultants</p>
        </div>
      </div>
    </footer>
  );
}
