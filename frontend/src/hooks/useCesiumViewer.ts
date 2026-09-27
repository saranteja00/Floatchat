import { useEffect, useRef, useState } from 'react';
import {
  Viewer, Cartesian2, Cartesian3, Cartographic, Color, CustomDataSource, EllipsoidTerrainProvider,
  GeoJsonDataSource, Math as CesiumMath, Rectangle, ArcType, ConstantProperty,
  SkyAtmosphere, SkyBox, ScreenSpaceEventHandler, ScreenSpaceEventType
} from 'cesium';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import landData from 'world-atlas/land-110m.json';
import { COLOR_DOMAINS } from '../exploration';
import type { Observation, Variable } from '../types';

const land = feature(
  landData as unknown as Topology<{ land: GeometryCollection }>,
  (landData as unknown as Topology<{ land: GeometryCollection }>).objects.land
);

interface HoverTooltip {
  x: number;
  y: number;
  profileId: string;
  wmo: string;
  cycle: number;
  sample?: Observation;
  depthM?: number;
  valStr?: string;
  unit?: string;
}

export function useCesiumViewer({
  containerRef,
  graphicsQuality,
  variable,
  callbacks,
  picks
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  graphicsQuality: 'low' | 'high' | 'ultra';
  variable: Variable;
  callbacks: React.MutableRefObject<{ onSelect: (id: string) => void; onInspect: (sample: Observation) => void }>;
  picks: React.MutableRefObject<Map<string, { profileId: string; sample?: Observation; wmo?: string; cycle?: number }>>;
}) {
  const viewer = useRef<Viewer | null>(null);
  const landSource = useRef<GeoJsonDataSource | null>(null);
  const observations = useRef<CustomDataSource | null>(null);
  const geoLabelsSource = useRef<CustomDataSource | null>(null);

  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState('');
  const [cursorCoords, setCursorCoords] = useState<{ lon: number; lat: number } | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltip | null>(null);
  const [camAltitude, setCamAltitude] = useState<number>(10500);
  const [headingDeg, setHeadingDeg] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    let instance: Viewer | null = null;
    let handler: ScreenSpaceEventHandler | null = null;
    let removeRenderError: (() => void) | undefined;
    let removeCameraChange: (() => void) | undefined;

    try {
      const celestialSkybox = new SkyBox({
        sources: {
          positiveX: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_px.jpg',
          negativeX: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_mx.jpg',
          positiveY: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_py.jpg',
          negativeY: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_my.jpg',
          positiveZ: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_pz.jpg',
          negativeZ: '/cesium/Assets/Textures/SkyBox/tycho2t3_80_mz.jpg',
        }
      });

      instance = new Viewer(containerRef.current!, {
        baseLayer: false,
        baseLayerPicker: false,
        terrainProvider: new EllipsoidTerrainProvider(),
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        skyBox: celestialSkybox,
        skyAtmosphere: new SkyAtmosphere(),
        showRenderLoopErrors: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        useBrowserRecommendedResolution: graphicsQuality === 'low',
        msaaSamples: graphicsQuality === 'ultra' ? 8 : graphicsQuality === 'high' ? 4 : 1,
      });
      instance.resolutionScale = graphicsQuality === 'ultra' ? Math.max(window.devicePixelRatio || 1.0, 2.0) : graphicsQuality === 'high' ? (window.devicePixelRatio || 1.0) : 1.0;
      instance.scene.globe.maximumScreenSpaceError = graphicsQuality === 'ultra' ? 0.5 : graphicsQuality === 'high' ? 1.0 : 2.0;
      instance.scene.globe.tileCacheSize = graphicsQuality === 'ultra' ? 2000 : 1000;
      viewer.current = instance;

      instance.scene.backgroundColor = Color.fromCssColorString('#020610');
      instance.scene.globe.baseColor = Color.fromCssColorString('#0a2036');
      instance.scene.globe.showGroundAtmosphere = false;
      instance.scene.globe.enableLighting = false;
      instance.scene.globe.depthTestAgainstTerrain = true;
      instance.scene.globe.translucency.enabled = false;
      instance.scene.globe.translucency.frontFaceAlpha = 0.40;
      instance.scene.globe.translucency.backFaceAlpha = 0.95;
      instance.scene.globe.translucency.rectangle = Rectangle.fromDegrees(20, -55, 125, 30);
      instance.scene.screenSpaceCameraController.enableCollisionDetection = false;
      instance.scene.screenSpaceCameraController.minimumZoomDistance = 3000;

      if (instance.scene.skyAtmosphere) {
        instance.scene.skyAtmosphere.show = true;
        instance.scene.skyAtmosphere.hueShift = 0.0;
        instance.scene.skyAtmosphere.saturationShift = 0.0;
        instance.scene.skyAtmosphere.brightnessShift = 0.0;
      }
      if (instance.scene.sun) instance.scene.sun.show = false;
      if (instance.scene.moon) instance.scene.moon.show = false;

      if (instance.scene.postProcessStages?.fxaa) {
        instance.scene.postProcessStages.fxaa.enabled = true;
      }
      if (instance.scene.postProcessStages?.bloom) {
        instance.scene.postProcessStages.bloom.enabled = false;
      }

      instance.camera.setView({
        destination: Cartesian3.fromDegrees(75, -8, 10_500_000),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-88), roll: 0 },
      });

      const source = new CustomDataSource('Argo 4D Earth Space');
      observations.current = source;
      void instance.dataSources.add(source);

      const labelsSource = new CustomDataSource('Geographic Labels');
      geoLabelsSource.current = labelsSource;
      void instance.dataSources.add(labelsSource);

      removeCameraChange = instance.camera.changed.addEventListener(() => {
        if (!instance || instance.isDestroyed()) return;
        const h = Math.round(instance.camera.positionCartographic.height / 1000);
        setCamAltitude(h);
        const heading = Math.round(CesiumMath.toDegrees(instance.camera.heading));
        setHeadingDeg(heading);
      });

      removeRenderError = instance.scene.renderError.addEventListener(() => {
        if (!cancelled) setFailure('This browser could not render the 3D Globe. The 2D map remains available.');
      });

      const currentViewer = instance;
      void GeoJsonDataSource.load(land, {
        fill: Color.fromCssColorString('#11283a').withAlpha(0.92),
        stroke: Color.fromCssColorString('#2ad1b5').withAlpha(0.70),
        strokeWidth: 1.5,
        clampToGround: false,
      }).then(lSource => {
        if (!cancelled && !currentViewer.isDestroyed()) {
          for (const entity of lSource.entities.values) {
            if (entity.polygon) entity.polygon.arcType = new ConstantProperty(ArcType.GEODESIC);
          }
          landSource.current = lSource;
          lSource.show = currentViewer.imageryLayers.length === 0;
          void currentViewer.dataSources.add(lSource);
          currentViewer.scene.requestRender();
        }
      }).catch(() => {
        if (!cancelled) setFailure('The local globe basemap could not load.');
      });

      handler = new ScreenSpaceEventHandler(instance.scene.canvas);

      handler.setInputAction((event: { position: Cartesian2 }) => {
        const picked = currentViewer.scene.pick(event.position);
        const item = picks.current.get(picked?.id?.id);
        if (item?.sample) callbacks.current.onInspect(item.sample);
        else if (item) callbacks.current.onSelect(item.profileId);
      }, ScreenSpaceEventType.LEFT_CLICK);

      handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
        if (currentViewer.isDestroyed()) return;
        const ray = currentViewer.camera.getPickRay(movement.endPosition);
        if (ray) {
          const cartesian = currentViewer.scene.globe.pick(ray, currentViewer.scene);
          if (cartesian) {
            const carto = Cartographic.fromCartesian(cartesian);
            setCursorCoords({
              lon: CesiumMath.toDegrees(carto.longitude),
              lat: CesiumMath.toDegrees(carto.latitude),
            });
          }
        }

        const picked = currentViewer.scene.pick(movement.endPosition);
        const item = picks.current.get(picked?.id?.id);
        if (item) {
          setHoverTooltip({
            x: movement.endPosition.x,
            y: movement.endPosition.y,
            profileId: item.profileId,
            wmo: item.wmo ?? 'Argo Float',
            cycle: item.cycle ?? 0,
            sample: item.sample,
            depthM: item.sample?.depth_m,
            valStr: item.sample ? item.sample[variable]?.toFixed(2) : undefined,
            unit: COLOR_DOMAINS[variable].units,
          });
        } else {
          setHoverTooltip(null);
        }
      }, ScreenSpaceEventType.MOUSE_MOVE);

      instance.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
      instance.canvas.setAttribute('aria-label', 'Google 3D Maps Style Interactive Earth with Real-World Argo Observations');
      setReady(true);
    } catch {
      setFailure('WebGL is unavailable in this browser. Use the 2D map and depth charts to continue your investigation.');
    }

    return () => {
      cancelled = true;
      removeRenderError?.();
      removeCameraChange?.();
      handler?.destroy();
      if (instance && !instance.isDestroyed()) instance.destroy();
      viewer.current = null;
      observations.current = null;
      landSource.current = null;
      geoLabelsSource.current = null;
    };
  }, []); // Note: The original code passed an empty dependency array to prevent viewer recreation

  // Watch for graphicsQuality changes and gracefully apply them without recreation
  useEffect(() => {
    if (!viewer.current || viewer.current.isDestroyed()) return;
    const inst = viewer.current;
    
    // Low
    let scale = 1.0;
    let sse = 2.0;
    let msaa = 1;
    let cache = 1000;

    if (graphicsQuality === 'high') {
      scale = window.devicePixelRatio || 1.0;
      sse = 1.0;
      msaa = 4;
    } else if (graphicsQuality === 'ultra') {
      scale = Math.max(window.devicePixelRatio || 1.0, 2.0);
      sse = 0.5;
      msaa = 8;
      cache = 2000;
    }

    inst.resolutionScale = scale;
    inst.scene.msaaSamples = msaa;
    inst.scene.globe.maximumScreenSpaceError = sse;
    inst.scene.globe.tileCacheSize = cache;
    inst.scene.requestRender();
  }, [graphicsQuality]);

  return {
    viewer,
    landSource,
    observations,
    geoLabelsSource,
    ready,
    failure,
    cursorCoords,
    hoverTooltip,
    camAltitude,
    headingDeg
  };
}
