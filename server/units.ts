// Units used on structural repair, rehabilitation and design BOQs. Kept in step with
// src/erp/lib/units.js; documents also accept any other short unit the user types.
export const UNIT_GROUPS: [string, string[]][] = [
  ['Area', ['Sqft', 'Sqm', 'Sqyd']],
  ['Length', ['Rft', 'Rmt', 'Mtr', 'Ft', 'Inch', 'mm']],
  ['Volume', ['Cft', 'Cum', 'Brass', 'Ltr', 'KL']],
  ['Weight', ['Kg', 'MT', 'Quintal']],
  ['Count', ['Nos', 'Pcs', 'Set', 'Pair', 'Point', 'Hole', 'Bag', 'Drum', 'Trip', 'Load', 'Location']],
  ['Time', ['Hour', 'Day', 'Week', 'Month', 'Man-day', 'Shift', 'Visit']],
  ['Lump sum', ['LS', 'Job', 'Lot']],
  ['Design & testing', ['Sheet', 'Drawing', 'Report', 'Test', 'Sample', 'Core', 'Floor', 'Flat', 'Wing', 'Building']],
];
export const UNITS = UNIT_GROUPS.flatMap(([, units]) => units);
