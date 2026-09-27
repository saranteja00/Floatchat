import { useMemo, useState, useRef } from 'react';
import { geoGraticule10, geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import landData from 'world-atlas/land-110m.json';
import { LocateFixed, Minus, Plus, MapPin, Target } from 'lucide-react';
import { floatColor, type Profile } from '../types';

const topology = landData as unknown as Topology<{ land: GeometryCollection }>;
const land = feature(topology, topology.objects.land);
const labels: [string, [number, number], string][] = [
  ['INDIA', [78, 20], 'land-label'], ['SRI LANKA', [81, 6], 'small-label'],
  ['MADAGASCAR', [47, -21], 'small-label'], ['INDIAN OCEAN', [74, -16], 'ocean-label'],
  ['MALDIVES', [72.5, 3], 'small-label'], ['ARABIAN SEA', [63, 14], 'sea-label'],
  ['BAY OF BENGAL', [88, 15], 'sea-label'], ['EAST AFRICA', [39, -3], 'land-label'],
];

export default function OceanMap({ profiles, selected, onSelect }: { profiles: Profile[]; selected: string; onSelect: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([73, -1]);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; center: [number, number] } | null>(null);

  const selectedProfile = useMemo(() => profiles.find(p => p.id === selected), [profiles, selected]);

  const focusOnSelected = () => {
    if (selectedProfile) {
      setCenter([selectedProfile.longitude, selectedProfile.latitude]);
      setZoom(2.2);
    }
  };

  const projection = useMemo(() =>
    geoMercator()
      .center(center)
      .scale(620 * zoom)
      .translate([480, 205]),
    [center, zoom]
  );

  const path = geoPath(projection);
  const groups = [...new Set(profiles.map(p => p.wmo))];

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag on left click
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, center: [...center] };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    const scaleFactor = 360 / (620 * zoom * Math.PI);
    const newLon = dragStartRef.current.center[0] - dx * scaleFactor;
    const newLat = dragStartRef.current.center[1] + dy * scaleFactor;
    setCenter([Math.max(-180, Math.min(180, newLon)), Math.max(-85, Math.min(85, newLat))]);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handlePointClick = (p: Profile, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(p.id);
    setCenter([p.longitude, p.latitude]);
    if (zoom < 1.6) setZoom(2.0);
  };

  return (
    <div
      className="ocean-map"
      style={{ cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none', position: 'relative' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg viewBox="0 0 960 430" className="map-svg" aria-label="Indian Ocean map with observed Argo profile locations">
        <defs>
          <clipPath id="map-clip"><rect width="960" height="430" /></clipPath>
          <radialGradient id="ocean-fill"><stop stopColor="#eaf5f7" /><stop offset="1" stopColor="#dcecf2" /></radialGradient>
        </defs>
        <rect width="960" height="430" fill="url(#ocean-fill)" />
        <g clipPath="url(#map-clip)">
          <path d={path(geoGraticule10()) ?? ''} fill="none" stroke="#cbdfe6" strokeWidth="0.7" />
          <path d={path(land) ?? ''} fill="#f5f5eb" stroke="#b9cec8" strokeWidth="1" />
          {labels.map(([label, point, className]) => {
            const coords = projection(point);
            if (!coords) return null;
            const [x, y] = coords;
            return <text key={label} x={x} y={y} textAnchor="middle" className={className}>{label}</text>;
          })}
          {groups.map(wmo => {
            const points = profiles.filter(p => p.wmo === wmo).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            return <path key={wmo} d={path({ type: 'LineString', coordinates: points.map(p => [p.longitude, p.latitude]) }) ?? ''} fill="none" stroke={floatColor(wmo)} strokeWidth="1.8" strokeDasharray="4 5" opacity="0.65" />;
          })}
          {profiles.map(p => {
            const coords = projection([p.longitude, p.latitude]);
            if (!coords) return null;
            const [x, y] = coords;
            const active = p.id === selected;
            return (
              <g key={p.id} transform={`translate(${x},${y})`} className="map-point" role="button" tabIndex={0}
                aria-label={`Select float ${p.wmo} cycle ${p.cycle}`} aria-pressed={active}
                onClick={(e) => handlePointClick(p, e)}
                onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(p.id); setCenter([p.longitude, p.latitude]); } }}>
                <title>{`Float ${p.wmo} · cycle ${p.cycle} · ${p.timestamp.slice(0, 10)}`}</title>
                <circle r="13" fill="transparent" />
                {active && (
                  <>
                    <circle r="22" fill={floatColor(p.wmo)} opacity="0.2" />
                    <circle r="14" fill="none" stroke={floatColor(p.wmo)} strokeWidth="1.8" opacity="0.7" />
                  </>
                )}
                <circle r={active ? 7.5 : 4.5} fill={floatColor(p.wmo)} stroke="white" strokeWidth="2" />
                {active && (
                  <g transform="translate(16,-37)">
                    <rect width="130" height="32" rx="6" fill="#fff" stroke="#d5e4e6" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.1))" />
                    <text x="10" y="20" fill="#294653" fontSize="11" fontWeight="600">{p.wmo} · #{p.cycle}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="map-caption"><MapPin size={13} /><span>Observed positions</span><span className="caption-divider" />May 2025</div>
      <div className="map-tools" style={{ display: 'flex', gap: '4px' }}>
        <button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3.5, z + .35))} disabled={zoom >= 3.5} title="Zoom in"><Plus size={17} /></button>
        <button aria-label="Zoom out" onClick={() => setZoom(z => Math.max(.75, z - .35))} disabled={zoom <= .75} title="Zoom out"><Minus size={17} /></button>
        <button aria-label="Zoom to selected position" onClick={focusOnSelected} disabled={!selectedProfile} title="Zoom & center to selected float position"><Target size={17} /></button>
        <button aria-label="Reset map view" onClick={() => { setZoom(1); setCenter([73, -1]); }} title="Reset ocean view"><LocateFixed size={17} /></button>
      </div>
      <div className="map-attribution">Natural Earth · Argo / INCOIS</div>
      <div className="map-note">Click point to zoom to position. Drag map to move around.</div>
    </div>
  );
}
