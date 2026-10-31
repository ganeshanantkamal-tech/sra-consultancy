// The estimate review grid as a structural repair BOQ: lines grouped under section headings, each
// with unit, qty, a per-unit cost split, low/high rate, the rate to quote and its amount (qty × rate).
// A table from tablet up (scrolls sideways inside its card); stacked cards on phones.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, FolderPlus, List, ListChecks, Plus, Trash2 } from 'lucide-react';
import { cn, inr0 } from '../../lib/format.js';
import { UNIT_GROUPS, unitLabel } from '../../lib/boq.js';
import { Card, Checkbox, EmptyState, Segmented, Select, Tag, useFeedback } from '../../components/ui.jsx';
import { blankItem, cleanAmount, cleanQty, GST_RATES, groupBySection, lineAmount, num, rateOf, sectionGroups } from './shared.js';

const MODES = [['low', 'Low'], ['high', 'High'], ['custom', 'Custom']];
const MODE_LABEL = Object.fromEntries(MODES);
const NEW_SECTION = '\u0000new';
const money = (v) => `₹${num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const qtyText = (v) => num(v).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const cell = 'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition hover:border-line focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/25';
const th = 'whitespace-nowrap px-2 py-3 text-[10px] font-bold uppercase tracking-widest text-muted';
const iconBtn = 'rounded p-1 text-[#A8A69F] transition-colors hover:bg-white hover:text-brand disabled:pointer-events-none disabled:opacity-30';

function Amount({ value, onChange, onBlur, invalid, locked, className, boxed, label, title, clean = cleanAmount, format = money }) {
  if (locked) return <span className={cn('block px-2 text-right text-sm tabular-nums', boxed && 'py-2', className)}>{num(value) ? format(value) : '—'}</span>;
  return (
    <input type="text" inputMode="decimal" aria-label={label} title={title} value={value} placeholder="0"
      onChange={(e) => onChange(clean(e.target.value))} onBlur={onBlur}
      className={cn(boxed ? 'erp-input py-2 text-right tabular-nums' : cn(cell, 'text-right tabular-nums'), invalid && 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200', className)} />
  );
}

// Unit select grouped by kind of measure, with "Other…" switching to free typing.
function UnitPicker({ item, onChange, locked, boxed }) {
  if (locked) return <span className={cn('block px-2 text-center text-sm', boxed && 'py-2 text-left')} title={unitLabel(item.unit)}>{item.unit}</span>;
  if (item._freeUnit) {
    return (
      <div className="relative">
        <input autoFocus={!item.unit} value={item.unit} maxLength={20} placeholder="Unit" aria-label="Unit"
          onChange={(e) => onChange({ unit: e.target.value })} onBlur={() => !item.unit.trim() && onChange({ unit: 'LS', _freeUnit: false })}
          className={cn(boxed ? 'erp-input py-2 pr-8' : cn(cell, 'pr-6 text-center'))} />
        <button type="button" onClick={() => onChange({ unit: 'LS', _freeUnit: false })} title="Pick from the unit list" aria-label="Pick from the unit list"
          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-brand"><List size={13} /></button>
      </div>
    );
  }
  return (
    <Select value={item.unit} title={unitLabel(item.unit)} aria-label="Unit"
      onChange={(e) => onChange(e.target.value === 'other' ? { unit: '', _freeUnit: true } : { unit: e.target.value })}
      className={cn(!boxed && cn(cell, 'pr-6'))}>
      {UNIT_GROUPS.map(([group, units]) => (
        <optgroup key={group} label={group}>{units.map(([code, label]) => <option key={code} value={code} title={label}>{code}</option>)}</optgroup>
      ))}
      <option value="other">Other…</option>
    </Select>
  );
}

function HsnSelect({ item, codes, onPick, boxed }) {
  const known = codes.some((c) => c.code === item.hsnSac);
  return (
    <Select value={item.hsnSac || ''} onChange={(e) => onPick(e.target.value)} placeholder="Select…" aria-label="HSN / SAC"
      className={cn(boxed ? '' : cn(cell, 'pr-6 font-mono'), !item.hsnSac && item.included && 'border-amber-300')}>
      {item.hsnSac && !known && <option value={item.hsnSac}>{item.hsnSac}</option>}
      {codes.map((c) => <option key={c.id || c.code} value={c.code}>{c.code} — {c.description}</option>)}
    </Select>
  );
}

// "Move to section" picker for one line.
function SectionSelect({ item, groups, onMove, className, short }) {
  const names = [...new Set(groups.map((g) => g.name))];
  return (
    <Select value={item.section.trim()} onChange={(e) => onMove(e.target.value)} aria-label="Section" title="Move this line to another section" className={className}>
      {names.map((n) => <option key={n || '-'} value={n}>{n ? (short ? n : `Section: ${n}`) : 'No section'}</option>)}
      <option value={NEW_SECTION}>New section…</option>
    </Select>
  );
}

const sumDiffers = (item) => Boolean(num(item.lowRate)) && Math.abs(num(item.lowRate) - (num(item.material) + num(item.labour) + num(item.other))) > 0.004;
// Description rows grow with the text (BOQ specifications run long), up to six.
const rowsFor = (text) => Math.min(6, Math.max(2, Math.ceil(text.length / 40) + text.split(/\r?\n/).length - 1));
const Head = ({ children, sub }) => <>{children}{sub && <span className="block text-[9px] font-semibold normal-case tracking-normal text-[#A8A69F]">{sub}</span>}</>;

export default function LineGrid({ items, setItems, update, remove, applyHsn, locked, gst, codes, totals }) {
  const { confirm } = useFeedback();
  const [fresh, setFresh] = useState(null);
  const groups = useMemo(() => sectionGroups(items), [items]);
  const included = items.filter((i) => i.included).length;
  const named = groups.some((g) => g.name);

  const pickHsn = (index, code) => {
    const found = codes.find((c) => c.code === code);
    update(index, { hsnSac: code, ...(found ? { gstRatePct: Number(found.gstRatePct) } : {}) });
  };
  const clampHigh = (index, item) => { if (num(item.highRate) < num(item.lowRate)) update(index, { highRate: item.lowRate }); };
  const insert = (at, item) => { setItems((list) => [...list.slice(0, at), item, ...list.slice(at)]); setFresh(item._k); };
  const addLine = (group) => (group ? insert(group.end, blankItem(group.name)) : insert(items.length, blankItem(groups[groups.length - 1]?.name || '')));
  const askName = async (title) => {
    const name = await confirm({ title, message: 'Lines are grouped under this heading on the Excel sheet and the quotation (A. Preparatory works, B. Structural repair works…).', confirmLabel: 'Add section', input: { label: 'Section heading', required: true, placeholder: 'e.g. Structural repair works' } });
    return name ? name.trim().slice(0, 200) : '';
  };
  const addSection = async () => {
    const name = await askName('New section');
    if (!name) return;
    const existing = groups.filter((g) => g.name === name).pop();
    addLine(existing || { name, end: items.length });
  };
  const rename = (group, name) => setItems((list) => list.map((item, i) => (i >= group.start && i < group.end ? { ...item, section: name } : item)));
  const tidy = () => setItems((list) => groupBySection(list));
  const moveSection = (gi, dir) => {
    const a = groups[Math.min(gi, gi + dir)]; const b = groups[Math.max(gi, gi + dir)];
    setItems((list) => [...list.slice(0, a.start), ...list.slice(b.start, b.end), ...list.slice(a.start, a.end), ...list.slice(b.end)]);
  };
  const moveLine = (index, dir) => setItems((list) => {
    const next = [...list];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    return next;
  });
  const moveTo = async (index, value) => {
    const name = value === NEW_SECTION ? await askName('Move to a new section') : value;
    if (value === NEW_SECTION && !name) return;
    setItems((list) => {
      const item = { ...list[index], section: name };
      const rest = list.filter((_, i) => i !== index);
      const target = sectionGroups(rest).filter((g) => g.name === name).pop();
      const at = target ? target.end : rest.length;
      return groupBySection([...rest.slice(0, at), item, ...rest.slice(at)]);
    });
  };
  const subtotal = (g) => items.slice(g.start, g.end).reduce((n, i) => n + (i.included ? lineAmount(i) : 0), 0);
  const lineNo = (g, index) => index - g.start + 1;

  const actions = !locked && (
    <div className="flex items-center gap-4">
      {gst && items.length > 1 && codes.length > 0 && (
        <Select value="" onChange={(e) => e.target.value && applyHsn(e.target.value)} placeholder="HSN/SAC for all lines…" className="hidden w-52 py-1.5 text-xs sm:block" aria-label="Apply one HSN/SAC code to every line">
          {codes.map((c) => <option key={c.id || c.code} value={c.code}>{c.code} — {c.description}</option>)}
        </Select>
      )}
      <button type="button" onClick={addSection} className="flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-brand-dark" title="Start a new BOQ section"><FolderPlus size={14} /> Section</button>
      <button type="button" onClick={() => addLine()} className="flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-brand-dark" title="Add a line to the last section"><Plus size={14} /> Line</button>
    </div>
  );

  // Editable heading shared by the table and the phone cards.
  // Editable heading shared by the table and the phone cards (where the controls drop below it).
  const heading = (g, gi, boxed) => {
    const controls = !locked && (
      <div className="flex shrink-0 items-center">
        <button type="button" className={iconBtn} disabled={gi === 0} onClick={() => moveSection(gi, -1)} title="Move section up" aria-label="Move section up"><ArrowUp size={15} /></button>
        <button type="button" className={iconBtn} disabled={gi === groups.length - 1} onClick={() => moveSection(gi, 1)} title="Move section down" aria-label="Move section down"><ArrowDown size={15} /></button>
        <button type="button" onClick={() => addLine(g)} className="ml-1 flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold text-brand hover:bg-white" title="Add a line to this section"><Plus size={13} /> Line</button>
      </div>
    );
    const title = (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {g.letter ? <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-xs font-extrabold text-white">{g.letter}</span>
          : <span className="h-6 w-6 shrink-0 rounded-md border-2 border-dashed border-brand-tint" />}
        {locked ? <span className={cn('min-w-0 text-sm font-extrabold uppercase tracking-wide', g.name ? 'text-ink' : 'text-muted')}>{g.name || 'No section heading'}</span> : (
          <input value={items[g.start].section} maxLength={200} onChange={(e) => rename(g, e.target.value)} onBlur={tidy}
            placeholder="Add a section heading (optional)" aria-label={`Section ${g.letter || ''} heading`}
            className={cn(boxed ? 'erp-input min-w-0 flex-1 py-1.5' : cn(cell, 'max-w-md'), 'font-extrabold uppercase tracking-wide placeholder:font-semibold placeholder:normal-case placeholder:tracking-normal')} />
        )}
        {!boxed && controls}
      </div>
    );
    if (!boxed) return title;
    return (
      <div className="space-y-1.5">
        {title}
        <div className="flex items-center justify-between gap-2 pl-8">
          <p className="text-xs text-muted">Section total <span className="font-bold tabular-nums text-ink">{inr0(subtotal(g))}</span></p>
          {controls}
        </div>
      </div>
    );
  };
  const moveButtons = (g, index, vertical) => (
    <div className={cn('flex items-center', vertical && 'flex-col')}>
      <button type="button" className={iconBtn} disabled={index === g.start} onClick={() => moveLine(index, -1)} title="Move line up" aria-label="Move line up"><ArrowUp size={14} /></button>
      <button type="button" className={iconBtn} disabled={index === g.end - 1} onClick={() => moveLine(index, 1)} title="Move line down" aria-label="Move line down"><ArrowDown size={14} /></button>
    </div>
  );
  const extra = (gst ? 2 : 0) + (locked ? 0 : 1); // columns after Amount

  return (
    <Card title={<>Bill of Quantities <span className="ml-1 text-xs font-semibold text-muted">{items.length ? `${included} of ${items.length} lines included` : ''}</span></>} icon={ListChecks} actions={actions} bodyClassName="p-0">
      {!items.length ? (
        <EmptyState icon={ListChecks} title="No estimate lines yet" action={!locked && (
          <div className="flex items-center gap-5">
            <button type="button" onClick={addSection} className="flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-dark"><FolderPlus size={14} /> Start a section</button>
            <button type="button" onClick={() => addLine()} className="flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-dark"><Plus size={14} /> Add a line</button>
          </div>
        )}>
          {locked ? 'This estimate has no lines.' : 'Upload site photos and analyse them with Claude, or build the BOQ by hand: sections such as Preparatory works and Structural repair works, each line with a unit, quantity and rate.'}
        </EmptyState>
      ) : (
        <>
          {/* Tablet and desktop: the BOQ table, scrolling sideways inside the card. */}
          <div className="hidden overflow-x-auto md:block">
            <table className={cn('w-full', gst ? 'min-w-[1880px]' : 'min-w-[1640px]')}>
              <thead className="border-b border-line bg-[#FAFAF8]">
                <tr>
                  <th className={cn(th, 'w-10 pl-4 text-center')} title="Include in the quotation">Inc.</th>
                  <th className={cn(th, 'min-w-[400px] text-left')}>Description</th>
                  <th className={cn(th, 'w-[112px] text-center')}>Unit</th>
                  <th className={cn(th, 'w-24 text-right')}>Qty</th>
                  <th className={cn(th, 'w-24 text-right')}><Head sub="₹ / unit">Material</Head></th>
                  <th className={cn(th, 'w-24 text-right')}><Head sub="₹ / unit">Labour</Head></th>
                  <th className={cn(th, 'w-24 text-right')}><Head sub="₹ / unit">Other</Head></th>
                  <th className={cn(th, 'w-24 text-right')} title="Material + labour + other, per unit"><Head sub="₹ / unit">Low Rate</Head></th>
                  <th className={cn(th, 'w-24 text-right')}><Head sub="₹ / unit">High Rate</Head></th>
                  <th className={cn(th, 'w-[176px] text-center')}>Quote At</th>
                  <th className={cn(th, 'w-28 text-right')}><Head sub="₹ / unit">Quoted Rate</Head></th>
                  <th className={cn(th, 'w-32 text-right')} title="Qty × quoted rate"><Head sub="qty × rate">Amount ₹</Head></th>
                  {gst && <th className={cn(th, 'w-44 text-left')}>HSN / SAC</th>}
                  {gst && <th className={cn(th, 'w-20 text-center')}>GST %</th>}
                  {!locked && <th className={cn(th, 'w-20 pr-4')} />}
                </tr>
              </thead>
              {groups.map((g, gi) => (
                <tbody key={g.key} className="divide-y divide-line border-b border-line">
                  {(named || !locked) && (
                    <tr className="bg-brand-soft/70">
                      <td colSpan={11} className="py-2 pl-4 pr-2">{heading(g, gi)}</td>
                      <td className="px-3 py-2 text-right text-sm font-extrabold tabular-nums text-ink" title="Section total of included lines">{inr0(subtotal(g))}</td>
                      {extra > 0 && <td colSpan={extra} />}
                    </tr>
                  )}
                  {items.slice(g.start, g.end).map((item, offset) => {
                    const index = g.start + offset;
                    const off = !item.included;
                    return (
                      <tr key={item._k} className={cn('align-top transition-colors', off ? 'bg-paper/70' : 'hover:bg-brand-soft/30')}>
                        <td className="py-3 pl-4 text-center">
                          <input type="checkbox" checked={item.included} disabled={locked} onChange={(e) => update(index, { included: e.target.checked })} aria-label={`Include line ${index + 1}`} className="mt-1 h-4 w-4 cursor-pointer accent-[#8A6634]" />
                        </td>
                        <td className={cn('px-2 py-2', off && 'opacity-60')}>
                          <div className="flex items-start gap-1.5">
                            <span className="mt-2 w-5 shrink-0 text-right text-xs font-bold text-muted">{lineNo(g, index)}.</span>
                            <div className="min-w-0 flex-1">
                              {locked ? (
                                <p className="whitespace-pre-line px-2 py-1.5 text-sm font-medium text-ink">{item.description}</p>
                              ) : (
                                <textarea rows={rowsFor(item.description)} autoFocus={item._k === fresh} value={item.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Item of work, e.g. Scaffolding – providing and erecting M.S. H-frame scaffolding…" aria-label="Description" title={item.description} className={cn(cell, 'resize-y font-medium leading-snug', !item.description.trim() && 'border-amber-300')} />
                              )}
                              {locked ? (item.notes && <p className="px-2 text-xs text-muted">{item.notes}</p>) : (
                                <div className="mt-0.5 flex items-center gap-1">
                                  <input value={item.notes} onChange={(e) => update(index, { notes: e.target.value })} placeholder="Note / qty assumption" aria-label="Notes" className={cn(cell, 'min-w-0 flex-1 py-1 text-xs text-muted')} />
                                  <SectionSelect short item={item} groups={groups} onMove={(v) => moveTo(index, v)} className={cn(cell, 'w-44 shrink-0 py-1 pr-6 text-xs text-muted')} />
                                </div>
                              )}
                              {off && <Tag className="ml-2 mt-1 whitespace-nowrap bg-amber-50 text-amber-700">Optional · not included</Tag>}
                            </div>
                          </div>
                        </td>
                        <td className={cn('px-1 py-2', off && 'opacity-60')}><UnitPicker item={item} locked={locked} onChange={(patch) => update(index, patch)} /></td>
                        <td className={cn('px-1 py-2', off && 'opacity-60')}>
                          <Amount locked={locked} label="Quantity" value={item.qty} clean={cleanQty} format={qtyText} invalid={!(num(item.qty) > 0)} title={num(item.qty) > 0 ? undefined : 'Enter a quantity'} onChange={(v) => update(index, { qty: v })} className="font-semibold" />
                        </td>
                        {['material', 'labour', 'other'].map((k) => (
                          <td key={k} className={cn('px-1 py-2', off && 'opacity-60')}><Amount locked={locked} label={`${k} per unit`} value={item[k]} onChange={(v) => update(index, { [k]: v })} /></td>
                        ))}
                        <td className={cn('relative px-1 py-2', off && 'opacity-60')}>
                          <Amount locked={locked} label="Low rate per unit" value={item.lowRate} onChange={(v) => update(index, { lowRate: v })} className="font-semibold" />
                          {!locked && sumDiffers(item) && <span className="absolute right-0 top-2 h-1.5 w-1.5 rounded-full bg-amber-500" title="Typed by hand: differs from material + labour + other" />}
                        </td>
                        <td className={cn('px-1 py-2', off && 'opacity-60')}>
                          <Amount locked={locked} label="High rate per unit" value={item.highRate} invalid={num(item.highRate) < num(item.lowRate)} title={num(item.highRate) < num(item.lowRate) ? 'Cannot be below the low rate' : undefined} onChange={(v) => update(index, { highRate: v })} onBlur={() => clampHigh(index, item)} className="font-semibold" />
                        </td>
                        <td className="px-2 py-2 text-center">
                          {locked ? <Tag>{MODE_LABEL[item.rateMode]}</Tag> : <Segmented value={item.rateMode} onChange={(v) => update(index, { rateMode: v })} options={MODES} />}
                        </td>
                        <td className="px-1 py-2">
                          {item.rateMode === 'custom' && !locked ? (
                            <Amount label="Custom rate per unit" value={item.customRate} invalid={item.included && !num(item.customRate)} onChange={(v) => update(index, { customRate: v })} className="border-brand-tint bg-brand-soft font-bold" />
                          ) : (
                            <span className="block px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-ink">{money(rateOf(item))}</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <span className={cn('block py-1.5 pr-1 text-right text-sm font-bold tabular-nums', off ? 'text-muted line-through' : 'text-ink')}>{money(lineAmount(item) / 100)}</span>
                        </td>
                        {gst && (
                          <td className="px-1 py-2">
                            {locked ? <span className="px-2 font-mono text-sm">{item.hsnSac || '—'}</span> : <HsnSelect item={item} codes={codes} onPick={(code) => pickHsn(index, code)} />}
                          </td>
                        )}
                        {gst && (
                          <td className="px-1 py-2 text-center">
                            {locked ? <span className="text-sm">{item.gstRatePct}%</span> : (
                              <Select value={item.gstRatePct} onChange={(e) => update(index, { gstRatePct: Number(e.target.value) })} aria-label="GST rate" className={cn(cell, 'pr-6 text-center')}>
                                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                              </Select>
                            )}
                          </td>
                        )}
                        {!locked && (
                          <td className="py-2 pr-4">
                            <div className="flex items-center justify-end gap-0.5">
                              {moveButtons(g, index, true)}
                              <button type="button" onClick={() => remove(index)} className="p-1 text-[#CFCCC4] transition-colors hover:text-red-500" title="Remove line" aria-label={`Remove line ${index + 1}`}><Trash2 size={16} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
              <tfoot className="border-t-2 border-line bg-[#FAFAF8] text-sm font-bold tabular-nums text-ink">
                <tr>
                  <td />
                  <td className="whitespace-nowrap px-4 py-3 text-xs uppercase tracking-widest text-muted">Included lines · Σ qty × rate</td>
                  <td colSpan={2} />
                  <td className="px-3 py-3 text-right">{inr0(totals.material)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.labour)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.other)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.low)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.high)}</td>
                  <td colSpan={2} />
                  <td className="px-3 py-3 text-right text-brand">{inr0(totals.quoted)}</td>
                  {extra > 0 && <td colSpan={extra} />}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Phones: a heading per section, then one card per line. */}
          <div className="md:hidden">
            {groups.map((g, gi) => (
              <div key={g.key} className="border-b border-line">
                {(named || !locked) && (
                  <div className="bg-brand-soft/70 px-4 py-3">
                    {heading(g, gi, true)}
                  </div>
                )}
                <div className="divide-y divide-line">
                  {items.slice(g.start, g.end).map((item, offset) => {
                    const index = g.start + offset;
                    return (
                      <div key={item._k} className={cn('space-y-3 p-4', !item.included && 'bg-paper/70')}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-muted">{g.letter ? `${g.letter}.` : 'Line '}{lineNo(g, index)}</span>
                            {!item.included && <Tag className="bg-amber-50 text-amber-700">Optional</Tag>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox label="Include" checked={item.included} disabled={locked} onChange={(e) => update(index, { included: e.target.checked })} className="text-xs font-semibold" />
                            {!locked && moveButtons(g, index)}
                            {!locked && <button type="button" onClick={() => remove(index)} className="p-1 text-muted hover:text-red-500" aria-label={`Remove line ${index + 1}`}><Trash2 size={17} /></button>}
                          </div>
                        </div>
                        {locked ? (
                          <div><p className="whitespace-pre-line text-sm font-semibold text-ink">{item.description}</p>{item.notes && <p className="mt-0.5 text-xs text-muted">{item.notes}</p>}</div>
                        ) : (
                          <div className="space-y-2">
                            <textarea rows={3} value={item.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Item of work, e.g. Scaffolding – providing and erecting M.S. H-frame scaffolding…" aria-label="Description" className={cn('erp-input resize-y font-medium', !item.description.trim() && 'border-amber-300')} />
                            <input value={item.notes} onChange={(e) => update(index, { notes: e.target.value })} placeholder="Note or quantity assumption (optional)" aria-label="Notes" className="erp-input py-2 text-xs" />
                            <SectionSelect item={item} groups={groups} onMove={(v) => moveTo(index, v)} className="py-2 text-xs" />
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div><p className="erp-label text-[10px]">Unit</p><UnitPicker boxed item={item} locked={locked} onChange={(patch) => update(index, patch)} /></div>
                          <div><p className="erp-label text-[10px]">Qty</p><Amount boxed locked={locked} label="Quantity" value={item.qty} clean={cleanQty} format={qtyText} invalid={!(num(item.qty) > 0)} onChange={(v) => update(index, { qty: v })} className="font-semibold" /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {[['material', 'Material'], ['labour', 'Labour'], ['other', 'Other']].map(([k, label]) => (
                            <div key={k}><p className="erp-label text-[10px]">{label} ₹/unit</p><Amount boxed locked={locked} label={`${label} per unit`} value={item[k]} onChange={(v) => update(index, { [k]: v })} /></div>
                          ))}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div><p className="erp-label text-[10px]">Low rate ₹/unit</p><Amount boxed locked={locked} label="Low rate per unit" value={item.lowRate} onChange={(v) => update(index, { lowRate: v })} className="font-semibold" /></div>
                          <div><p className="erp-label text-[10px]">High rate ₹/unit</p><Amount boxed locked={locked} label="High rate per unit" value={item.highRate} invalid={num(item.highRate) < num(item.lowRate)} onChange={(v) => update(index, { highRate: v })} onBlur={() => clampHigh(index, item)} className="font-semibold" /></div>
                        </div>
                        <div className="space-y-2 rounded-lg bg-paper/70 p-2.5">
                          <div className="flex items-end justify-between gap-3">
                            <div>
                              <p className="erp-label text-[10px]">Quote at</p>
                              {locked ? <Tag>{MODE_LABEL[item.rateMode]}</Tag> : <Segmented value={item.rateMode} onChange={(v) => update(index, { rateMode: v })} options={MODES} />}
                            </div>
                            <div className="min-w-0 flex-1 text-right">
                              <p className="erp-label text-[10px]">Rate ₹/unit</p>
                              {item.rateMode === 'custom' && !locked
                                ? <Amount boxed label="Custom rate per unit" value={item.customRate} invalid={item.included && !num(item.customRate)} onChange={(v) => update(index, { customRate: v })} className="font-bold" />
                                : <p className="py-2 text-sm font-semibold tabular-nums text-ink">{money(rateOf(item))}</p>}
                            </div>
                          </div>
                          <div className="flex items-baseline justify-between border-t border-line pt-2">
                            <span className="text-xs text-muted">{qtyText(item.qty)} {item.unit || 'LS'} × {money(rateOf(item))}</span>
                            <span className={cn('text-base font-extrabold tabular-nums', item.included ? 'text-ink' : 'text-muted line-through')}>{money(lineAmount(item) / 100)}</span>
                          </div>
                        </div>
                        {gst && (
                          <div className="grid grid-cols-[1fr_88px] gap-2">
                            <div><p className="erp-label text-[10px]">HSN / SAC</p>{locked ? <p className="font-mono text-sm">{item.hsnSac || '—'}</p> : <HsnSelect boxed item={item} codes={codes} onPick={(code) => pickHsn(index, code)} />}</div>
                            <div><p className="erp-label text-[10px]">GST</p>{locked ? <p className="text-sm">{item.gstRatePct}%</p> : (
                              <Select value={item.gstRatePct} onChange={(e) => update(index, { gstRatePct: Number(e.target.value) })} aria-label="GST rate">{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select>
                            )}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between bg-[#FAFAF8] p-4 text-sm font-bold">
              <span className="text-xs uppercase tracking-widest text-muted">Quoted base · Σ qty × rate</span>
              <span className="tabular-nums text-brand">{inr0(totals.quoted)}</span>
            </div>
            {!locked && (
              <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
                <button type="button" onClick={addSection} className="flex items-center justify-center gap-1 p-3.5 text-sm font-bold text-brand hover:bg-brand-soft"><FolderPlus size={14} /> Section</button>
                <button type="button" onClick={() => addLine()} className="flex items-center justify-center gap-1 p-3.5 text-sm font-bold text-brand hover:bg-brand-soft"><Plus size={14} /> Line</button>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
