import { PhotoField, Repeater, Select, StringList, TextInput, Toggle } from './fields.jsx';
import HotspotEditor from './HotspotEditor.jsx';

// One editor per part of the website. Each gets its slice of the content as `value`
// and reports changes with `onChange(newSlice)`.

const set = (value, onChange, key) => (v) => onChange({ ...value, [key]: v });

const BUILDING_ICONS = [
  { value: 'Building2', label: 'Apartment block' },
  { value: 'House', label: 'House / bungalow' },
  { value: 'Building', label: 'Tall building' },
  { value: 'Store', label: 'Shop / commercial' },
  { value: 'Factory', label: 'Factory' },
  { value: 'Landmark', label: 'Government building' },
  { value: 'Route', label: 'Road / bridge' },
  { value: 'HardHat', label: 'Construction' },
];

const PROBLEM_ICONS = [
  { value: 'Activity', label: 'Crack' },
  { value: 'Grid3x3', label: 'Honeycombing' },
  { value: 'Layers', label: 'Layers / joints' },
  { value: 'Ruler', label: 'Ruler / thickness' },
  { value: 'Waves', label: 'Water' },
  { value: 'Columns3', label: 'Columns' },
  { value: 'BrickWall', label: 'Wall' },
  { value: 'Droplets', label: 'Damp' },
];

const BUILDING_TYPES = ['Residential building', 'Bungalow', 'Multi-storey building', 'Commercial building', 'Industrial building', 'Government office', 'Road, bridge or civil structure', 'New construction'];

export function ContactSection({ value, onChange }) {
  return (
    <>
      <TextInput label="Main phone number" help="Shown on all Call buttons. Example: 98229 40697" value={value.phone.display}
        onChange={(display) => onChange({ ...value, phone: { ...value.phone, display } })} />
      <TextInput label="WhatsApp number" help="Enquiries open WhatsApp to this number. 10 digits, no spaces." inputMode="numeric" value={value.phone.whatsapp}
        onChange={(whatsapp) => onChange({ ...value, phone: { ...value.phone, whatsapp: whatsapp.replace(/\D/g, '').slice(0, 10) } })} />
      <Repeater
        label="Offices"
        help="Shown in the Contact section and at the bottom of the page."
        items={value.offices}
        onChange={(offices) => onChange({ ...value, offices })}
        newItem={() => ({ label: 'New office', address: '', person: '', phone: '' })}
        title={(o) => o.label || 'Office'}
        addLabel="Add office"
        render={(o, update) => (
          <>
            <TextInput label="Name" value={o.label} onChange={set(o, update, 'label')} />
            <TextInput label="Address" multiline rows={2} value={o.address} onChange={set(o, update, 'address')} />
            <TextInput label="Contact person" value={o.person} onChange={set(o, update, 'person')} />
            <TextInput label="Phone" value={o.phone} onChange={set(o, update, 'phone')} />
          </>
        )}
      />
    </>
  );
}

export function HeroSection({ value, onChange }) {
  return (
    <>
      <TextInput label="Small line above the headline" value={value.kicker} onChange={set(value, onChange, 'kicker')} />
      <TextInput label="Headline (black part)" value={value.title} onChange={set(value, onChange, 'title')} />
      <TextInput label="Headline (gold part)" value={value.accent} onChange={set(value, onChange, 'accent')} />
      <TextInput label="Text under the headline" multiline value={value.lede} onChange={set(value, onChange, 'lede')} />
      <StringList label="Three short proof points" help="Keep each to one line. Three fit best." items={value.proof} onChange={set(value, onChange, 'proof')} addLabel="Add point" />
    </>
  );
}

export function ExpertiseSection({ value, onChange }) {
  return (
    <>
      <Repeater
        label="Paragraphs"
        items={value.paragraphs.map((text) => ({ text }))}
        onChange={(items) => onChange({ ...value, paragraphs: items.map((p) => p.text) })}
        newItem={() => ({ text: '' })}
        title={(p, i) => `Paragraph ${i + 1}`}
        addLabel="Add paragraph"
        render={(p, update) => <TextInput label="Text" multiline rows={4} value={p.text} onChange={(text) => update({ text })} />}
      />
      <PhotoField label="Photo" value={value.photo} onChange={set(value, onChange, 'photo')} />
      <Repeater
        label="Why clients choose us"
        help="Four fit best in one row."
        items={value.reasons}
        onChange={set(value, onChange, 'reasons')}
        newItem={() => ({ title: '', text: '' })}
        title={(r) => r.title || 'Reason'}
        addLabel="Add reason"
        render={(r, update) => (
          <>
            <TextInput label="Title" value={r.title} onChange={set(r, update, 'title')} />
            <TextInput label="Text" value={r.text} onChange={set(r, update, 'text')} />
          </>
        )}
      />
    </>
  );
}

