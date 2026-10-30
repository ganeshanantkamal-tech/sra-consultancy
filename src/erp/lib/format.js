import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs) => twMerge(clsx(inputs));

// All amounts from the API are integer paise.
export const inr = (paise) =>
  `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const inr0 = (paise) => `₹${Math.round(Number(paise || 0) / 100).toLocaleString('en-IN')}`;
// Short form for chart axes and tiles: ₹1.2L, ₹3.4Cr.
export const compactINR = (paise) => {
  const r = Math.abs(Number(paise || 0) / 100);
  const sign = Number(paise) < 0 ? '−' : '';
  if (r >= 1e7) return `${sign}₹${(r / 1e7).toFixed(1)}Cr`;
  if (r >= 1e5) return `${sign}₹${(r / 1e5).toFixed(1)}L`;
  if (r >= 1e3) return `${sign}₹${(r / 1e3).toFixed(1)}K`;
  return `${sign}₹${Math.round(r)}`;
};
// Dr-positive balances shown the accounting way.
export const drCr = (paise) => (Number(paise) ? `${inr(Math.abs(Number(paise)))} ${Number(paise) > 0 ? 'Dr' : 'Cr'}` : inr(0));
export const toPaise = (rupees) => Math.round(Number(rupees || 0) * 100);
export const toRupees = (paise) => Number(paise || 0) / 100;

// Dates from the API are 'YYYY-MM-DD' strings (Indian calendar dates).
export const showDate = (iso) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return d ? `${d}/${m}/${y}` : '—';
};
export const longDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
export const dateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
// toISOString() would give yesterday before 05:30 IST, so build local dates.
export const localDate = (d = new Date()) => d.toLocaleDateString('en-CA');
export const addDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
};

export const downloadCsv = (filename, header, rows) => {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const blob = new Blob(['﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
