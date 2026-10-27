export const PHONE_MAIN = { display: '98229 40697', tel: '+919822940697', whatsapp: '919822940697' };

export const navLinks = [
  { href: '#expertise', label: 'Expertise' },
  { href: '#services', label: 'Services' },
  { href: '#process', label: 'Process' },
  { href: '#buildings', label: 'Buildings' },
  { href: '#materials', label: 'Materials' },
  { href: '#contact', label: 'Contact' },
];

export const buildingTypes = [
  'Residential building',
  'Bungalow',
  'Multi-storey building',
  'Commercial building',
  'Industrial building',
  'Government office building',
  'Road, bridge or civil structure',
  'Building under construction',
];

export const services = [
  {
    tag: 'Structural',
    short: 'Structural repair',
    title: 'Structural repair & rehabilitation',
    image: '/images/tile-structural.jpg',
    alt: 'Worker in a hard hat repairing a concrete beam with a trowel',
    items: [
      'Structural audits and condition assessment',
      'RCC repair and rehabilitation',
      'Crack repair and injection grouting',
      'Column, beam, slab and foundation repair',
      'Concrete repair and restoration',
      'Structural strengthening',
      'Corrosion control and protective treatments',
    ],
  },
  {
    tag: 'Waterproofing',
    short: 'Waterproofing',
    title: 'Waterproofing solutions',
    image: '/images/tile-waterproofing.jpg',
    alt: 'Worker applying a protective coating to a wall',
    items: [
      'Terrace waterproofing',
      'Bathroom and wet area waterproofing',
      'Basement waterproofing',
      'Water tank waterproofing',
      'External wall waterproofing',
      'Podium and terrace garden waterproofing',
      'Leakage investigation and remedial solutions',
    ],
  },
  {
    tag: 'Consultancy',
    short: 'Consultancy',
    title: 'Technical consultancy',
    image: '/images/tile-consultancy.jpg',
    alt: 'Site engineer in a hard hat and safety vest holding a clipboard',
    items: [
      'Building health assessment',
      'Repair methodology design and implementation',
      'Project monitoring and supervision',
      'Quality control and technical support during construction',
    ],
  },
];

// `icon` is a lucide-react icon name, resolved in Buildings.jsx
export const buildings = [
  { icon: 'Building2', title: 'Residential buildings', note: 'Terraces, bathrooms, tanks and wall cracks', tags: ['Waterproofing', 'Structural repair'] },
  { icon: 'House', title: 'Bungalows', note: 'Terrace gardens, sunken slabs and damp walls', tags: ['Waterproofing', 'Structural repair'] },
  { icon: 'Building', title: 'Multi-storey buildings', note: 'Basements, lift pits, podiums and façades', tags: ['Waterproofing', 'Structural repair'] },
  { icon: 'Store', title: 'Commercial buildings', note: 'Floor treatment, expansion joints and façades', tags: ['Waterproofing', 'Structural repair'] },
  { icon: 'Factory', title: 'Industrial buildings', note: 'Industrial floors, sheet roofing and retrofitting', tags: ['Waterproofing', 'Structural repair'] },
  { icon: 'Landmark', title: 'Government offices', note: 'Structural audits, repairs and waterproofing', tags: ['Waterproofing', 'Structural repair'] },
  { icon: 'Route', title: 'Roads, bridges & canals', note: 'Concrete roads, bridges, dams, retaining walls, culverts and sewerage lines', tags: ['Structural repair'] },
  { icon: 'HardHat', title: 'New construction', note: 'From soil stabilisation to slab casting', tags: ['Structural enhancement'] },
];

