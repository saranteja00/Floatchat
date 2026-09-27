import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Viewer, Cartesian2, Cartesian3, Cartographic, Color, CustomDataSource, EllipsoidTerrainProvider,
  GeoJsonDataSource, HeadingPitchRange, Math as CesiumMath, Matrix4,
  PolylineDashMaterialProperty, PolylineGlowMaterialProperty, ScreenSpaceEventHandler, ScreenSpaceEventType,
  VerticalOrigin, LabelStyle, Rectangle, ArcType, ConstantProperty, ArcGisMapServerImageryProvider,
  SkyAtmosphere, SkyBox, DistanceDisplayCondition
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import landData from 'world-atlas/land-110m.json';
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Compass, RotateCcw,
  Maximize2, Minimize2, Home, Globe2, Sliders, Layers, ArrowDown, Crosshair,
  MapPin, Eye, Radio, Sparkles, Orbit, Info, Tag, X
} from 'lucide-react';
import { COLOR_DOMAINS, colorFraction, displayHeight } from '../exploration';
import { useCesiumViewer } from '../hooks/useCesiumViewer';
import { useGlobeCamera, TOUR_LOCATIONS } from '../hooks/useGlobeCamera';
import { useOceanDataLayer } from '../hooks/useOceanDataLayer';
import { floatColor, type Observation, type Profile, type ProfileResult, type Variable } from '../types';

const land = feature(
  landData as unknown as Topology<{ land: GeometryCollection }>,
  (landData as unknown as Topology<{ land: GeometryCollection }>).objects.land
);

const tint = (value: number | null, variable: Variable) => {
  const fraction = colorFraction(value, variable);
  return fraction === null ? Color.fromCssColorString('#8f9da6') : Color.fromHsl((1 - fraction) * 0.64, 0.85, 0.60);
};

// Photorealistic Natural Earth & Bathymetric basemaps with geographic place references
const BASEMAP_OPTIONS = [
  {
    id: 'satellite',
    label: 'Photorealistic Satellite',
    badge: 'Natural',
    service: 'World_Imagery',
    refServices: [
      'Reference/World_Boundaries_and_Places',
      'Ocean/World_Ocean_Reference'
    ],
    desc: 'High-resolution orbital satellite Earth with ocean, country & city names'
  },
  {
    id: 'satellite_pure',
    label: 'Satellite (Clean No Labels)',
    badge: 'Clean',
    service: 'World_Imagery',
    refServices: [],
    desc: 'Pristine orbital satellite imagery without labels'
  },
  {
    id: 'ocean',
    label: 'Ocean Bathymetry',
    badge: 'Seafloor',
    service: 'Ocean/World_Ocean_Base',
    refServices: ['Ocean/World_Ocean_Reference', 'Reference/World_Boundaries_and_Places'],
    desc: 'Underwater bathymetric relief, ocean ridges & trenches'
  },
  {
    id: 'topo',
    label: 'Topographic Relief',
    badge: 'Physical',
    service: 'World_Physical_Map',
    refServices: ['Reference/World_Boundaries_and_Places'],
    desc: 'Continental elevation and physical landforms'
  },
  {
    id: 'dark',
    label: 'Dark Hydro',
    badge: 'Telemetry',
    service: 'Canvas/World_Dark_Gray_Base',
    refServices: ['Canvas/World_Dark_Gray_Reference'],
    desc: 'High-contrast dark ocean telemetry view'
  },
  {
    id: 'offline',
    label: 'Natural Earth Vector',
    badge: 'Vector',
    refServices: [],
    desc: 'Locally rendered Natural Earth vector geometry'
  },
];

// Curated High-Visibility 3D Geographic Labels (Oceans, Seas, Countries, Cities)
interface GeoLabelItem {
  name: string;
  lon: number;
  lat: number;
  type: 'ocean' | 'sea' | 'country' | 'city';
}

