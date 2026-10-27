import { useId } from 'react';

// Cross-section of a typical G+1 house. The `step` prop picks which layer shows:
// 0 inspection marks, 1 repair design notes, 2 treatments in gold, 3 quality checks.
// Building parts are drawn in a group shifted 40 units right, leaving room for level markers.

const levels = [
  { y: 146, label: 'Terrace' },
  { y: 316, label: 'First floor' },
  { y: 488, label: 'Plinth' },
  { y: 520, label: 'Ground' },
];

const inspections = [
  { x: 350, y: 166, label: 'Seepage' },
  { x: 185, y: 354, label: 'Leak', left: true },
  { x: 408, y: 398, label: 'Crack' },
  { x: 270, y: 442, label: 'Spalling' },
  { x: 150, y: 474, label: 'Rising damp', left: true },
];

// [element x, element y, note y, text]
const notes = [
  [430, 97, 92, 'D1 Tank waterproofing'],
  [440, 146, 140, 'D2 Terrace waterproofing'],
  [235, 337, 300, 'D3 Sunken slab treatment'],
  [412, 380, 372, 'D4 Crack injection'],
  [276, 430, 424, 'D5 Column jacketing'],
  [446, 488, 482, 'D6 Damp-proof course'],
  [462, 568, 562, 'D7 Footing protection'],
];

const checks = [[386, 97], [300, 137], [190, 336], [408, 398], [270, 414], [230, 487], [270, 568]];

const crack = [[350, 348], [358, 366], [352, 382], [366, 402], [360, 420], [372, 440]];

