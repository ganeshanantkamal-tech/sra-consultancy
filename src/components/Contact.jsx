import { useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import SectionHead from './SectionHead.jsx';
import { buildingTypes, whatsappLink } from '../data.js';
import { useContent } from '../content.jsx';

// `website` is a honeypot: hidden from people, so only bots fill it in
const emptyForm = { name: '', phone: '', place: '', type: buildingTypes[0], message: '', website: '' };

function EnquiryForm() {
  const { phone: mainPhone } = useContent();
  const [form, setForm] = useState(emptyForm);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const nameRef = useRef(null);
  const messageRef = useRef(null);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });
  const name = form.name.trim();
  const message = form.message.trim();

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);

    const missing = [];
    if (!name) missing.push('your name');
    if (!message) missing.push('a short description of the problem');
    if (missing.length) {
      setError(`Add ${missing.join(' and ')} so we know how to help.`);
      (name ? messageRef : nameRef).current.focus();
      return;
    }
    setError('');

    const place = form.place.trim();
    const phone = form.phone.trim();
    const href = whatsappLink([
      'Hello SRA Consultancy,',
      '',
      message,
      '',
      `Building: ${form.type}`,
      place ? `Location: ${place}` : null,
      `Name: ${name}`,
      phone ? `Phone: ${phone}` : null,
    ], mainPhone.whatsapp);
    // open WhatsApp first, in the click itself, so the browser does not block it
    window.open(href, '_blank', 'noopener');

    // also keep a copy in the CMS enquiries inbox
    fetch('/api/enquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, place, buildingType: form.type, message, website: form.website }),
      keepalive: true,
    })
      .then((res) => setSaved(res.ok))
      .catch(() => {});
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="f-name">Your name</label>
        <input id="f-name" ref={nameRef} type="text" autoComplete="name" required
          value={form.name} onChange={update('name')} aria-invalid={touched && !name} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="f-phone">Phone</label>
          <input id="f-phone" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={update('phone')} />
        </div>
        <div className="field">
          <label htmlFor="f-place">Site location</label>
          <input id="f-place" type="text" placeholder="Akola" value={form.place} onChange={update('place')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="f-type">Type of building</label>
        <select id="f-type" value={form.type} onChange={update('type')}>
          {buildingTypes.map((type) => <option key={type}>{type}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="f-msg">What is the problem?</label>
        <textarea id="f-msg" ref={messageRef} rows="4" required
          placeholder="For example: water leaking from the terrace into the bedroom ceiling during rain"
          value={form.message} onChange={update('message')} aria-invalid={touched && !message} />
      </div>
      <div className="hp" aria-hidden="true">
        <label htmlFor="f-website">Leave this empty</label>
        <input id="f-website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={update('website')} />
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn-dark btn-block" type="submit">
        <MessageCircle size={18} aria-hidden="true" /> Send on WhatsApp
      </button>
      <p className="form-hint" role="status">
        {saved
          ? 'Thank you. We have also received your enquiry and will call you back.'
          : 'This opens WhatsApp addressed to Abhay Aher. Nothing is sent until you press send there.'}
      </p>
    </form>
  );
}

export default function Contact() {
  const { offices } = useContent();
  return (
    <section className="section" id="contact">
      <div className="wrap contact">
        <div>
          <SectionHead title="Get in" accent="touch">
            Tell us what you are seeing: a crack, a damp patch, a leaking terrace. We will advise on the next step.
          </SectionHead>
          <div className="offices">
            {offices.map((o) => (
              <div key={o.label} className="office">
                <h3>{o.label}</h3>
                {o.address && <p>{o.address}</p>}
                {o.person && <p className="office-person">{o.person}</p>}
                <a className="office-phone" href={`tel:${o.phone.tel}`}>{o.phone.display}</a>
              </div>
            ))}
          </div>
        </div>
        <EnquiryForm />
      </div>
    </section>
  );
}
