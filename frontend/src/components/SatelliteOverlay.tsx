import { useEffect, useState } from 'react';
import { getJSON } from '../api';
import type { LayerConfig } from '../types';
import styles from './SatelliteOverlay.module.css';

export default function SatelliteOverlay() {
    const [layers, setLayers] = useState<LayerConfig[]>([]);
    const [selectedLayer, setSelectedLayer] = useState<string>('');
    const [date, setDate] = useState<string>('');
    const [opacity, setOpacity] = useState<number>(0.7);
    const [playing, setPlaying] = useState<boolean>(false);
    const [visible, setVisible] = useState<boolean>(true);

    // Load layer config once
    useEffect(() => {
        getJSON<LayerConfig[]>('/api/satellite/config')
            .then((data) => {
                setLayers(data);
                if (data.length) setSelectedLayer(data[0].id);
            })
            .catch(console.error);
    }, []);

    // Time‑animation: advance date by one day when playing
    useEffect(() => {
        if (!playing) return;
        const interval = setInterval(() => {
            if (!date) return;
            const next = new Date(date);
            next.setDate(next.getDate() + 1);
            setDate(next.toISOString().split('T')[0]);
        }, 2000);
        return () => clearInterval(interval);
    }, [playing, date]);

    const imgSrc = selectedLayer && date ? `/api/satellite/tile?layer=${selectedLayer}&date=${date}` : '';

    return (
        <div className={styles.controls}>
            {/* Layer selector */}
            <label className={styles.label}>
                Layer:{' '}
                <select value={selectedLayer} onChange={(e) => setSelectedLayer(e.target.value)}>
                    {layers.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </label>

            {/* Date picker */}
            <label className={styles.label}>
                Date:{' '}
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            {/* Opacity slider */}
            <label className={styles.label}>
                Opacity:{' '}
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={opacity}
                    onChange={(e) => setOpacity(parseFloat(e.target.value))}
                />
                <span>{Math.round(opacity * 100)}%</span>
            </label>

            {/* Play / pause button */}
            <button onClick={() => setPlaying(!playing)} style={{ marginRight: '12px' }}>
                {playing ? 'Pause' : 'Play'}
            </button>

            {/* Hide overlay toggle */}
            <label className={styles.label}>
                <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} /> Show overlay
            </label>

            {/* Legend */}
            <div className={styles.legend}>
                <div className={styles.gradient} />
                <div className={styles.labels}>
                    <span>-2°C</span>
                    <span>0°C</span>
                    <span>2°C</span>
                    <span>4°C</span>
                    <span>6°C</span>
                    <span>8°C</span>
                    <span>10°C</span>
                </div>
            </div>

            {/* Image overlay */}
            {visible && imgSrc && (
                <img
                    src={imgSrc}
                    alt="Satellite overlay"
                    className={styles.overlayImg}
                    style={{ opacity }}
                />
            )}
        </div>
    );
}