const GEO_LABELS: GeoLabelItem[] = [
  // Major Oceans & Marine Waterbodies
  { name: 'INDIAN OCEAN', lon: 78.0, lat: -16.0, type: 'ocean' },
  { name: 'ARABIAN SEA', lon: 65.0, lat: 16.0, type: 'sea' },
  { name: 'BAY OF BENGAL', lon: 88.5, lat: 14.5, type: 'sea' },
  { name: 'PACIFIC OCEAN', lon: 155.0, lat: 5.0, type: 'ocean' },
  { name: 'ATLANTIC OCEAN', lon: -28.0, lat: -5.0, type: 'ocean' },
  { name: 'SOUTHERN OCEAN', lon: 75.0, lat: -58.0, type: 'ocean' },
  { name: 'SOUTH CHINA SEA', lon: 114.0, lat: 12.0, type: 'sea' },
  { name: 'ANDAMAN SEA', lon: 95.0, lat: 10.5, type: 'sea' },
  { name: 'RED SEA', lon: 38.5, lat: 21.0, type: 'sea' },
  { name: 'PERSIAN GULF', lon: 52.0, lat: 26.5, type: 'sea' },
  { name: 'LACCADIVE SEA', lon: 75.5, lat: 8.5, type: 'sea' },
  { name: 'JAVA SEA', lon: 112.0, lat: -5.0, type: 'sea' },
  { name: 'PHILIPPINE SEA', lon: 132.0, lat: 17.0, type: 'sea' },
  { name: 'CORAL SEA', lon: 154.0, lat: -17.0, type: 'sea' },
  { name: 'MEDITERRANEAN SEA', lon: 18.0, lat: 35.0, type: 'sea' },
  { name: 'TASMAN SEA', lon: 160.0, lat: -38.0, type: 'sea' },

  // Countries & Sovereignties
  { name: 'INDIA', lon: 78.96, lat: 21.50, type: 'country' },
  { name: 'SRI LANKA', lon: 80.77, lat: 7.87, type: 'country' },
  { name: 'MALDIVES', lon: 73.22, lat: 3.20, type: 'country' },
  { name: 'INDONESIA', lon: 115.00, lat: -1.50, type: 'country' },
  { name: 'AUSTRALIA', lon: 133.78, lat: -25.27, type: 'country' },
  { name: 'CHINA', lon: 104.20, lat: 33.50, type: 'country' },
  { name: 'SAUDI ARABIA', lon: 45.08, lat: 23.89, type: 'country' },
  { name: 'OMAN', lon: 56.50, lat: 21.50, type: 'country' },
  { name: 'IRAN', lon: 53.69, lat: 32.43, type: 'country' },
  { name: 'PAKISTAN', lon: 69.35, lat: 30.38, type: 'country' },
  { name: 'BANGLADESH', lon: 90.36, lat: 23.69, type: 'country' },
  { name: 'MYANMAR', lon: 95.96, lat: 20.50, type: 'country' },
  { name: 'THAILAND', lon: 100.99, lat: 14.50, type: 'country' },
  { name: 'MALAYSIA', lon: 102.50, lat: 4.21, type: 'country' },
  { name: 'MADAGASCAR', lon: 46.87, lat: -18.77, type: 'country' },
  { name: 'SOMALIA', lon: 46.20, lat: 5.15, type: 'country' },
  { name: 'KENYA', lon: 37.91, lat: 0.02, type: 'country' },
  { name: 'TANZANIA', lon: 34.89, lat: -6.37, type: 'country' },
  { name: 'SOUTH AFRICA', lon: 24.50, lat: -29.00, type: 'country' },
  { name: 'PHILIPPINES', lon: 122.50, lat: 12.88, type: 'country' },
  { name: 'JAPAN', lon: 138.25, lat: 36.20, type: 'country' },
  { name: 'UNITED ARAB EMIRATES', lon: 54.50, lat: 24.00, type: 'country' },
  { name: 'VIETNAM', lon: 108.28, lat: 14.06, type: 'country' },
  { name: 'EGYPT', lon: 30.80, lat: 26.82, type: 'country' },
  { name: 'SEYCHELLES', lon: 55.49, lat: -4.68, type: 'country' },
  { name: 'MAURITIUS', lon: 57.55, lat: -20.35, type: 'country' },

  // Key Regional & Coastal Cities
  { name: 'New Delhi', lon: 77.21, lat: 28.61, type: 'city' },
  { name: 'Mumbai', lon: 72.88, lat: 19.08, type: 'city' },
  { name: 'Chennai', lon: 80.27, lat: 13.08, type: 'city' },
  { name: 'Kolkata', lon: 88.36, lat: 22.57, type: 'city' },
  { name: 'Bengaluru', lon: 77.59, lat: 12.97, type: 'city' },
  { name: 'Kochi', lon: 76.27, lat: 9.93, type: 'city' },
  { name: 'Colombo', lon: 79.86, lat: 6.93, type: 'city' },
  { name: 'Malé', lon: 73.51, lat: 4.18, type: 'city' },
  { name: 'Singapore', lon: 103.82, lat: 1.35, type: 'city' },
  { name: 'Bangkok', lon: 100.50, lat: 13.76, type: 'city' },
  { name: 'Jakarta', lon: 106.85, lat: -6.21, type: 'city' },
  { name: 'Kuala Lumpur', lon: 101.69, lat: 3.14, type: 'city' },
  { name: 'Dubai', lon: 55.27, lat: 25.20, type: 'city' },
  { name: 'Abu Dhabi', lon: 54.38, lat: 24.45, type: 'city' },
  { name: 'Muscat', lon: 58.41, lat: 23.59, type: 'city' },
  { name: 'Karachi', lon: 67.00, lat: 24.86, type: 'city' },
  { name: 'Dhaka', lon: 90.41, lat: 23.81, type: 'city' },
  { name: 'Yangon', lon: 96.20, lat: 16.87, type: 'city' },
  { name: 'Perth', lon: 115.86, lat: -31.95, type: 'city' },
  { name: 'Mombasa', lon: 39.67, lat: -4.04, type: 'city' },
  { name: 'Dar es Salaam', lon: 39.21, lat: -6.79, type: 'city' },
  { name: 'Port Louis', lon: 57.50, lat: -20.16, type: 'city' },
  { name: 'Victoria', lon: 55.45, lat: -4.62, type: 'city' },
  { name: 'Tokyo', lon: 139.69, lat: 35.69, type: 'city' },
  { name: 'Shanghai', lon: 121.47, lat: 31.23, type: 'city' },
  { name: 'Hong Kong', lon: 114.17, lat: 22.32, type: 'city' },
  { name: 'Sydney', lon: 151.21, lat: -33.87, type: 'city' },
  { name: 'Melbourne', lon: 144.96, lat: -37.81, type: 'city' },
  { name: 'Cape Town', lon: 18.42, lat: -33.92, type: 'city' },
  { name: 'Cairo', lon: 31.24, lat: 30.04, type: 'city' },
];



