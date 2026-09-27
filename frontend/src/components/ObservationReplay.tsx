import { useEffect, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { observationTimes } from '../exploration';
import { dateLabel, type Profile } from '../types';

export default function ObservationReplay({ profiles, timestamp, onFrame, onAll, paused }: {
  profiles: Profile[]; timestamp: string | null; onFrame: (index: number) => void; onAll: () => void; paused: boolean;
}) {
  const times = observationTimes(profiles);
  const index = timestamp === null ? times.length - 1 : Math.max(0, times.findIndex(t => t >= timestamp));
  const [intervalMs, setIntervalMs] = useState(1600);
  const [playing, setPlaying] = useState(false);
  const signature = times.join('|');
  useEffect(() => setPlaying(false), [signature, paused]);
  useEffect(() => {
    if (!playing || paused) return;
    if (index >= times.length - 1) { setPlaying(false); return; }
    const timeout = window.setTimeout(() => onFrame(index + 1), intervalMs);
    return () => window.clearTimeout(timeout);
  }, [playing, paused, index, times.length, onFrame, intervalMs]);
  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (index >= times.length - 1) onFrame(0);
    setPlaying(true);
  };
  const selectedTime = times[index];
  return <div className="replay-panel">
    <div className="replay-main"><div className="replay-heading"><span className="eyebrow">TIME / FOURTH DIMENSION</span><strong>{selectedTime ? `${dateLabel(selectedTime)} · ${selectedTime.slice(11,16)} UTC` : 'No observations'}</strong><span>{timestamp === null ? 'All selected observations' : `Frame ${index + 1} of ${times.length}`}</span></div>
      <div className="replay-buttons"><button aria-label="Previous observation" disabled={index <= 0 || !times.length} onClick={() => { setPlaying(false); onFrame(index - 1); }}><SkipBack size={15}/></button><button className="replay-play" aria-label={playing ? 'Pause replay' : 'Play replay'} disabled={times.length < 2 || paused} onClick={play}>{playing ? <Pause size={15}/> : <Play size={15}/>}</button><button aria-label="Next observation" disabled={index >= times.length - 1 || !times.length} onClick={() => { setPlaying(false); onFrame(index + 1); }}><SkipForward size={15}/></button></div>
      <div className="replay-track"><input aria-label="Observation replay frame" type="range" min={0} max={Math.max(0, times.length - 1)} value={Math.max(0, index)} disabled={!times.length} onChange={e => { setPlaying(false); onFrame(Number(e.target.value)); }}/><div><span>{times[0] ? dateLabel(times[0], true) : '—'}</span><span>{times.at(-1) ? dateLabel(times.at(-1)!, true) : '—'}</span></div></div>
      <label className="replay-speed">Playback<select aria-label="Replay speed" value={intervalMs} onChange={e => setIntervalMs(Number(e.target.value))}><option value={3200}>Slow</option><option value={1600}>Normal</option><option value={800}>Fast</option></select></label>
      <button className="replay-reset" onClick={() => { setPlaying(false); onAll(); }} aria-label="Show all selected observations"><RotateCcw size={13}/>Show all</button>
    </div><p>Each step is a recorded observation. Playback speed does not represent elapsed ocean time; gaps remain unsampled.</p>
  </div>;
}