// Scroll story on the home page. Images are a matched pair: same room, same camera angle.
// Hotspot x/y are percentages of the image, so they stay pinned to the damage at any screen size.
export const story = {
  before: { src: '/images/story-before.jpg', alt: 'Modern living room with a brown damp patch and crack on the ceiling, fungus in the corner, peeling paint on the wall and a bucket catching drips' },
  after: { src: '/images/story-after.jpg', alt: 'The same living room after repair: clean ceiling and walls in warm evening light' },
  steps: [
    { label: 'Leaking ceiling', meta: 'Before', text: 'Monsoon water seeps through the terrace slab. The ceiling stains, paint peels, fungus spreads and cracks open.' },
    { label: 'Site inspection', meta: 'Diagnosis', text: 'We trace the source on the terrace: cracks, failed joints or blocked outlets, and check the slab below.' },
    { label: 'Waterproofing & repair', meta: 'Treatment', text: 'Crack injection and terrace waterproofing above, then plaster repair and anti-fungal primer inside.' },
    { label: 'Dry and repainted', meta: 'After', text: 'A dry ceiling and clean walls, with the terrace protected for the seasons ahead.' },
  ],
  beforeSpots: [
    { x: 37, y: 11, label: 'Seepage from the terrace' },
    { x: 53, y: 10, label: 'Ceiling crack' },
    { x: 83, y: 7, label: 'Fungus in the corner' },
    { x: 84, y: 46, label: 'Peeling paint & efflorescence' },
  ],
  afterSpots: [
    { x: 37, y: 11, label: 'Terrace waterproofed' },
    { x: 53, y: 10, label: 'Crack injected & sealed' },
    { x: 84, y: 46, label: 'Plaster repaired, anti-fungal paint' },
  ],
};

export const process = [
  {
    title: 'Building health assessment',
    text: 'We inspect the site, trace the source of the leak or crack, and assess the structure.',
    image: '/images/process-1.jpg',
    alt: 'Hand pressing a moisture meter against a damp, stained ceiling while holding an inspection checklist',
  },
  {
    title: 'Repair method design',
    text: 'An engineer specifies the repair method and the right materials for your structure.',
    image: '/images/process-2.jpg',
    alt: 'Hand sketching a house cross-section beside site photos of a damp ceiling and material data sheets',
  },
  {
    title: 'Execution and material supply',
    text: 'Our team carries out the work, using materials from authorised brands.',
    image: '/images/process-3.jpg',
    alt: 'Gloved hands rolling a grey waterproofing coat onto a flat terrace, with a fillet at the parapet wall',
  },
  {
    title: 'Monitoring and quality control',
    text: 'We supervise each stage and check the quality until handover.',
    image: '/images/process-4.jpg',
    alt: 'Finished terrace holding water for a ponding test at sunset, with a ticked checklist on the parapet',
  },
];

export const stages = [
  {
    id: 'before',
    title: 'Before construction',
    summary: 'Prepare the ground and foundation so problems never start.',
    items: [
      'Soil stabilisation',
      'Raft slab casting and anchoring',
      'Footing casting with waterproofing and protection from damage',
    ],
  },
  {
    id: 'during',
    title: 'During construction',
    summary: 'Build waterproofing and strength into the structure as it goes up.',
    items: [
      'Bottom beam and plinth beam casting',
      'Damp-proof treatment',
      'Protection of columns and beams from damage',
      'Slab casting with waterproofing and strength enhancement',
      'Joint treatments while work is in progress',
      'Plastering and waterproof exterior plaster',
      'Expansion joints',
      'Rebaring for extensions',
      'Basement waterproof slab and retaining wall casting',
    ],
  },
  {
    id: 'after',
    title: 'After construction',
    summary: 'Find and fix leaks, damp and structural damage in existing buildings.',
    groups: [
      {
        title: 'Waterproofing',
        items: [
          'Bathrooms, toilets and wash areas',
          'Terraces, balconies and chhajjas',
          'Sunken areas of all types',
          'Podiums and terrace gardens',
          'Basements and lift pits',
          'Overhead and underground tanks',
          'Sewerage tanks and swimming pools',
          'Interior walls, exterior walls and façades',
          'Rising damp and efflorescence',
          'Water repellent and fungus protection',
          'Tiles and joints',
          'Metal and ACC sheet roofing repairs',
        ],
      },
      {
        title: 'Structural',
        items: [
          'Retrofitting of columns, beams and slabs',
          'Pressure grouting',
          'Building settlement recovery',
          'Extended slab joint treatment',
          'Industrial and commercial floor treatment',
        ],
      },
    ],
  },
];

