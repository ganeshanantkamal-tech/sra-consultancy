// The estimate review grid: one row per BOQ stage with the cost split, low/high range and the
// amount to quote. A table from tablet up (scrolls sideways inside its card); stacked cards on phones.
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { cn, inr0 } from '../../lib/format.js';
import { Card, Checkbox, EmptyState, Segmented, Select, Tag } from '../../components/ui.jsx';
import { cleanAmount, GST_RATES, num, quotedOf } from './shared.js';

const MODES = [['low', 'Low'], ['high', 'High'], ['custom', 'Custom']];
const MODE_LABEL = Object.fromEntries(MODES);
const money = (v) => `₹${num(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const cell = 'w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink outline-none transition hover:border-line focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/25';
const th = 'whitespace-nowrap px-2 py-3 text-[10px] font-bold uppercase tracking-widest text-muted';

function Amount({ value, onChange, onBlur, invalid, locked, className, boxed, label, title }) {
  if (locked) return <span className={cn('block px-2 text-right text-sm tabular-nums', className)}>{num(value) ? money(value) : '—'}</span>;
  return (
    <input type="text" inputMode="decimal" aria-label={label} title={title} value={value} placeholder="0"
      onChange={(e) => onChange(cleanAmount(e.target.value))} onBlur={onBlur}
      className={cn(boxed ? 'erp-input py-2 text-right tabular-nums' : cn(cell, 'text-right tabular-nums'), invalid && 'border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-200', className)} />
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

const sumDiffers = (item) => Boolean(num(item.lowRate)) && Math.abs(num(item.lowRate) - (num(item.material) + num(item.labour) + num(item.other))) > 0.004;

export default function LineGrid({ items, update, remove, add, applyHsn, locked, gst, codes, totals }) {
  const pickHsn = (index, code) => {
    const found = codes.find((c) => c.code === code);
    update(index, { hsnSac: code, ...(found ? { gstRatePct: Number(found.gstRatePct) } : {}) });
  };
  const clampHigh = (index, item) => { if (num(item.highRate) < num(item.lowRate)) update(index, { highRate: item.lowRate }); };
  const included = items.filter((i) => i.included).length;

  const actions = !locked && (
    <div className="flex items-center gap-3">
      {gst && items.length > 1 && codes.length > 0 && (
        <Select value="" onChange={(e) => e.target.value && applyHsn(e.target.value)} placeholder="HSN/SAC for all lines…" className="hidden w-52 py-1.5 text-xs sm:block" aria-label="Apply one HSN/SAC code to every line">
          {codes.map((c) => <option key={c.id || c.code} value={c.code}>{c.code} — {c.description}</option>)}
        </Select>
      )}
      <button type="button" onClick={add} className="flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-brand-dark"><Plus size={14} /> Add Line</button>
    </div>
  );

  return (
    <Card title={<>Estimate Lines <span className="ml-1 text-xs font-semibold text-muted">{items.length ? `${included} of ${items.length} included` : ''}</span></>} icon={ListChecks} actions={actions} bodyClassName="p-0">
      {!items.length ? (
        <EmptyState icon={ListChecks} title="No estimate lines yet" action={!locked && <button type="button" onClick={add} className="flex items-center gap-1 text-sm font-bold text-brand hover:text-brand-dark"><Plus size={14} /> Add a line by hand</button>}>
          {locked ? 'This estimate has no lines.' : 'Upload site photos and analyse them with Claude, or add the stages by hand.'}
        </EmptyState>
      ) : (
        <>
          {/* Tablet and desktop: the ERP line-item table, scrolling sideways inside the card. */}
          <div className="hidden overflow-x-auto md:block">
            <table className={cn('w-full', gst ? 'min-w-[1400px]' : 'min-w-[1150px]')}>
              <thead className="border-b border-line bg-[#FAFAF8]">
                <tr>
                  <th className={cn(th, 'w-10 pl-4 text-center')} title="Include in the quotation">Inc.</th>
                  <th className={cn(th, 'min-w-[300px] text-left')}>Description</th>
                  <th className={cn(th, 'w-24 text-right')}>Material ₹</th>
                  <th className={cn(th, 'w-24 text-right')}>Labour ₹</th>
                  <th className={cn(th, 'w-24 text-right')}>Other ₹</th>
                  <th className={cn(th, 'w-24 text-right')} title="Material + labour + other">Low Total ₹</th>
                  <th className={cn(th, 'w-24 text-right')}>High Total ₹</th>
                  <th className={cn(th, 'w-[176px] text-center')}>Quote At</th>
                  <th className={cn(th, 'w-28 text-right')}>Quoted ₹</th>
                  {gst && <th className={cn(th, 'w-44 text-left')}>HSN / SAC</th>}
                  {gst && <th className={cn(th, 'w-20 text-center')}>GST %</th>}
                  {!locked && <th className={cn(th, 'w-10 pr-4')} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((item, index) => {
                  const off = !item.included;
                  return (
                    <tr key={item._k} className={cn('align-top transition-colors', off ? 'bg-paper/70' : 'hover:bg-brand-soft/40')}>
                      <td className="py-3 pl-4 text-center">
                        <input type="checkbox" checked={item.included} disabled={locked} onChange={(e) => update(index, { included: e.target.checked })} aria-label={`Include line ${index + 1}`} className="mt-1 h-4 w-4 cursor-pointer accent-[#8A6634]" />
                      </td>
                      <td className={cn('px-2 py-2', off && 'opacity-60')}>
                        <div className="flex items-start gap-1.5">
                          <span className="mt-2 w-5 shrink-0 text-right text-xs font-bold text-muted">{index + 1}.</span>
                          <div className="min-w-0 flex-1">
                            {locked ? (
                              <p className="px-2 py-1.5 text-sm font-medium text-ink">{item.description}</p>
                            ) : (
                              <textarea rows={2} value={item.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Stage / work description" aria-label="Description" title={item.description} className={cn(cell, 'resize-none font-medium leading-snug', !item.description.trim() && 'border-amber-300')} />
                            )}
                            {locked ? (item.notes && <p className="px-2 text-xs text-muted">{item.notes}</p>) : (
                              <input value={item.notes} onChange={(e) => update(index, { notes: e.target.value })} placeholder="Note or assumption (optional)" aria-label="Notes" className={cn(cell, 'mt-0.5 py-1 text-xs text-muted')} />
                            )}
                            {off && <Tag className="ml-2 mt-1 whitespace-nowrap bg-amber-50 text-amber-700">Optional · not included</Tag>}
                          </div>
                        </div>
                      </td>
                      {['material', 'labour', 'other'].map((k) => (
                        <td key={k} className={cn('px-1 py-2', off && 'opacity-60')}><Amount locked={locked} label={k} value={item[k]} onChange={(v) => update(index, { [k]: v })} /></td>
                      ))}
                      <td className={cn('relative px-1 py-2', off && 'opacity-60')}>
                        <Amount locked={locked} label="Low total" value={item.lowRate} onChange={(v) => update(index, { lowRate: v })} className="font-semibold" />
                        {!locked && sumDiffers(item) && <span className="absolute right-0 top-2 h-1.5 w-1.5 rounded-full bg-amber-500" title="Typed by hand: differs from material + labour + other" />}
                      </td>
                      <td className={cn('px-1 py-2', off && 'opacity-60')}>
                        <Amount locked={locked} label="High total" value={item.highRate} invalid={num(item.highRate) < num(item.lowRate)} title={num(item.highRate) < num(item.lowRate) ? 'Cannot be below the low total' : undefined} onChange={(v) => update(index, { highRate: v })} onBlur={() => clampHigh(index, item)} className="font-semibold" />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {locked ? <Tag>{MODE_LABEL[item.rateMode]}</Tag> : <Segmented value={item.rateMode} onChange={(v) => update(index, { rateMode: v })} options={MODES} />}
                      </td>
                      <td className="px-1 py-2">
                        {item.rateMode === 'custom' && !locked ? (
                          <Amount label="Custom amount" value={item.customRate} invalid={item.included && !num(item.customRate)} onChange={(v) => update(index, { customRate: v })} className="border-brand-tint bg-brand-soft font-bold" />
                        ) : (
                          <span className={cn('block px-2 py-1.5 text-right text-sm font-bold tabular-nums', off ? 'text-muted line-through' : 'text-ink')}>{money(quotedOf(item))}</span>
                        )}
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
                        <td className="py-2 pr-4 text-center">
                          <button type="button" onClick={() => remove(index)} className="mt-1.5 text-[#CFCCC4] transition-colors hover:text-red-500" title="Remove line" aria-label={`Remove line ${index + 1}`}><Trash2 size={16} /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-line bg-[#FAFAF8] text-sm font-bold tabular-nums text-ink">
                <tr>
                  <td />
                  <td className="px-4 py-3 whitespace-nowrap text-xs uppercase tracking-widest text-muted">Included lines</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.material)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.labour)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.other)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.low)}</td>
                  <td className="px-3 py-3 text-right">{inr0(totals.high)}</td>
                  <td />
                  <td className="px-3 py-3 text-right text-brand">{inr0(totals.quoted)}</td>
                  {gst && <td />}
                  {gst && <td />}
                  {!locked && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Phones: one card per line. */}
          <div className="divide-y divide-line md:hidden">
            {items.map((item, index) => (
              <div key={item._k} className={cn('space-y-3 p-4', !item.included && 'bg-paper/70')}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-widest text-muted">Line {index + 1}</span>
                    {!item.included && <Tag className="bg-amber-50 text-amber-700">Optional</Tag>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Checkbox label="Include" checked={item.included} disabled={locked} onChange={(e) => update(index, { included: e.target.checked })} className="text-xs font-semibold" />
                    {!locked && <button type="button" onClick={() => remove(index)} className="text-muted hover:text-red-500" aria-label={`Remove line ${index + 1}`}><Trash2 size={17} /></button>}
                  </div>
                </div>
                {locked ? (
                  <div><p className="text-sm font-semibold text-ink">{item.description}</p>{item.notes && <p className="mt-0.5 text-xs text-muted">{item.notes}</p>}</div>
                ) : (
                  <div className="space-y-2">
                    <textarea rows={2} value={item.description} onChange={(e) => update(index, { description: e.target.value })} placeholder="Stage / work description" aria-label="Description" className={cn('erp-input resize-none font-medium', !item.description.trim() && 'border-amber-300')} />
                    <input value={item.notes} onChange={(e) => update(index, { notes: e.target.value })} placeholder="Note or assumption (optional)" aria-label="Notes" className="erp-input py-2 text-xs" />
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {[['material', 'Material'], ['labour', 'Labour'], ['other', 'Other']].map(([k, label]) => (
                    <div key={k}><p className="erp-label text-[10px]">{label} ₹</p><Amount boxed locked={locked} label={label} value={item[k]} onChange={(v) => update(index, { [k]: v })} /></div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="erp-label text-[10px]">Low total ₹</p><Amount boxed locked={locked} label="Low total" value={item.lowRate} onChange={(v) => update(index, { lowRate: v })} className="font-semibold" /></div>
                  <div><p className="erp-label text-[10px]">High total ₹</p><Amount boxed locked={locked} label="High total" value={item.highRate} invalid={num(item.highRate) < num(item.lowRate)} onChange={(v) => update(index, { highRate: v })} onBlur={() => clampHigh(index, item)} className="font-semibold" /></div>
                </div>
                <div className="flex items-end justify-between gap-3 rounded-lg bg-paper/70 p-2.5">
                  <div>
                    <p className="erp-label text-[10px]">Quote at</p>
                    {locked ? <Tag>{MODE_LABEL[item.rateMode]}</Tag> : <Segmented value={item.rateMode} onChange={(v) => update(index, { rateMode: v })} options={MODES} />}
                  </div>
                  <div className="min-w-0 flex-1 text-right">
                    <p className="erp-label text-[10px]">Quoted</p>
                    {item.rateMode === 'custom' && !locked
                      ? <Amount boxed label="Custom amount" value={item.customRate} invalid={item.included && !num(item.customRate)} onChange={(v) => update(index, { customRate: v })} className="font-bold" />
                      : <p className={cn('py-2 text-base font-extrabold tabular-nums', item.included ? 'text-ink' : 'text-muted line-through')}>{money(quotedOf(item))}</p>}
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
            ))}
            <div className="flex items-center justify-between bg-[#FAFAF8] p-4 text-sm font-bold">
              <span className="text-xs uppercase tracking-widest text-muted">Quoted base</span>
              <span className="tabular-nums text-brand">{inr0(totals.quoted)}</span>
            </div>
            {!locked && <button type="button" onClick={add} className="flex w-full items-center justify-center gap-1 p-3.5 text-sm font-bold text-brand hover:bg-brand-soft"><Plus size={14} /> Add Line</button>}
          </div>
        </>
      )}
    </Card>
  );
}