export default function HouseSection({ step }) {
  // The drawing appears more than once on the page, so pattern and label ids are made unique per copy.
  const uid = useId().replace(/:/g, '');
  const ref = (name) => `url(#${uid}-${name})`;
  return (
    <svg className="house" data-step={step} viewBox="0 0 600 620" role="img" aria-labelledby={`${uid}-title ${uid}-desc`}>
      <title id={`${uid}-title`}>Section through a typical two-storey house</title>
      <desc id={`${uid}-desc`}>
        Where SRA works: overhead tank, terrace, sunken bathroom slab, wall cracks, columns, damp-proof course,
        footings and soil.
      </desc>
      <defs>
        <pattern id={`${uid}-concrete`} width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#ECEBE7" />
          <circle cx="3" cy="3" r=".9" fill="#9A9890" />
          <circle cx="9" cy="8" r=".7" fill="#9A9890" />
          <path d="M6 9 l1.6 2.4 h-3.2z" fill="none" stroke="#9A9890" strokeWidth=".6" />
        </pattern>
        <pattern id={`${uid}-brick`} width="14" height="7" patternUnits="userSpaceOnUse">
          <rect width="14" height="7" fill="#F7F6F3" />
          <path d="M0 7 H14 M7 0 V3.5 M0 3.5 H14 M0 3.5 V7" stroke="#DAD8D2" strokeWidth=".6" fill="none" />
        </pattern>
        <pattern id={`${uid}-tiles`} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#F1F3F3" />
          <path d="M8 0 V8 M0 8 H8" stroke="#C9CFCF" strokeWidth=".6" />
        </pattern>
        <pattern id={`${uid}-soil`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="9" stroke="#C9C6BE" strokeWidth=".8" />
        </pattern>
      </defs>

      {/* level markers */}
      <g className="levels">
        {levels.map((l) => (
          <g key={l.label}>
            <line x1="6" y1={l.y} x2="84" y2={l.y} />
            <path d={`M78 ${l.y} l-4 -6 h8 z`} />
            <text x="6" y={l.y - 5}>{l.label}</text>
          </g>
        ))}
      </g>

      <rect x="0" y="520" width="600" height="100" fill={ref('soil')} />
      <line className="ground" x1="0" y1="520" x2="600" y2="520" />

      <g transform="translate(40 0)">
        {/* walls and openings */}
        <rect className="wall" fill={ref('brick')} x="66" y="160" width="156" height="156" />
        <rect className="wall" fill={ref('brick')} x="238" y="160" width="156" height="156" />
        <rect className="wall" fill={ref('brick')} x="66" y="330" width="156" height="158" />
        <rect className="wall" fill={ref('brick')} x="238" y="330" width="156" height="158" />
        <rect x="66" y="262" width="156" height="54" fill={ref('tiles')} stroke="#C9CFCF" strokeWidth=".6" />
        <rect className="opening" x="170" y="184" width="34" height="22" />
        <rect className="opening" x="284" y="206" width="64" height="52" />
        <line className="thin" x1="316" y1="206" x2="316" y2="258" />
        <rect className="opening" x="112" y="382" width="64" height="52" />
        <line className="thin" x1="144" y1="382" x2="144" y2="434" />
        <rect className="opening" x="286" y="398" width="46" height="90" />
        <rect x="50" y="500" width="360" height="20" fill={ref('brick')} stroke="#1C1C1A" strokeWidth=".8" />

        {/* damage, visible while inspecting and designing */}
        <g className="layer layer-damage">
          <ellipse cx="320" cy="168" rx="46" ry="9" className="stain" />
          <ellipse cx="145" cy="352" rx="42" ry="8" className="stain" />
          <rect x="68" y="466" width="152" height="21" className="stain" />
          <path d="M238 428 l-6 4 l5 6 l-5 5 l6 5 z" fill="#fff" stroke="#1C1C1A" strokeWidth=".8" />
        </g>

        {/* structure */}
        <g className="cut" fill={ref('concrete')}>
          <rect x="50" y="146" width="16" height="414" />
          <rect x="222" y="146" width="16" height="414" />
          <rect x="394" y="146" width="16" height="414" />
          <rect x="28" y="560" width="60" height="16" />
          <rect x="200" y="560" width="60" height="16" />
          <rect x="372" y="560" width="60" height="16" />
          <rect x="50" y="146" width="360" height="14" />
          <rect x="50" y="118" width="8" height="28" />
          <rect x="402" y="118" width="8" height="28" />
          <path d="M50 316 H90 V330 H200 V316 H410 V330 H200 V344 H90 V330 H50 Z" />
          <rect x="50" y="488" width="360" height="12" />
          <rect x="306" y="118" width="6" height="28" />
          <rect x="378" y="118" width="6" height="28" />
        </g>
        <g className="thin" strokeDasharray="3 3">
          <rect x="22" y="576" width="72" height="6" />
          <rect x="194" y="576" width="72" height="6" />
          <rect x="366" y="576" width="72" height="6" />
        </g>
        <rect className="tank" x="300" y="76" width="90" height="42" />
        <line className="water-line" x1="304" y1="92" x2="386" y2="92" />
        <line className="thin" x1="300" y1="146" x2="320" y2="160" />
        <polyline className="crack" points="300,146 306,151 302,156 308,160" />
        <polyline className="crack" points={crack.map((p) => p.join(',')).join(' ')} />

        {/* 2: treatments */}
        <g className="layer layer-treat">
          <path className="gold" d="M58 120 V144.5 H402 V120" />
          <rect className="gold gold-thin" x="303" y="79" width="84" height="36" />
          <path className="gold" d="M90 316 V328.5 H200 V316" />
          {crack.slice(0, -1).map(([x, y], i) => (
            <line key={i} className="gold gold-thin" x1={x - 6} y1={y + 6} x2={x + 6} y2={y + 4} />
          ))}
          <rect className="gold gold-fill" x="216" y="344" width="28" height="144" />
          <line className="gold" x1="50" y1="486.5" x2="410" y2="486.5" />
          <g className="gold gold-thin">
            <rect x="26" y="558" width="64" height="20" />
            <rect x="198" y="558" width="64" height="20" />
            <rect x="370" y="558" width="64" height="20" />
          </g>
          <g className="gold gold-thin" strokeDasharray="3 4">
            {[36, 58, 80, 208, 230, 252, 380, 402, 424].map((x) => <line key={x} x1={x} y1="588" x2={x} y2="612" />)}
          </g>
        </g>
      </g>

      {/* 0: inspection marks */}
      <g className="layer layer-inspect">
        {inspections.map((m) => (
          <g key={m.label}>
            <circle cx={m.x} cy={m.y} r="13" />
            <text x={m.left ? m.x - 18 : m.x + 18} y={m.y + 4} textAnchor={m.left ? 'end' : 'start'}>{m.label}</text>
          </g>
        ))}
      </g>

      {/* 1: repair design notes */}
      <g className="layer layer-design">
        {notes.map(([x, y, ny, text], i) => (
          <g key={text}>
            <polyline points={`${x},${y} ${x + 12},${ny} 470,${ny}`} />
            <circle cx={x} cy={y} r="9" />
            <text className="bubble" x={x} y={y + 3.5} textAnchor="middle">{i + 1}</text>
            <text className="note-text" x="474" y={ny + 4}>{text}</text>
          </g>
        ))}
      </g>

      {/* 3: quality checks */}
      <g className="layer layer-check">
        {checks.map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <circle cx={x} cy={y} r="9" />
            <path d={`M${x - 4} ${y} l3 3 l5 -6`} />
          </g>
        ))}
      </g>
    </svg>
  );
}
