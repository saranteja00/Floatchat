import { useState } from 'react';
import { ArrowDown, ArrowUpRight, Pause, Play, Waves } from 'lucide-react';

export default function OceanIntro({ onGuide, onExplore }: { onGuide: () => void; onExplore: () => void }) {
  const [paused, setPaused] = useState(false);
  function explore() {
    onExplore();
    requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>('.query-panel') ?? document.getElementById('research-workspace');
    target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    const input = target?.querySelector<HTMLInputElement>('input');
    (input ?? target)?.focus({ preventScroll: true });
    });
  }
  return <section className="ocean-intro" data-paused={paused} aria-labelledby="ocean-title">
    <div className="ocean-art" aria-hidden="true">
      <div className="ocean-glow" />
      <svg viewBox="0 0 1100 650" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="contour-ink" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#62e0de"/><stop offset=".5" stopColor="#258394"/><stop offset="1" stopColor="#133342"/></linearGradient>
          <radialGradient id="ocean-light"><stop stopColor="#76e4d1" stopOpacity=".24"/><stop offset="1" stopColor="#76e4d1" stopOpacity="0"/></radialGradient>
        </defs>
        <ellipse cx="790" cy="315" rx="350" ry="310" fill="url(#ocean-light)"/>
        <g className="contour-drift" fill="none" stroke="url(#contour-ink)" strokeWidth="1">
          {Array.from({length: 24}, (_, i) => <path key={i} opacity={.18 + i / 50} d={`M ${390+i*8} -40 C ${930-i*19} ${120+i*4}, ${330+i*7} ${230+i*8}, ${620+i*15} ${360+i*5} S ${1180-i*5} ${530+i*3}, ${940+i*10} 740`}/>)}
        </g>
        <g className="ocean-particles" fill="#a6eee0"><circle cx="780" cy="182" r="3"/><circle cx="684" cy="359" r="4"/><circle cx="925" cy="466" r="3"/><circle cx="1020" cy="220" r="2"/></g>
      </svg>
    </div>
    <div className="intro-topline"><span><Waves size={16}/> OCEAN INTELLIGENCE / FLOATCHAT</span></div>
    <div className="intro-copy"><div className="intro-kicker"><span/> A NEW PERSPECTIVE ON THE DEEP</div>
      <h1 id="ocean-title">An ocean of data.<br/><em>A deeper understanding.</em></h1>
      <p>Follow the floats. Uncover patterns beneath the surface.<br className="intro-break"/> Trace every discovery back to its source.</p>
      <div className="intro-actions"><button className="dive-button" onClick={explore}>Explore the ocean <ArrowDown size={18}/></button><button className="intro-guide" onClick={onGuide}>Workspace guide <ArrowUpRight size={17}/></button></div>
    </div>
    <div className="intro-bottom"><div className="intro-data"><span className="intro-status"/> <span>Follow the ocean.<small>EXPLORE · UNDERSTAND · VERIFY</small></span></div><span className="art-caption">An illustration of the deep. Real observations below.</span><button className="motion-toggle" onClick={() => setPaused(!paused)} aria-pressed={paused} aria-label={paused ? 'Resume ambient animation' : 'Pause ambient animation'}>{paused ? <Play size={14}/> : <Pause size={14}/>}</button></div>
  </section>;
}
