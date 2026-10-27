// The CMS content model, shared by the website and the /admin panel.
//
// "Stored" content is what the admin edits and what is saved (cms/content.json in Blob storage).
// "Display" content is what the page components read. defaultStored() is built from data.js, so the
// site looks the same before anything has been saved, and withDefaults() fills any gap in saved
// content from it.

import * as data from '../data.js';

const digits = (value) => String(value || '').replace(/\D/g, '').slice(-10);

export function defaultStored() {
  return {
    phone: { display: data.PHONE_MAIN.display, whatsapp: digits(data.PHONE_MAIN.whatsapp) },
    offices: data.offices.map((o) => ({ label: o.label, address: o.address || '', person: o.person || '', phone: o.phone.display })),
    hero: { ...data.hero, proof: [...data.hero.proof] },
    expertise: {
      paragraphs: [...data.expertise.paragraphs],
      photo: { ...data.expertise.photo },
      reasons: data.reasons.map(({ title, text }) => ({ title, text })),
    },
    services: data.services.map((s) => ({ ...s, items: [...s.items] })),
    story: {
      before: { ...data.story.before },
      after: { ...data.story.after },
      steps: data.story.steps.map((s) => ({ ...s })),
      beforeSpots: data.story.beforeSpots.map((s) => ({ ...s })),
      afterSpots: data.story.afterSpots.map((s) => ({ ...s })),
      isIllustration: true,
    },
    process: { steps: data.process.map((s) => ({ ...s })), isIllustration: true },
    stages: {
      before: { summary: data.stages[0].summary, items: [...data.stages[0].items] },
      during: { summary: data.stages[1].summary, items: [...data.stages[1].items] },
      after: {
        summary: data.stages[2].summary,
        waterproofing: [...data.stages[2].groups[0].items],
        structural: [...data.stages[2].groups[1].items],
      },
    },
    buildings: data.buildings.map((b) => ({ ...b, tags: [...b.tags] })),
    problems: data.problems.map((p) => ({ ...p })),
    materials: { list: [...data.materials], brands: data.brands.map((b) => ({ company: b.company, brand: b.brand || '' })), note: data.materialsNote },
    footer: { ...data.footerCta },
    projects: [],
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, fallback) => (typeof v === 'string' && v.trim() ? v : fallback);
const list = (v, fallback) => (Array.isArray(v) && v.length ? v : fallback);
const photo = (v, fallback) => (isObj(v) && typeof v.src === 'string' && v.src ? { src: v.src, alt: v.alt || '' } : fallback);
const flag = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

// Saved content with every gap filled from the defaults. Text left empty falls back so the design never
// shows a blank headline; the two four-step sections fall back unless they have exactly four steps.
export function withDefaults(saved) {
  const d = defaultStored();
  const s = isObj(saved) ? saved : {};
  const sec = (key) => (isObj(s[key]) ? s[key] : {});

  const phone = sec('phone');
  const hero = sec('hero');
  const exp = sec('expertise');
  const story = sec('story');
  const proc = sec('process');
  const st = sec('stages');
  const mat = sec('materials');
  const foot = sec('footer');
  const stage = (key) => (isObj(st[key]) ? st[key] : {});

  return {
    phone: { display: text(phone.display, d.phone.display), whatsapp: digits(phone.whatsapp).length === 10 ? digits(phone.whatsapp) : d.phone.whatsapp },
    offices: list(s.offices, d.offices),
    hero: {
      kicker: text(hero.kicker, d.hero.kicker),
      title: text(hero.title, d.hero.title),
      accent: text(hero.accent, d.hero.accent),
      lede: text(hero.lede, d.hero.lede),
      proof: list(hero.proof, d.hero.proof),
    },
    expertise: {
      paragraphs: list(exp.paragraphs, d.expertise.paragraphs),
      photo: photo(exp.photo, d.expertise.photo),
      reasons: list(exp.reasons, d.expertise.reasons),
    },
    services: list(s.services, d.services),
    story: {
      before: photo(story.before, d.story.before),
      after: photo(story.after, d.story.after),
      steps: Array.isArray(story.steps) && story.steps.length === 4 ? story.steps : d.story.steps,
      beforeSpots: list(story.beforeSpots, d.story.beforeSpots),
      afterSpots: list(story.afterSpots, d.story.afterSpots),
      isIllustration: flag(story.isIllustration, true),
    },
    process: {
      steps: Array.isArray(proc.steps) && proc.steps.length === 4 ? proc.steps : d.process.steps,
      isIllustration: flag(proc.isIllustration, true),
    },
    stages: {
      before: { summary: text(stage('before').summary, d.stages.before.summary), items: list(stage('before').items, d.stages.before.items) },
      during: { summary: text(stage('during').summary, d.stages.during.summary), items: list(stage('during').items, d.stages.during.items) },
      after: {
        summary: text(stage('after').summary, d.stages.after.summary),
        waterproofing: list(stage('after').waterproofing, d.stages.after.waterproofing),
        structural: list(stage('after').structural, d.stages.after.structural),
      },
    },
    buildings: list(s.buildings, d.buildings),
    problems: list(s.problems, d.problems),
    materials: { list: list(mat.list, d.materials.list), brands: list(mat.brands, d.materials.brands), note: typeof mat.note === 'string' ? mat.note : d.materials.note },
    footer: { title: text(foot.title, d.footer.title), accent: text(foot.accent, d.footer.accent) },
    projects: Array.isArray(s.projects) ? s.projects : [],
  };
}

const phoneOf = (display) => ({ display, tel: `+91${digits(display)}` });

// Stored content -> the shape the page components read.
export function toDisplay(stored) {
  const c = withDefaults(stored);
  const d = defaultStored();
  return {
    phone: { ...phoneOf(c.phone.display), whatsapp: `91${c.phone.whatsapp}` },
    offices: c.offices.map((o) => ({ label: o.label, address: o.address, person: o.person, phone: phoneOf(o.phone) })),
    hero: c.hero,
    expertise: c.expertise,
    services: c.services.map((sv, i) => ({ ...sv, items: sv.items || [], image: sv.image || d.services[i % d.services.length].image, alt: sv.alt || '' })),
    story: c.story,
    process: {
      steps: c.process.steps.map((step, i) => ({ ...step, image: step.image || d.process.steps[i].image, alt: step.alt || '' })),
      isIllustration: c.process.isIllustration,
    },
    stages: [
      { id: 'before', title: 'Before construction', summary: c.stages.before.summary, items: c.stages.before.items },
      { id: 'during', title: 'During construction', summary: c.stages.during.summary, items: c.stages.during.items },
      {
        id: 'after',
        title: 'After construction',
        summary: c.stages.after.summary,
        groups: [
          { title: 'Waterproofing', items: c.stages.after.waterproofing },
          { title: 'Structural', items: c.stages.after.structural },
        ],
      },
    ],
    buildings: c.buildings.map((b) => ({ ...b, tags: b.tags || [] })),
    problems: c.problems,
    materials: c.materials,
    footer: c.footer,
    projects: c.projects
      .filter((p) => p && p.show !== false && (p.after?.src || p.before?.src))
      .map((p, i) => ({ ...p, _id: p.id || `project-${i}`, work: p.work || [], before: p.before?.src ? p.before : null, after: p.after?.src ? p.after : null })),
  };
}
