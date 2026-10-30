// Port of the ERP's shared <DataTable />: search, sortable columns, selection toolbar,
// pagination with a remembered page size, skeleton rows, and a card layout on phones.
// Columns: { key, label, sortable, align, render(value, row), hideOnTablet, width,
//            primaryLabel, secondaryLabel, primaryAmount, sortValue(row), searchValue(row) }
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp, Download, Inbox, Search, Trash2, X } from 'lucide-react';
import { cn } from '../lib/format.js';

const alignClass = (a) => (a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left');
const keyOf = (row, index, rowKey) => (rowKey ? rowKey(row, index) : String(row?.id ?? index));

export default function DataTable({
  columns,
  data,
  isLoading = false,
  searchable = true,
  searchPlaceholder = 'Search…',
  defaultPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  emptyMessage = 'No records found',
  emptyHint = 'Try adjusting your search or filters',
  emptyAction,
  selectable = false,
  onSelectionChange,
  storageKey = 'erp_table_size',
  rowKey,
  onRowClick,
  onDeleteSelected,
  onExportSelected,
  onVisibleRowsChange,
  paginated = true,
  footer,
  toolbar,
  minWidth = '640px',
  rowClassName,
  className,
}) {
  const [pageSize, setPageSize] = useState(() => {
    try { const saved = parseInt(localStorage.getItem(storageKey) || '', 10); if (saved > 0) return saved; } catch { /* ignore */ }
    return defaultPageSize;
  });
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState(null);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => { const t = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setPage(1); }, [debounced, data]);
  useEffect(() => { try { localStorage.setItem(storageKey, String(pageSize)); } catch { /* ignore */ } }, [pageSize, storageKey]);

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return data;
    return data.filter((row) => {
      const custom = columns.map((c) => (c.searchValue ? c.searchValue(row) : '')).join(' ');
      return `${custom} ${Object.values(row || {}).filter((v) => typeof v === 'string' || typeof v === 'number').join(' ')}`.toLowerCase().includes(q);
    });
  }, [data, debounced, columns]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    const get = (row) => (col?.sortValue ? col.sortValue(row) : row?.[sort.key]);
    return [...filtered].sort((a, b) => {
      const av = get(a); const bv = get(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const an = Number(av); const bn = Number(bv);
      const numeric = av !== '' && bv !== '' && !Number.isNaN(an) && !Number.isNaN(bn) && typeof av !== 'boolean';
      const cmp = numeric ? an - bn : String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sort, columns]);

  const lastVisible = useRef(null);
  useEffect(() => {
    if (!onVisibleRowsChange) return;
    const prev = lastVisible.current;
    if (prev && prev.length === sorted.length && prev.every((r, i) => r === sorted[i])) return;
    lastVisible.current = sorted;
    onVisibleRowsChange(sorted);
  }, [sorted, onVisibleRowsChange]);

  const total = sorted.length;
  const pageCount = paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const current = Math.min(page, pageCount);
  const rows = useMemo(() => (paginated ? sorted.slice((current - 1) * pageSize, current * pageSize) : sorted), [sorted, current, pageSize, paginated]);

  const selectedRows = useMemo(() => sorted.filter((r, i) => selected.has(keyOf(r, i, rowKey))), [sorted, selected, rowKey]);
  useEffect(() => { onSelectionChange?.(selectedRows); }, [selectedRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageKeys = rows.map((r, i) => keyOf(r, (current - 1) * pageSize + i, rowKey));
  const allSelected = pageKeys.length > 0 && pageKeys.every((k) => selected.has(k));
  const toggleAll = () => setSelected((prev) => { const next = new Set(prev); pageKeys.forEach((k) => (allSelected ? next.delete(k) : next.add(k))); return next; });
  const toggle = useCallback((k) => setSelected((prev) => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; }), []);

  const onSort = (col) => {
    if (!col.sortable) return;
    setSort((prev) => ({ key: col.key, dir: prev?.key === col.key && prev.dir === 'asc' ? 'desc' : 'asc' }));
    setPage(1);
  };

  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = paginated ? Math.min(current * pageSize, total) : total;
  const colSpan = columns.length + (selectable ? 1 : 0);
  const buttons = useMemo(() => {
    if (pageCount <= 5) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const mid = [current - 1, current, current + 1].filter((p) => p > 1 && p < pageCount);
    const out = [1];
    if (mid[0] > 2) out.push('…');
    out.push(...mid);
    if (mid[mid.length - 1] < pageCount - 1) out.push('…');
    out.push(pageCount);
    return out;
  }, [pageCount, current]);
  const cell = (col, row) => (col.render ? col.render(row?.[col.key], row) : row?.[col.key] ?? '');
  const empty = (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <Inbox size={48} strokeWidth={1.25} className="mb-3 text-brand-gold/50" />
      <p className="text-base font-bold text-ink">{emptyMessage}</p>
      <p className="mt-1 text-sm text-muted">{query ? 'Try adjusting your search or filters' : emptyHint}</p>
      {emptyAction && !query && <div className="mt-4">{emptyAction}</div>}
    </div>
  );

  return (
    <div className={cn('w-full', className)}>
      {selectable && (
        <div className={cn('overflow-hidden transition-all duration-300 ease-out', selected.size ? 'mb-3 max-h-20 opacity-100' : 'max-h-0 opacity-0')}>
          <div className="flex items-center justify-between gap-4 rounded-lg bg-olive px-4 py-3 text-white shadow-sm">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSelected(new Set())} className="rounded p-1 transition-colors hover:bg-white/10" title="Clear selection"><X size={18} /></button>
              <span className="text-sm font-semibold">{selected.size} row{selected.size === 1 ? '' : 's'} selected</span>
            </div>
            <div className="flex items-center gap-2">
              {onDeleteSelected && <button type="button" onClick={() => onDeleteSelected(selectedRows)} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-white/10"><Trash2 size={16} /> Delete</button>}
              {onExportSelected && <button type="button" onClick={() => onExportSelected(selectedRows)} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium hover:bg-white/10"><Download size={16} /> Export selected</button>}
            </div>
          </div>
        </div>
      )}

      {(searchable || toolbar) && (
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center">
          {searchable && (
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full rounded-lg border border-line bg-white py-2.5 pl-10 pr-10 text-sm text-ink outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/25"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted hover:bg-paper hover:text-ink" title="Clear search"><X size={16} /></button>}
            </div>
          )}
          {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
        </div>
      )}

      <div className="rounded-lg border border-line bg-white shadow-sm">
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse" style={{ minWidth }}>
            <thead>
              <tr className="bg-[#FAFAF8]">
                {selectable && <th className="w-10 px-4 py-3 text-left"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 cursor-pointer accent-[#8A6634]" aria-label="Select all rows on this page" /></th>}
                {columns.map((col) => {
                  const active = sort?.key === col.key;
                  return (
                    <th key={col.key} onClick={() => onSort(col)} style={{ width: col.width }}
                      className={cn('group whitespace-nowrap px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted', alignClass(col.align), col.sortable && 'cursor-pointer select-none hover:text-ink', col.hideOnTablet && 'hidden lg:table-cell')}>
                      <span className={cn('inline-flex items-center gap-1', col.align === 'right' && 'flex-row-reverse')}>
                        {col.label}
                        {col.sortable && (active ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />) : <ChevronsUpDown size={13} className="opacity-0 transition-opacity group-hover:opacity-50" />)}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {isLoading ? Array.from({ length: 5 }).map((_, r) => (
                <tr key={`sk-${r}`} className="border-b border-line">
                  {selectable && <td className="px-4 py-4"><div className="h-4 w-4 animate-pulse rounded bg-paper" /></td>}
                  {columns.map((col, c) => <td key={col.key} className={cn('px-6 py-4', col.hideOnTablet && 'hidden lg:table-cell')}><div className={cn('h-4 animate-pulse rounded bg-[#EEEDE9]', col.align === 'right' && 'ml-auto')} style={{ width: `${[70, 55, 85, 40, 60][(c + r) % 5]}%` }} /></td>)}
                </tr>
              )) : rows.length === 0 ? (
                <tr><td colSpan={colSpan}>{empty}</td></tr>
              ) : rows.map((row, i) => {
                const k = keyOf(row, (current - 1) * pageSize + i, rowKey);
                const isSel = selected.has(k);
                return (
                  <tr key={k} onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn('h-[52px] border-b border-line transition-colors last:border-b-0', onRowClick && 'cursor-pointer', isSel ? 'bg-brand-tint shadow-[inset_3px_0_0_0_#8A6634]' : 'hover:bg-brand-soft', rowClassName?.(row))}>
                    {selectable && <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={isSel} onChange={() => toggle(k)} className="h-4 w-4 cursor-pointer accent-[#8A6634]" aria-label="Select row" /></td>}
                    {columns.map((col) => <td key={col.key} className={cn('px-6 py-3 text-sm text-ink', alignClass(col.align), col.hideOnTablet && 'hidden lg:table-cell')}>{cell(col, row)}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="md:hidden">
          {isLoading ? Array.from({ length: 4 }).map((_, r) => (
            <div key={`mc-${r}`} className="space-y-2 border-b border-line p-4"><div className="h-4 w-1/2 animate-pulse rounded bg-paper" /><div className="h-3 w-1/3 animate-pulse rounded bg-paper" /></div>
          )) : rows.length === 0 ? empty : rows.map((row, i) => {
            const k = keyOf(row, (current - 1) * pageSize + i, rowKey);
            const isSel = selected.has(k);
            const primary = columns.find((c) => c.primaryLabel);
            const secondary = columns.find((c) => c.secondaryLabel);
            const amount = columns.find((c) => c.primaryAmount);
            const rest = columns.filter((c) => c !== primary && c !== secondary && c !== amount);
            return (
              <div key={k} onClick={onRowClick ? () => onRowClick(row) : undefined} className={cn('border-b border-line p-4 last:border-b-0', onRowClick && 'cursor-pointer', isSel && 'bg-brand-tint')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    {selectable && <input type="checkbox" checked={isSel} onClick={(e) => e.stopPropagation()} onChange={() => toggle(k)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#8A6634]" aria-label="Select row" />}
                    <div className="min-w-0">
                      {primary && <div className="truncate text-sm font-bold text-ink">{cell(primary, row)}</div>}
                      {secondary && <div className="truncate text-xs text-muted">{cell(secondary, row)}</div>}
                    </div>
                  </div>
                  {amount && <div className="shrink-0 text-right text-sm font-bold">{cell(amount, row)}</div>}
                </div>
                {rest.length > 0 && (
                  <div className="mt-3 grid grid-cols-1 gap-1.5">
                    {rest.map((col) => (
                      <div key={col.key} className="flex items-center justify-between gap-3 text-xs">
                        {col.label && <span className="uppercase tracking-wide text-muted">{col.label}</span>}
                        <span className="text-right text-ink" onClick={(e) => col.key === 'actions' && e.stopPropagation()}>{cell(col, row) || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {footer && !isLoading && rows.length > 0 && <div className="border-t border-line">{footer}</div>}
      </div>

      {paginated && !isLoading && total > 0 && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="hidden sm:inline">Rows per page:</span>
            <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }} className="rounded-md border border-line bg-white px-2 py-1 text-sm text-ink outline-none">
              {pageSizeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <span className="whitespace-nowrap">Showing {first}–{last} of {total}</span>
          </div>
          <div className="hidden items-center gap-1 sm:flex">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current <= 1} className="flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-paper disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16} /></button>
            {buttons.map((b, idx) => b === '…'
              ? <span key={`e${idx}`} className="px-2 text-sm text-muted">…</span>
              : <button type="button" key={b} onClick={() => setPage(b)} className={cn('flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-medium transition-colors', b === current ? 'border-brand bg-brand text-white' : 'border-line text-ink hover:bg-paper')}>{b}</button>)}
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={current >= pageCount} className="flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-paper disabled:opacity-40" aria-label="Next page"><ChevronRight size={16} /></button>
          </div>
          <div className="flex items-center justify-between gap-3 sm:hidden">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={current <= 1} className="flex h-9 w-9 items-center justify-center rounded-md border border-line disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={18} /></button>
            <span className="text-sm text-muted">Page {current} of {pageCount}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={current >= pageCount} className="flex h-9 w-9 items-center justify-center rounded-md border border-line disabled:opacity-40" aria-label="Next page"><ChevronRight size={18} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
