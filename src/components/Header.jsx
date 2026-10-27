import { useState } from 'react';
import { Menu, Phone, X } from 'lucide-react';
import { navLinks } from '../data.js';
import { useContent } from '../content.jsx';

export function Logo({ light }) {
  return (
    <span className={`logo${light ? ' logo-light' : ''}`}>
      <span className="logo-mark">SRA</span>
      <span className="logo-dot" aria-hidden="true" />
    </span>
  );
}

export default function Header() {
  const { phone } = useContent();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <div className="wrap header-row">
        <a href="#top" aria-label="SRA Consultancy, home" onClick={close}>
          <Logo />
        </a>

        <nav id="nav" className={`nav${open ? ' is-open' : ''}`} aria-label="Main">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={close}>{link.label}</a>
          ))}
        </nav>

        <a className="header-call" href={`tel:${phone.tel}`}>
          <Phone size={15} aria-hidden="true" /> {phone.display}
        </a>

        <button
          className="nav-toggle"
          aria-expanded={open}
          aria-controls="nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
    </header>
  );
}
