import SectionHead from './SectionHead.jsx';
import { useContent } from '../content.jsx';

export default function Expertise() {
  const { expertise } = useContent();
  return (
    <section className="section" id="expertise">
      <div className="wrap expertise">
        <div className="expertise-copy">
          <SectionHead title="Our" accent="expertise" />
          {expertise.paragraphs.map((text) => <p key={text}>{text}</p>)}
          <p className="signature">
            Under the technical guidance of <strong>Abhay Suresh Aher, B.E.</strong> and the SRA team.
          </p>
        </div>
        <figure className="expertise-photo">
          <img src={expertise.photo.src} alt={expertise.photo.alt} loading="lazy" />
        </figure>
      </div>

      <div className="wrap">
        <ul className="reasons">
          {expertise.reasons.map((r) => (
            <li key={r.title}>
              <h3>{r.title}</h3>
              <p>{r.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
