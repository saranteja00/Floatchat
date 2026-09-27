import re

with open('c:/Users/sssar/Downloads/floatchart-vv/floatchart-main/frontend/src/components/OceanGlobe.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Imports
code = code.replace(
    "import { COLOR_DOMAINS, colorFraction, displayHeight } from '../exploration';",
    "import { COLOR_DOMAINS, colorFraction, displayHeight } from '../exploration';\nimport { useCesiumViewer } from '../hooks/useCesiumViewer';\nimport { useGlobeCamera, TOUR_LOCATIONS } from '../hooks/useGlobeCamera';\nimport { useOceanDataLayer } from '../hooks/useOceanDataLayer';"
)

# Remove local TOUR_LOCATIONS
code = re.sub(r'// Interactive Showcase Tour Locations.*?\];\n', '', code, flags=re.DOTALL)

# Remove HoverTooltip interface
code = re.sub(r'interface HoverTooltip \{.*?\}\n', '', code, flags=re.DOTALL)

# Refactor component body start
repl = '''  const container = useRef<HTMLDivElement>(null);
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
    containerRef: container,
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
'''

# Find the start of the component body to replace
start_idx = code.find('  const container = useRef<HTMLDivElement>(null);')
end_idx = code.find('  useEffect(() => { callbacks.current = { onSelect, onInspect }; }, [onSelect, onInspect]);')
code = code[:start_idx] + repl + code[end_idx:]

# Remove viewer init effect
code = re.sub(r'  // Initialize Cesium with Photorealistic Natural Earth.*?  }, \[\]\);\n', '', code, flags=re.DOTALL)

# Remove auto orbit
code = re.sub(r'  // Cinematic Auto-Orbit Spin.*?  }, \[isOrbiting\]\);\n', '', code, flags=re.DOTALL)

# Remove 4D Argo Observations
code = re.sub(r'  // Populate 4D Argo Observations.*?  \]\);\n', '', code, flags=re.DOTALL)

# Remove Camera Fly-To & Tour Navigation
code = re.sub(r'  // Camera Fly-To & Tour Navigation.*?  }, \[selected, exaggeration\]\);\n', '', code, flags=re.DOTALL)

# Find the "flyTo(selectedProfile.longitude" and replace it to use viewer directly since flyTo isn't returned natively 
code = code.replace(
    'flyTo(selectedProfile.longitude, selectedProfile.latitude, 1_800_000)',
    'viewer.current?.camera.flyTo({ destination: Cartesian3.fromDegrees(selectedProfile.longitude, selectedProfile.latitude, 1_800_000), duration: 1.4 })'
)

with open('c:/Users/sssar/Downloads/floatchart-vv/floatchart-main/frontend/src/components/OceanGlobe.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Refactored!")