export function ServicesSection({ value, onChange }) {
  return (
    <Repeater
      label="Services"
      help="Shown as photo tiles; the first one is selected when the page opens."
      items={value}
      onChange={onChange}
      newItem={() => ({ title: 'New service', short: 'New', tag: 'Structural', image: '', alt: '', items: [] })}
      title={(s) => s.title || 'Service'}
      addLabel="Add service"
      render={(s, update) => (
        <>
          <TextInput label="Service name" value={s.title} onChange={set(s, update, 'title')} />
          <TextInput label="Short label on the photo" help="One or two words." maxLength={20} value={s.short} onChange={set(s, update, 'short')} />
          <Select label="Category" value={s.tag} options={['Structural', 'Waterproofing', 'Consultancy']} onChange={set(s, update, 'tag')} />
          <PhotoField label="Photo" help="Upright (portrait) photos work best." value={{ src: s.image, alt: s.alt }}
            onChange={(p) => update({ ...s, image: p.src, alt: p.alt })} />
          <StringList label="What is included" items={s.items} onChange={set(s, update, 'items')} />
        </>
      )}
    />
  );
}

export function StorySection({ value, onChange }) {
  return (
    <>
      <PhotoField label="Before photo" wide help="Landscape 3:2, e.g. 1536 × 1024. Before and after must be taken from the same spot." value={value.before} onChange={set(value, onChange, 'before')} />
      <PhotoField label="After photo" wide value={value.after} onChange={set(value, onChange, 'after')} />
      <Toggle label="These are illustrations, not real project photos" help="Keep this on for AI or sample images. Turn it off only for real photos of an SRA job."
        checked={value.isIllustration} onChange={set(value, onChange, 'isIllustration')} />
      <Repeater
        label="The four steps"
        help="Shown on the timeline from left to right."
        fixed
        items={value.steps}
        onChange={set(value, onChange, 'steps')}
        title={(s, i) => `Step ${i + 1}: ${s.label || ''}`}
        render={(s, update) => (
          <>
            <TextInput label="Small label" help="Example: Before" value={s.meta} onChange={set(s, update, 'meta')} />
            <TextInput label="Title" value={s.label} onChange={set(s, update, 'label')} />
            <TextInput label="Text" multiline rows={2} value={s.text} onChange={set(s, update, 'text')} />
          </>
        )}
      />
      <HotspotEditor label="Labels on the before photo" photo={value.before} spots={value.beforeSpots} onChange={set(value, onChange, 'beforeSpots')} />
      <HotspotEditor label="Labels on the after photo" photo={value.after} spots={value.afterSpots} onChange={set(value, onChange, 'afterSpots')} />
    </>
  );
}

export function ProcessSection({ value, onChange }) {
  return (
    <>
      <Toggle label="These are illustrations, not real project photos" help="Turn off only when all four are real photos of SRA work."
        checked={value.isIllustration} onChange={set(value, onChange, 'isIllustration')} />
      <Repeater
        label="The four steps"
        help="The house drawing changes with each step in this order: inspection, design, work, checks."
        fixed
        items={value.steps}
        onChange={set(value, onChange, 'steps')}
        title={(s, i) => `Step ${i + 1}: ${s.title || ''}`}
        render={(s, update) => (
          <>
            <TextInput label="Title" value={s.title} onChange={set(s, update, 'title')} />
            <TextInput label="Text" multiline rows={2} value={s.text} onChange={set(s, update, 'text')} />
            <PhotoField label="Photo" help="Upright (portrait) photos work best." value={{ src: s.image, alt: s.alt }}
              onChange={(p) => update({ ...s, image: p.src, alt: p.alt })} />
          </>
        )}
      />
    </>
  );
}

export function StagesSection({ value, onChange }) {
  const stage = (key) => (v) => onChange({ ...value, [key]: v });
  return (
    <>
      <h3 className="adm-subhead">Before construction</h3>
      <TextInput label="One line" value={value.before.summary} onChange={(summary) => stage('before')({ ...value.before, summary })} />
      <StringList label="Work" items={value.before.items} onChange={(items) => stage('before')({ ...value.before, items })} />
      <h3 className="adm-subhead">During construction</h3>
      <TextInput label="One line" value={value.during.summary} onChange={(summary) => stage('during')({ ...value.during, summary })} />
      <StringList label="Work" items={value.during.items} onChange={(items) => stage('during')({ ...value.during, items })} />
      <h3 className="adm-subhead">After construction</h3>
      <TextInput label="One line" value={value.after.summary} onChange={(summary) => stage('after')({ ...value.after, summary })} />
      <StringList label="Waterproofing work" items={value.after.waterproofing} onChange={(waterproofing) => stage('after')({ ...value.after, waterproofing })} />
      <StringList label="Structural work" items={value.after.structural} onChange={(structural) => stage('after')({ ...value.after, structural })} />
    </>
  );
}

