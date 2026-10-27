// Headings follow the brand pattern: plain words, then an accent phrase in tan.
export default function SectionHead({ title, accent, children, className = '' }) {
  return (
    <header className={`section-head ${className}`}>
      <h2>
        {title} {accent && <span className="accent">{accent}</span>}
      </h2>
      {children && <p>{children}</p>}
    </header>
  );
}