export default function OceanGlobe({
  profiles, selected, result, results, timestamp, onSelect, onInspect, onFallback
}: {
  results?: ProfileResult[]; timestamp: string | null; profiles: Profile[]; selected: string; result: ProfileResult | null;
  onSelect: (id: string) => void; onInspect: (sample: Observation) => void; onFallback: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const sceneWrapRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onSelect, onInspect });
  const picks = useRef(new Map<string, { profileId: string; sample?: Observation; wmo?: string; cycle?: number }>());

  const [openSection, setOpenSection] = useState<'camera' | 'data' | 'layers' | null>('camera');
  const [basemap, setBasemap] = useState('satellite');
  const [showLabels, setShowLabels] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mapStatus, setMapStatus] = useState('Rendering photorealistic 3D Earth…');
  const [graphicsQuality, setGraphicsQuality] = useState<'low' | 'high' | 'ultra'>('low');

  const [maxVisibleDepth, setMaxVisibleDepth] = useState(2100);
  const [showHistory, setShowHistory] = useState(true);
  const [showSoundings, setShowSoundings] = useState(true);
  const [exaggeration, setExaggeration] = useState(100);
  const [lens, setLens] = useState<Variable>('temperature');
  const [levelIndex, setLevelIndex] = useState(0);

  const available = result?.plan.variables ?? ['temperature', 'salinity'];
  const variable = available.includes(lens) ? lens : available[0];
  const level = result?.observations[Math.min(levelIndex, Math.max(0, result.observations.length - 1))];
  const selectedProfile = useMemo(() => profiles.find(p => p.id === selected), [profiles, selected]);

  const { viewer, landSource, observations, geoLabelsSource, ready, failure, cursorCoords, hoverTooltip, camAltitude, headingDeg } = useCesiumViewer({
    containerRef: container as React.RefObject<HTMLDivElement>,
    graphicsQuality,
    variable,
    callbacks,
    picks
  });

  const { tourIndex, isOrbiting, setIsOrbiting, dive, setDive, jumpTour, resetHome, resetCompass, tiltView, focusSubsurface } = useGlobeCamera({
    viewerRef: viewer,
    profiles,
    selectedProfileId: selected,
    exaggeration
  });

  useOceanDataLayer({
    viewerRef: viewer,
    observationsRef: observations,
    picksRef: picks,
    ready,
    profiles,
    selected,
    result,
    results,
    exaggeration,
    variable,
    maxVisibleDepth,
    showHistory,
    showSoundings,
    level
  });
  useEffect(() => { callbacks.current = { onSelect, onInspect }; }, [onSelect, onInspect]);
  useEffect(() => setLevelIndex(0), [result?.result_id]);

  // Fullscreen sync
  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);



  // Populate 3D Geographic Labels (Oceans, Seas, Countries, Cities)
  useEffect(() => {
    const instance = viewer.current;
    const source = geoLabelsSource.current;
    if (!ready || !instance || instance.isDestroyed() || !source) return;

    source.entities.removeAll();
    source.show = showLabels;
    if (!showLabels) return;

    for (const item of GEO_LABELS) {
      const pos = Cartesian3.fromDegrees(item.lon, item.lat, 0);

      if (item.type === 'ocean') {
        source.entities.add({
          position: pos,
          label: {
            text: item.name,
            font: 'italic 700 14px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fillColor: Color.fromCssColorString('#7dd3fc'), // Luminous light cyan/azure
            outlineColor: Color.fromCssColorString('#021424'),
            outlineWidth: 3.5,
            style: LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new DistanceDisplayCondition(500_000, 25_000_000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        });
      } else if (item.type === 'sea') {
        source.entities.add({
          position: pos,
          label: {
            text: item.name,
            font: 'italic 600 12px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fillColor: Color.fromCssColorString('#bae6fd'),
            outlineColor: Color.fromCssColorString('#021424'),
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new DistanceDisplayCondition(200_000, 14_000_000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        });
      } else if (item.type === 'country') {
        source.entities.add({
          position: pos,
          label: {
            text: item.name,
            font: 'bold 12px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.fromCssColorString('#090d16'),
            outlineWidth: 3.5,
            style: LabelStyle.FILL_AND_OUTLINE,
            distanceDisplayCondition: new DistanceDisplayCondition(400_000, 16_000_000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        });
      } else if (item.type === 'city') {
        source.entities.add({
          position: pos,
          point: {
            pixelSize: 4.5,
            color: Color.fromCssColorString('#38bdf8'),
            outlineColor: Color.WHITE,
            outlineWidth: 1.2,
            distanceDisplayCondition: new DistanceDisplayCondition(10_000, 7_500_000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: item.name,
            font: '500 11px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fillColor: Color.fromCssColorString('#f8fafc'),
            outlineColor: Color.fromCssColorString('#090d16'),
            outlineWidth: 2.5,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cartesian2(0, -10),
            verticalOrigin: VerticalOrigin.BOTTOM,
            distanceDisplayCondition: new DistanceDisplayCondition(10_000, 7_500_000),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          }
        });
      }
    }

    instance.scene.requestRender();
  }, [ready, showLabels]);

  // Load Photorealistic Imagery Layers & ArcGIS Reference Overlays
  useEffect(() => {
    const instance = viewer.current;
    if (!ready || !instance || instance.isDestroyed()) return;

    let cancelled = false;
    let removeError: (() => void) | undefined;

    instance.imageryLayers.removeAll();
    if (landSource.current) landSource.current.show = true;

    if (basemap === 'offline') {
      setMapStatus('Offline vector · Natural Earth');
      instance.scene.requestRender();
      return;
    }

    const selectedOption = BASEMAP_OPTIONS.find(b => b.id === basemap) || BASEMAP_OPTIONS[0];
    const baseUrl = `https://services.arcgisonline.com/ArcGIS/rest/services/${selectedOption.service}/MapServer`;
    setMapStatus(`Loading ${selectedOption.label}…`);

    void ArcGisMapServerImageryProvider.fromUrl(baseUrl, { enablePickFeatures: false }).then(baseProvider => {
      if (cancelled || instance.isDestroyed()) return;
      instance.imageryLayers.addImageryProvider(baseProvider);
      if (landSource.current) landSource.current.show = false;

      // Overlay High-Resolution Reference Labels (Countries, Cities, Oceans & Seas)
      if (showLabels && selectedOption.refServices && selectedOption.refServices.length > 0) {
        for (const refServ of selectedOption.refServices) {
          const refUrl = `https://services.arcgisonline.com/ArcGIS/rest/services/${refServ}/MapServer`;
          void ArcGisMapServerImageryProvider.fromUrl(refUrl, { enablePickFeatures: false }).then(refProvider => {
            if (!cancelled && !instance.isDestroyed()) {
              instance.imageryLayers.addImageryProvider(refProvider);
              instance.scene.requestRender();
            }
          }).catch(() => {});
        }
      }

      setMapStatus(`${selectedOption.label} · Active`);
      instance.scene.requestRender();
    }).catch(() => {
      if (!cancelled && !instance.isDestroyed()) {
        setMapStatus('Imagery unavailable · showing vector backdrop');
        if (landSource.current) landSource.current.show = true;
        instance.scene.requestRender();
      }
    });

    return () => {
      cancelled = true;
      removeError?.();
    };
  }, [ready, basemap, showLabels, graphicsQuality]);



  const domain = COLOR_DOMAINS[variable];
  const activeTour = TOUR_LOCATIONS[tourIndex];
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById('globe-header-toolbar');
    if (el) setPortalEl(el);
  }, []);

  const toolbarContent = (
    <div className="globe-header-toolbar-inner">
      <button
        type="button"
        className={`header-guide-toggle ${showInfoCard ? 'active' : ''}`}
        onClick={() => setShowInfoCard(s => !s)}
        title="Toggle 3D guide & subsurface settings"
      >
        <Compass size={13} />
        <span>3D Guide</span>
      </button>

      <div className="header-chips-group">
        <span className="header-chips-label">Basin:</span>
        {TOUR_LOCATIONS.map((loc, i) => (
          <button
            key={loc.name}
            type="button"
            className={`header-chip ${tourIndex === i ? 'active' : ''}`}
            onClick={() => jumpTour(i)}
            title={`Fly to ${loc.name}`}
          >
            {loc.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <div className="header-chips-group">
        <button
          type="button"
          className="header-chip"
          onClick={() => tiltView('horizon')}
          title="3D Horizon Tilt perspective"
        >
          <Sliders size={12} /> Tilt
        </button>
        <button
          type="button"
          className="header-chip"
          onClick={() => tiltView('nadir')}
          title="Top-down Nadir perspective"
        >
          <Globe2 size={12} /> Nadir
        </button>
        <button
          type="button"
          className={`header-chip ${isOrbiting ? 'active' : ''}`}
          onClick={() => setIsOrbiting(p => !p)}
          title="Toggle Auto Orbit"
        >
          <Orbit size={12} /> {isOrbiting ? 'Pause' : 'Orbit'}
        </button>
      </div>

      <button
        type="button"
        className={`header-chip ${showLabels ? 'active' : ''}`}
        onClick={() => setShowLabels(s => !s)}
        title="Toggle Placenames (Oceans, Countries, Cities)"
      >
        <Tag size={12} /> Names
      </button>
    </div>
  );

  return (
    <div className="google-3d-maps-workspace">
      {portalEl && createPortal(toolbarContent, portalEl)}

      {/* 3D Scene Viewport Container */}
      <div ref={sceneWrapRef} className={`google-3d-scene ${isFullscreen ? 'is-fullscreen' : ''}`}>
        <div ref={container} className="cesium-host" />

        {/* Fallback top toolbar if portal not mounted or in fullscreen */}
        {(!portalEl || isFullscreen) && (
          <div className="globe-scene-top-toolbar">
            {toolbarContent}
          </div>
        )}

        {/* =========================================================================
            LEFT FLOATING INFORMATION & CONTROLS CARD (Google Maps 3D Platform Style)
            ========================================================================= */}
        {showInfoCard && (
          <div className="google-info-card docked-top">
            <div className="card-header-bar">
              <span className="card-badge">3D PERSPECTIVE & GUIDE</span>
              <button
                type="button"
                className="card-close-btn"
                onClick={() => setShowInfoCard(false)}
                aria-label="Close guide"
                title="Close guide panel"
              >
                <X size={15} />
              </button>
            </div>
            <div className="card-top-content">
              <h1 className="card-title">Immerse your users</h1>
            <p className="card-desc">
              Bring a new level of realism and immersion to your application with real-world 3D
              representation across global oceans, synchronized with autonomous Argo profiler soundings.
            </p>

            {/* Accordion 1: Control the camera */}
            <div className="google-accordion-item">
              <button
                className="accordion-header"
                onClick={() => setOpenSection(s => s === 'camera' ? null : 'camera')}
              >
                <span>Control the camera</span>
                {openSection === 'camera' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {openSection === 'camera' && (
                <div className="accordion-body">
                  <div className="body-cluster">
                    <span className="cluster-title">Perspective:</span>
                    <div className="pill-group">
                      <button className="control-chip" onClick={() => tiltView('horizon')}>
                        <Sliders size={12} /> 3D Horizon Tilt
                      </button>
                      <button className="control-chip" onClick={() => tiltView('nadir')}>
                        <Globe2 size={12} /> Nadir View
                      </button>
                      <button
                        className={`control-chip ${isOrbiting ? 'active-chip' : ''}`}
                        onClick={() => setIsOrbiting(p => !p)}
                      >
                        <Orbit size={12} /> {isOrbiting ? 'Pause Orbit' : 'Auto Orbit'}
                      </button>
                    </div>
                  </div>
                  <div className="body-cluster">
                    <span className="cluster-title">Quick Basins:</span>
                    <div className="pill-group">
                      {TOUR_LOCATIONS.map((loc, i) => (
                        <button
                          key={loc.name}
                          className={`control-chip ${tourIndex === i ? 'active-chip' : ''}`}
                          onClick={() => jumpTour(i)}
                        >
                          {loc.name.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 2: 4D Subsurface Ocean Data */}
            <div className="google-accordion-item">
              <button
                className="accordion-header"
                onClick={() => setOpenSection(s => s === 'data' ? null : 'data')}
              >
                <span>Explore 4D subsurface data</span>
                {openSection === 'data' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {openSection === 'data' && (
                <div className="accordion-body">
                  <label className="data-slider-label">
                    <span>Depth Window: <strong>0 – {maxVisibleDepth.toLocaleString()} m</strong></span>
                    <input
                      type="range"
                      min="0"
                      max="6000"
                      step="50"
                      value={maxVisibleDepth}
                      onChange={e => setMaxVisibleDepth(Number(e.target.value))}
                    />
                  </label>

                  <div className="data-options-row">
                    <label>
                      <span>Variable:</span>
                      <select value={variable} onChange={e => setLens(e.target.value as Variable)}>
                        {available.map(v => (
                          <option key={v} value={v}>{v.toUpperCase()}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Exaggeration:</span>
                      <select value={exaggeration} onChange={e => setExaggeration(Number(e.target.value))}>
                        <option value={1}>1×</option>
                        <option value={100}>100×</option>
                        <option value={300}>300×</option>
                      </select>
                    </label>
                  </div>

                  <div className="pill-group" style={{ marginTop: '8px' }}>
                    <button
                      className={`control-chip ${dive ? 'active-chip' : ''}`}
                      onClick={() => focusSubsurface(!dive)}
                      disabled={!result?.observations.length}
                    >
                      <ArrowDown size={12} /> {dive ? 'Exit Dive' : 'Dive Subsurface'}
                    </button>
                    {selectedProfile && (
                      <button
                        className="control-chip"
                        onClick={() => viewer.current?.camera.flyTo({ destination: Cartesian3.fromDegrees(selectedProfile.longitude, selectedProfile.latitude, 1_800_000), duration: 1.4 })}
                      >
                        <MapPin size={12} /> Float {selectedProfile.wmo}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Accordion 3: Imagery & Layers */}
            <div className="google-accordion-item">
              <button
                className="accordion-header"
                onClick={() => setOpenSection(s => s === 'layers' ? null : 'layers')}
              >
                <span>Map imagery & layers</span>
                {openSection === 'layers' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {openSection === 'layers' && (
                <div className="accordion-body">
                  <div className="pill-group">
                    {BASEMAP_OPTIONS.map(b => (
                      <button
                        key={b.id}
                        className={`control-chip ${basemap === b.id ? 'active-chip' : ''}`}
                        onClick={() => setBasemap(b.id)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="accordion-label" style={{ marginTop: '12px', fontSize: '10px', fontWeight: 600, color: '#88a3ae', textTransform: 'uppercase' }}>Graphics Quality</div>
                  <div className="pill-group" style={{ marginTop: '6px' }}>
                    {(['low', 'high', 'ultra'] as const).map(q => (
                      <button
                        key={q}
                        className={`control-chip ${graphicsQuality === q ? 'active-chip' : ''}`}
                        onClick={() => setGraphicsQuality(q)}
                        style={{ textTransform: 'capitalize' }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  <div className="checkbox-row" style={{ marginTop: '10px' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={showLabels}
                        onChange={e => setShowLabels(e.target.checked)}
                      />
                      <span><strong>Geographic Names</strong> (Oceans, Countries, Cities)</span>
                    </label>
                  </div>
                  <div className="checkbox-row" style={{ marginTop: '6px' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={showSoundings}
                        onChange={e => setShowSoundings(e.target.checked)}
                      />
                      <span>Sounding Beams</span>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={showHistory}
                        onChange={e => setShowHistory(e.target.checked)}
                      />
                      <span>Drift Trajectories</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Footer of Card */}
          <div className="card-footer-bar">
            <button className="home-btn" onClick={resetHome}>
              <Home size={15} />
              <span>HOME</span>
            </button>
            <div className="tour-stepper">
              <button
                className="step-arrow"
                title="Previous Location"
                onClick={() => jumpTour(tourIndex - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="step-count">{tourIndex + 1} / {TOUR_LOCATIONS.length}</span>
              <button
                className="step-arrow"
                title="Next Location"
                onClick={() => jumpTour(tourIndex + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

        {/* =========================================================================
            BOTTOM CENTER FLOATING PILL (Google Maps 3D Platform Tour Pill)
            ========================================================================= */}
        <div className="google-bottom-tour-pill">
          <button
            className="pill-nav-btn"
            title="Previous Location"
            onClick={() => jumpTour(tourIndex - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="pill-location-info">
            <strong>{activeTour.name}</strong>
          </div>
          <button
            className="pill-nav-btn"
            title="Next Location"
            onClick={() => jumpTour(tourIndex + 1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className={`pill-action-btn ${showLabels ? 'active' : ''}`}
            title={showLabels ? "Hide Geographic Names" : "Show Geographic Names (Oceans, Countries, Cities)"}
            onClick={() => setShowLabels(s => !s)}
          >
            <Tag size={15} />
          </button>
          <button
            className="pill-action-btn reset-btn"
            title="Reset Orientation"
            onClick={resetCompass}
          >
            <RotateCcw size={16} />
          </button>
        </div>

        {/* =========================================================================
            BOTTOM RIGHT CORNER TOOLS (Compass Rose & Fullscreen)
            ========================================================================= */}
        <div className="google-bottom-right-dock">
          <button
            className="corner-btn compass-icon-btn"
            title={`Compass Heading: ${headingDeg}° (Click to align North)`}
            onClick={resetCompass}
          >
            <Compass
              size={20}
              style={{ transform: `rotate(${-headingDeg}deg)`, transition: 'transform 0.15s ease' }}
            />
          </button>
          <button
            className="corner-btn"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            onClick={() => {
              if (!document.fullscreenElement) {
                container.current?.requestFullscreen();
              } else {
                document.exitFullscreen();
              }
            }}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>

        {/* Bottom Left Minimal Coordinates HUD */}
        <div className="google-coords-hud">
          <span>{cursorCoords ? `${Math.abs(cursorCoords.lat).toFixed(2)}° ${cursorCoords.lat >= 0 ? 'N' : 'S'}, ${Math.abs(cursorCoords.lon).toFixed(2)}° ${cursorCoords.lon >= 0 ? 'E' : 'W'}` : '08.00° S, 75.00° E'}</span>
          <span>·</span>
          <span>Eye: {camAltitude.toLocaleString()} km</span>
        </div>

        {/* Interactive Hover Tooltip */}
        {hoverTooltip && (
          <div
            className="globe-hover-card"
            style={{
              left: `${Math.min(window.innerWidth - 240, hoverTooltip.x + 16)}px`,
              top: `${Math.min(window.innerHeight - 150, hoverTooltip.y - 12)}px`,
            }}
          >
            <div className="hover-header">
              <strong>Float {hoverTooltip.wmo}</strong>
              <span>Cycle {hoverTooltip.cycle}</span>
            </div>
            {hoverTooltip.sample ? (
              <div className="hover-body">
                <div><span>Depth:</span> <strong>{hoverTooltip.depthM?.toFixed(1)} m</strong></div>
                <div><span>{variable}:</span> <strong>{hoverTooltip.valStr} {hoverTooltip.unit}</strong></div>
                <small>Click to inspect scientific sample</small>
              </div>
            ) : (
              <div className="hover-body">
                <small>Click to select float trajectory</small>
              </div>
            )}
          </div>
        )}

        {/* Scientific Variable Legend (Subtle Glass Badge) */}
        {!failure && (
          <div className="google-legend-badge">
            <div className="legend-head">
              <span>{variable} ({domain.units})</span>
            </div>
            <div className="legend-bar" />
            <div className="legend-labels">
              <span>{domain.min}</span>
              <span>{domain.max}</span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {!ready && !failure && (
          <div className="globe-loading" role="status">
            <div className="loading-spinner" />
            <span>Loading Photorealistic 3D Earth…</span>
          </div>
        )}

        {failure && (
          <div className="globe-failure" role="alert">
            <Info size={24} />
            <p>{failure}</p>
            <button className="button primary" onClick={onFallback}>Switch to 2D Map</button>
          </div>
        )}
      </div>

      {/* Profile Evidence Bar if inspecting */}
      {level && (
        <div className="google-evidence-bar">
          <div className="evidence-info">
            <Crosshair size={14} />
            <span>Inspecting Level {level.source_level}: <strong>{level.depth_m.toFixed(1)} m</strong></span>
            <span>·</span>
            <span>{variable}: <strong>{level[variable]?.toFixed(3) ?? '—'} {domain.units}</strong></span>
          </div>
          <button className="button primary" onClick={() => onInspect(level)}>
            View Measurement Evidence
          </button>
        </div>
      )}
    </div>
  );
}