export function ListsSection({ value, onChange }) {
  return (
    <>
      <Repeater
        label="Buildings we work on"
        items={value.buildings}
        onChange={(buildings) => onChange({ ...value, buildings })}
        newItem={() => ({ title: '', note: '', tags: ['Waterproofing'], icon: 'Building2' })}
        title={(b) => b.title || 'Building type'}
        addLabel="Add building type"
        render={(b, update) => (
          <>
            <TextInput label="Type of building" value={b.title} onChange={set(b, update, 'title')} />
            <TextInput label="Typical work" value={b.note} onChange={set(b, update, 'note')} />
            <StringList label="Work we do" help="For example: Waterproofing, Structural repair" items={b.tags} onChange={set(b, update, 'tags')} />
            <Select label="Icon" value={b.icon} options={BUILDING_ICONS} onChange={set(b, update, 'icon')} />
          </>
        )}
      />
      <Repeater
        label="Problems we repair"
        items={value.problems}
        onChange={(problems) => onChange({ ...value, problems })}
        newItem={() => ({ title: '', icon: 'Activity' })}
        title={(p) => p.title || 'Problem'}
        addLabel="Add problem"
        render={(p, update) => (
          <>
            <TextInput label="Problem" value={p.title} onChange={set(p, update, 'title')} />
            <Select label="Icon" value={p.icon} options={PROBLEM_ICONS} onChange={set(p, update, 'icon')} />
          </>
        )}
      />
    </>
  );
}

export function MaterialsSection({ value, onChange }) {
  return (
    <>
      <StringList label="Materials we supply" items={value.list} onChange={set(value, onChange, 'list')} addLabel="Add material" />
      <Repeater
        label="Authorised brands"
        items={value.brands}
        onChange={set(value, onChange, 'brands')}
        newItem={() => ({ company: '', brand: '' })}
        title={(b) => b.company || 'Brand'}
        addLabel="Add brand"
        render={(b, update) => (
          <>
            <TextInput label="Company" value={b.company} onChange={set(b, update, 'company')} />
            <TextInput label="Brand or division (optional)" value={b.brand} onChange={set(b, update, 'brand')} />
          </>
        )}
      />
      <TextInput label="Note under the brands" value={value.note} onChange={set(value, onChange, 'note')} />
    </>
  );
}

export function FooterSection({ value, onChange }) {
  return (
    <>
      <TextInput label="Closing headline (white part)" value={value.title} onChange={set(value, onChange, 'title')} />
      <TextInput label="Closing headline (gold part)" value={value.accent} onChange={set(value, onChange, 'accent')} />
    </>
  );
}

export function ProjectsSection({ value, onChange }) {
  return (
    <Repeater
      label="Projects"
      help="Real jobs only. The Projects section appears on the website once at least one project has a photo and is set to show."
      items={value}
      onChange={onChange}
      newItem={() => ({ id: `p-${Date.now()}`, title: '', location: '', buildingType: BUILDING_TYPES[0], work: [], completed: '', before: null, after: null, summary: '', show: true })}
      title={(p) => p.title || 'New project'}
      addLabel="Add project"
      render={(p, update) => (
        <>
          <TextInput label="Project name" help="Example: Terrace waterproofing, 12-flat society" value={p.title} onChange={set(p, update, 'title')} />
          <TextInput label="Location" help="Area and town only. Do not add client names without their permission." value={p.location} onChange={set(p, update, 'location')} />
          <Select label="Type of building" value={p.buildingType} options={BUILDING_TYPES} onChange={set(p, update, 'buildingType')} />
          <StringList label="Work done" items={p.work} onChange={set(p, update, 'work')} addLabel="Add work" />
          <TextInput label="Completed on" type="date" value={p.completed} onChange={set(p, update, 'completed')} />
          <PhotoField label="Before photo" value={p.before} onChange={set(p, update, 'before')} />
          <PhotoField label="After photo" value={p.after} onChange={set(p, update, 'after')} />
          <TextInput label="Short description" multiline value={p.summary} onChange={set(p, update, 'summary')} />
          <Toggle label="Show on website" checked={p.show !== false} onChange={set(p, update, 'show')} />
        </>
      )}
    />
  );
}
