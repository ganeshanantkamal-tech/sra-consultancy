import { useState } from 'react';
import SectionHead from './SectionHead.jsx';
import { useContent } from '../content.jsx';

function ProjectCard({ project: p }) {
  const both = p.before && p.after;
  const [showBefore, setShowBefore] = useState(false);
  const photo = showBefore && p.before ? p.before : p.after || p.before;
  const date = p.completed && new Date(p.completed).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

  return (
    <li className="project">
      <div className="project-photo">
        <img src={photo.src} alt={photo.alt} loading="lazy" />
        {both && (
          <div className="project-toggle" role="group" aria-label="Show photo">
            <button type="button" aria-pressed={!showBefore} onClick={() => setShowBefore(false)}>After</button>
            <button type="button" aria-pressed={showBefore} onClick={() => setShowBefore(true)}>Before</button>
          </div>
        )}
      </div>
      <h3>{p.title}</h3>
      <p className="project-meta">{[p.location, p.buildingType, date].filter(Boolean).join(' / ')}</p>
      {p.summary && <p>{p.summary}</p>}
      {p.work.length > 0 && (
        <ul className="project-work">
          {p.work.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </li>
  );
}

// Only real jobs added in the CMS appear here; with none, the section is not shown.
export default function Projects() {
  const { projects } = useContent();
  if (!projects.length) return null;

  return (
    <section className="section" id="projects">
      <div className="wrap">
        <SectionHead title="Recent" accent="projects">
          Jobs completed by SRA Consultancy, with photos from site.
        </SectionHead>
        <ul className="project-grid">
          {projects.map((p) => <ProjectCard key={p._id} project={p} />)}
        </ul>
      </div>
    </section>
  );
}
