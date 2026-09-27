import { useEffect, useState } from 'react';
import { getJSON } from '../api';

interface SofarResult {
    profile_id: string;
    wmo: string;
    cycle: number;
    latitude: number;
    longitude: number;
    sofar_depth_m: number | null;
    sofar_speed: number | null;
    profile_count: number;
}

interface Props {
    selectedProfileId: string;
}

export default function SofarOverlay({ selectedProfileId }: Props) {
    const [data, setData] = useState<SofarResult[]>([]);
    const [visible, setVisible] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Load SOFAR data once on mount
    useEffect(() => {
        setLoading(true);
        setError('');
        getJSON<SofarResult[]>('/api/query/sofar')
            .then(setData)
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    const selected = data.find((d) => d.profile_id === selectedProfileId);

    return (
        <div className="sofar-overlay-controls">
            {/* Toggle button */}
            <label className="sofar-toggle" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', borderRadius: '8px',
                background: visible ? 'rgba(91,192,235,0.18)' : 'rgba(15,25,35,0.7)',
                border: `1px solid ${visible ? 'rgba(91,192,235,0.5)' : 'rgba(100,180,220,0.15)'}`,
                color: '#b8d4e3', fontSize: '0.82rem', fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s',
                userSelect: 'none',
            }}>
                <input
                    type="checkbox"
                    checked={visible}
                    onChange={(e) => setVisible(e.target.checked)}
                    style={{ accentColor: '#5bc0eb', width: '15px', height: '15px' }}
                />
                🔊 SOFAR Channel
            </label>

            {loading && <span style={{ color: '#8ab4cc', fontSize: '0.78rem', marginLeft: 8 }}>Loading…</span>}
            {error && <span style={{ color: '#e5737380', fontSize: '0.78rem', marginLeft: 8 }}>{error}</span>}

            {/* Info panel – visible only when toggled on */}
            {visible && selected && selected.sofar_depth_m !== null && (
                <div className="sofar-info" style={{
                    marginTop: '8px', padding: '10px 16px', borderRadius: '10px',
                    background: 'rgba(15,25,35,0.85)', border: '1px solid rgba(91,192,235,0.2)',
                    backdropFilter: 'blur(8px)', color: '#e0f0ff', fontSize: '0.84rem',
                    display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap',
                }}>
                    <div>
                        <span style={{ color: '#8ab4cc', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>SOFAR Depth</span>
                        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#5bc0eb' }}>
                            {selected.sofar_depth_m.toFixed(1)} m
                        </div>
                    </div>
                    <div>
                        <span style={{ color: '#8ab4cc', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Min Sound Speed</span>
                        <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
                            {selected.sofar_speed?.toFixed(2)} m/s
                        </div>
                    </div>
                    <div>
                        <span style={{ color: '#8ab4cc', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Float</span>
                        <div style={{ fontWeight: 600 }}>{selected.wmo} · Cycle {selected.cycle}</div>
                    </div>
                    <div>
                        <span style={{ color: '#8ab4cc', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Levels Used</span>
                        <div>{selected.profile_count}</div>
                    </div>
                </div>
            )}

            {visible && selected && selected.sofar_depth_m === null && (
                <div style={{ marginTop: 6, color: '#8ab4cc', fontSize: '0.8rem' }}>
                    No usable T/S/P data for SOFAR calculation on this profile.
                </div>
            )}

            {visible && !selected && data.length > 0 && (
                <div style={{ marginTop: 6, color: '#8ab4cc', fontSize: '0.8rem' }}>
                    Select a profile to see its SOFAR channel depth.
                </div>
            )}
        </div>
    );
}
