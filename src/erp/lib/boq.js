// Bill-of-quantities helpers shared by quotations, invoices, credit notes and site estimates.

// Units used on structural repair, rehabilitation and design work. Kept in step with
// server/units.ts; any other short unit can still be typed.
export const UNIT_GROUPS = [
  ['Area', [['Sqft', 'Square feet'], ['Sqm', 'Square metre'], ['Sqyd', 'Square yard']]],
  ['Length', [['Rft', 'Running feet'], ['Rmt', 'Running metre'], ['Mtr', 'Metre'], ['Ft', 'Feet'], ['Inch', 'Inch'], ['mm', 'Millimetre']]],
  ['Volume', [['Cft', 'Cubic feet'], ['Cum', 'Cubic metre'], ['Brass', 'Brass (100 cft)'], ['Ltr', 'Litre'], ['KL', 'Kilolitre']]],
  ['Weight', [['Kg', 'Kilogram'], ['MT', 'Metric tonne'], ['Quintal', 'Quintal (100 kg)']]],
  ['Count', [['Nos', 'Numbers'], ['Pcs', 'Pieces'], ['Set', 'Set'], ['Pair', 'Pair'], ['Point', 'Point (electrical / plumbing)'], ['Hole', 'Hole (core / anchor / grout)'], ['Bag', 'Bag (cement)'], ['Drum', 'Drum'], ['Trip', 'Trip (debris / material)'], ['Load', 'Load'], ['Location', 'Location']]],
  ['Time', [['Hour', 'Hour'], ['Day', 'Day'], ['Week', 'Week'], ['Month', 'Month'], ['Man-day', 'Man-day'], ['Shift', 'Shift'], ['Visit', 'Site visit']]],
  ['Lump sum', [['LS', 'Lump sum'], ['Job', 'Job'], ['Lot', 'Lot']]],
  ['Design & testing', [['Sheet', 'Drawing sheet'], ['Drawing', 'Drawing'], ['Report', 'Report'], ['Test', 'Test (NDT / lab)'], ['Sample', 'Sample'], ['Core', 'Core (concrete core test)'], ['Floor', 'Floor'], ['Flat', 'Flat'], ['Wing', 'Wing'], ['Building', 'Building']]],
];
export const UNITS = UNIT_GROUPS.flatMap(([, units]) => units.map(([code]) => code));
export const unitLabel = (code) => UNIT_GROUPS.flatMap(([, u]) => u).find(([c]) => c === code)?.[1] || code;

// Sr. No. as on a BOQ (same rule as server/sales.ts serialNumbers): sections A, B…; items and
// description-only groups 1, 2… restarting in each section; sub-items a), b)… under the item
// above. A typed ref overrides the automatic one.
export function serialNumbers(lines) {
  let sections = 0;
  let number = 0;
  let sub = 0;
  return lines.map((line) => {
    if (line.kind === 'section') { sections += 1; number = 0; sub = 0; return line.ref || String.fromCharCode(64 + ((sections - 1) % 26) + 1); }
    if (line.kind !== 'group' && Number(line.level) === 2) { sub += 1; return line.ref || `${String.fromCharCode(96 + ((sub - 1) % 26) + 1)})`; }
    number += 1; sub = 0; return line.ref || String(number);
  });
}

export const LINE_KINDS = [
  ['item', 'Item', 'Priced line: description, unit, qty and rate'],
  ['sub', 'Sub-item', 'Lettered a), b) line under the item above'],
  ['group', 'Description only', 'Numbered specification with no amount, followed by sub-items'],
  ['section', 'Section heading', 'A. Preparatory works, B. Structural repair works…'],
];
