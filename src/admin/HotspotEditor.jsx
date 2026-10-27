import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

// Labels pinned on the before/after photo. Pick a label, then click the photo where it belongs;
// positions are stored as percentages so they stay on the damage at any screen size.
export default function HotspotEditor({ label, photo, spots = [], onChange }) {
  const [active, setActive] = useState(0);

  function place(e) {
    if (!spots[active]) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    onChange(spots.map((s, i) => (i === active ? { ...s, x, y } : s)));
  }

  return (
    <fieldset className="adm-field adm-hotspots">
      <legend>{label}</legend>
      <small>Choose a label below, then click the photo where it should point.</small>
      <div className="adm-hotspot-photo" onClick={place} role="presentation">
        {photo?.src ? <img src={photo.src} alt="" /> : <span>Add the photo first</span>}
        {spots.map((s, i) => (
          <span key={i} className={`adm-hotspot${i === active ? ' is-active' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
            {i + 1}
          </span>
        ))}
      </div>
      {spots.map((s, i) => (
        <div key={i} className={`adm-list-row adm-hotspot-row${i === active ? ' is-active' : ''}`}>
          <button type="button" className="adm-hotspot-pick" onClick={() => setActive(i)} aria-pressed={i === active}>
            {i + 1}
          </button>
          <input
            value={s.label}
            aria-label={`Label ${i + 1}`}
            onFocus={() => setActive(i)}
            onChange={(e) => onChange(spots.map((t, j) => (j === i ? { ...t, label: e.target.value } : t)))}
          />
          <span className="adm-hotspot-pos">{s.x}% / {s.y}%</span>
          <button
            type="button"
            className="adm-danger"
            aria-label="Remove label"
            onClick={() => { onChange(spots.filter((_, j) => j !== i)); setActive(0); }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="adm-add"
        onClick={() => { onChange([...spots, { label: 'New label', x: 50, y: 50 }]); setActive(spots.length); }}
      >
        <Plus size={16} /> Add label
      </button>
    </fieldset>
  );
}
