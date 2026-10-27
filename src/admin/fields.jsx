import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, ImageUp, Plus, Trash2 } from 'lucide-react';
import { uploadPhoto } from './api.js';

// Small form building blocks for the admin panel. Every field takes `value` and `onChange(newValue)`.

export function TextInput({ label, help, value, onChange, multiline, rows = 3, ...rest }) {
  const id = useId();
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}</label>
      <Tag id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={multiline ? rows : undefined} {...rest} />
      {help && <small>{help}</small>}
    </div>
  );
}

export function Select({ label, help, value, options, onChange }) {
  const id = useId();
  return (
    <div className="adm-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value}>{opt.label}</option>;
        })}
      </select>
      {help && <small>{help}</small>}
    </div>
  );
}

export function Toggle({ label, help, checked, onChange }) {
  const id = useId();
  return (
    <div className="adm-field adm-toggle">
      <input id={id} type="checkbox" checked={Boolean(checked)} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
      {help && <small>{help}</small>}
    </div>
  );
}

const move = (items, from, to) => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

function RowTools({ index, count, onMove, onRemove, removable = true }) {
  return (
    <span className="adm-row-tools">
      <button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label="Move up"><ArrowUp size={16} /></button>
      <button type="button" onClick={() => onMove(index, index + 1)} disabled={index === count - 1} aria-label="Move down"><ArrowDown size={16} /></button>
      {removable && <button type="button" onClick={() => onRemove(index)} aria-label="Remove" className="adm-danger"><Trash2 size={16} /></button>}
    </span>
  );
}

// A list of short texts, e.g. "What is included"
export function StringList({ label, help, items = [], onChange, addLabel = 'Add line', placeholder }) {
  const update = (i, value) => onChange(items.map((item, j) => (j === i ? value : item)));
  return (
    <fieldset className="adm-field adm-list">
      <legend>{label}</legend>
      {help && <small>{help}</small>}
      {items.map((item, i) => (
        <div className="adm-list-row" key={i}>
          <input value={item} placeholder={placeholder} aria-label={`${label}, line ${i + 1}`} onChange={(e) => update(i, e.target.value)} />
          <RowTools index={i} count={items.length} onMove={(a, b) => onChange(move(items, a, b))} onRemove={(j) => onChange(items.filter((_, k) => k !== j))} />
        </div>
      ))}
      <button type="button" className="adm-add" onClick={() => onChange([...items, ''])}><Plus size={16} /> {addLabel}</button>
    </fieldset>
  );
}

// A list of cards, each with its own fields, e.g. offices or services
export function Repeater({ label, help, items = [], onChange, newItem, render, title, addLabel = 'Add', fixed = false }) {
  const update = (i, value) => onChange(items.map((item, j) => (j === i ? value : item)));
  return (
    <fieldset className="adm-field adm-repeater">
      <legend>{label}</legend>
      {help && <small>{help}</small>}
      {items.map((item, i) => (
        <div className="adm-card" key={item.id || i}>
          <div className="adm-card-head">
            <strong>{title(item, i)}</strong>
            <RowTools
              index={i}
              count={items.length}
              removable={!fixed}
              onMove={(a, b) => onChange(move(items, a, b))}
              onRemove={(j) => { if (window.confirm('Remove this item?')) onChange(items.filter((_, k) => k !== j)); }}
            />
          </div>
          {render(item, (value) => update(i, value), i)}
        </div>
      ))}
      {!fixed && <button type="button" className="adm-add" onClick={() => onChange([...items, newItem()])}><Plus size={16} /> {addLabel}</button>}
    </fieldset>
  );
}

// A photo with upload and a description for screen readers and Google
export function PhotoField({ label, help, value, onChange, wide }) {
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photo = value || { src: '', alt: '' };

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange({ ...photo, src: await uploadPhoto(file) });
    } catch (err) {
      setError(err.message || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-field adm-photo">
      <span className="adm-label">{label}</span>
      <div className={`adm-photo-preview${wide ? ' is-wide' : ''}`}>
        {photo.src ? <img src={photo.src} alt="" /> : <span>No photo yet</span>}
      </div>
      <label htmlFor={id} className={`adm-button adm-button-line${busy ? ' is-busy' : ''}`}>
        <ImageUp size={16} /> {busy ? 'Uploading…' : photo.src ? 'Replace photo' : 'Upload photo'}
      </label>
      <input id={id} type="file" accept="image/*" onChange={pick} disabled={busy} className="adm-file" />
      {error && <p className="adm-error" role="alert">{error}</p>}
      {help && <small>{help}</small>}
      <TextInput label="Describe the photo" help="One sentence for people who cannot see images, and for Google." value={photo.alt} onChange={(alt) => onChange({ ...photo, alt })} />
    </div>
  );
}
