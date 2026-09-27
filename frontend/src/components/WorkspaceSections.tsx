import { Compass, FlaskConical, Database, MessageSquare, Waves, ArrowUpRight } from 'lucide-react';
const sections = [
  { id: 'ask', label: 'Ask the ocean', caption: 'Build your investigation', icon: MessageSquare },
  { id: 'explore', label: 'Explore', caption: 'Map, depth & replay', icon: Compass },
  { id: 'analyze', label: 'Analyze', caption: 'Patterns & comparisons', icon: FlaskConical },
  { id: 'sofar', label: 'SOFAR Channel', caption: 'Acoustic depth modeling', icon: Waves },
  { id: 'sources', label: 'Sources', caption: 'Data you can trace', icon: Database },
];
export default function WorkspaceSections({ active, onChange }: { active: string; onChange: (value: string) => void }) {
  return <nav className="workspace-sections mission-navigation" aria-label="Workspace sections"><div className="workspace-section-links">{sections.map((s, i) => <button key={s.id} aria-current={active === s.id ? 'page' : undefined} onClick={() => onChange(s.id)}><s.icon size={19} /><span><small>0{i + 1}</small><strong>{s.label}</strong><em>{s.caption}</em></span><ArrowUpRight size={15} /></button>)}</div></nav>;
}