// `icon` is a lucide-react icon name, resolved in Problems.jsx
export const problems = [
  { icon: 'Activity', title: 'Floor and wall cracks' },
  { icon: 'Grid3x3', title: 'Honeycombing in concrete' },
  { icon: 'Layers', title: 'Failed concrete joints' },
  { icon: 'Ruler', title: 'Insufficient concrete thickness' },
  { icon: 'Waves', title: 'Columns and beams in water tanks, sewerage tanks and channels' },
  { icon: 'Columns3', title: 'Retrofitting and jacketing of columns, beams and slabs' },
  { icon: 'BrickWall', title: 'Seepage and leakage through retaining walls' },
  { icon: 'Droplets', title: 'Rising damp, efflorescence and fungus' },
];

export const materials = [
  'Waterproofing chemicals',
  'Construction chemicals',
  'Repair mortars and grouts',
  'Sealants and adhesives',
  'Admixtures',
  'Epoxy systems',
  'Protective coatings',
  'Specialised repair products',
];

export const brands = [
  { company: 'Kansai Nerolac Paints Ltd.', brand: 'Nerolac Perma' },
  { company: 'Pidilite Industries Ltd.', brand: 'Dr. Fixit' },
  { company: 'UltraTech Cement Ltd.', brand: 'Building Products Division' },
  { company: 'Cera Chem Pvt. Ltd.' },
  { company: 'Zydex Industries Ltd.' },
  { company: 'Calisto Chemicals Pvt. Ltd.' },
];

export const reasons = [
  { icon: 'BadgeCheck', title: 'Technical expertise', text: 'Every repair is designed by an engineer before work starts.' },
  { icon: 'IndianRupee', title: 'Cost-effective', text: 'We treat the cause, so you do not pay for the same leak twice.' },
  { icon: 'Package', title: 'Reliable supply', text: 'Materials come from our own supply office and authorised brands.' },
  { icon: 'Clock', title: 'On-time execution', text: 'Work is monitored and supervised through to completion.' },
];

export const offices = [
  {
    label: 'Head office',
    address: 'Shop No. 100, New Cloth Market, Beside Shrikrishna Dwar, Akola',
    person: 'Abhay Suresh Aher, B.E.',
    phone: { display: '98229 40697', tel: '+919822940697' },
  },
  {
    label: 'Material supply office',
    address: 'M/s. Shriram Rajaram Aher, Old City, Shivcharan Peth, Akola',
    phone: { display: '98817 35125', tel: '+919881735125' },
  },
  {
    label: 'Technical works support',
    person: 'Rajendra S. Chotmol',
    phone: { display: '84214 75155', tel: '+918421475155' },
  },
];

export const hero = {
  kicker: 'Structural and waterproofing consultants, Akola',
  title: 'Know the cause',
  accent: 'before you pay for the repair',
  lede: 'We inspect leaks, cracks and weak structures, design the right repair and supervise it until it is done. Led by Abhay Suresh Aher, B.E.',
  proof: [
    'Structural audits and repair design by a B.E. engineer',
    'Authorised technical support for Dr. Fixit, Nerolac Perma, Zydex and more',
    'Work supervised until handover',
  ],
};

export const expertise = {
  paragraphs: [
    'SRA Consultancy is a professionally managed consultancy and service organisation specialising in structural repair, rehabilitation, waterproofing and material supply.',
    'We give technical expertise and practical solutions for new construction, and for the restoration, protection, strengthening and maintenance of older residential, commercial, industrial and institutional structures.',
  ],
  photo: { src: '/images/engineer.jpg', alt: 'Site engineer in a hard hat holding a clipboard at a construction site' },
};

export const materialsNote = 'Materials of other brands and grades are supplied as your site requires.';

export const footerCta = {
  title: 'Seeing a damp patch or a crack?',
  accent: 'Get it checked before the monsoon.',
};

export function whatsappLink(lines, number = PHONE_MAIN.whatsapp) {
  const text = lines.filter((line) => line !== null).join('\n');
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
