import { useState } from 'react';
import { ArrowUpRight, Globe2, Pause, Play } from 'lucide-react';
export default function MissionControl({onLaunch}:{onLaunch:()=>void}) {
 const [depth,setDepth]=useState(800);
 const [paused,setPaused]=useState(false);
 return <aside className="mission-control" data-paused={paused} style={{'--dive':`${depth/2000*90}px`} as React.CSSProperties}>
   <div className="mission-label"><span><Globe2 size={16}/> THE OCEAN, IN PERSPECTIVE</span><button onClick={()=>setPaused(!paused)} aria-label={paused?'Resume 3D illustration':'Pause 3D illustration'} aria-pressed={paused}>{paused?<Play size={14}/>:<Pause size={14}/>}</button></div>
   <div className="orbital-stage" aria-hidden="true"><div className="orbital-world"><div className="orbital-sphere">{Array.from({length:8},(_,i)=><i key={i} style={{transform:`rotateY(${i*22.5}deg)`}}/>)}<b/><b/><b/></div><div className="orbital-equator"/><div className="float-probe"><span/><i/></div></div><div className="orbital-shadow"/></div>
   <div className="mission-copy"><span className="eyebrow">SURFACE TO SEAFLOOR</span><h2>A different<br/><em>point of view.</em></h2><p>Explore ocean observations through space, depth, and time.</p></div>
   <label className="illustration-depth">Preview the descent <output>{depth.toLocaleString()} m</output><input aria-label="Illustration depth" type="range" min="0" max="2000" step="100" value={depth} onChange={e=>setDepth(Number(e.target.value))}/></label>
   <small className="illustration-note">Illustrative depth animation · not a measurement</small>
   <button className="launch-world" onClick={onLaunch}>Enter the 3D explorer <ArrowUpRight size={19}/></button>
 </aside>;
}
