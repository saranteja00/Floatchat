import { useEffect, useState } from 'react';
import { Cartesian3, HeadingPitchRange, Matrix4, Math as CesiumMath, Viewer } from 'cesium';
import type { Profile } from '../types';

export const TOUR_LOCATIONS = [
  { name: 'Indian Ocean Overview', lon: 75.0, lat: -8.0, height: 10_500_000, desc: 'Central Argo observation array & ocean currents' },
  { name: 'Arabian Sea Basin', lon: 64.0, lat: 16.0, height: 3_800_000, desc: 'High evaporation & warm saline water mass' },
  { name: 'Bay of Bengal Deep', lon: 89.0, lat: 14.0, height: 3_800_000, desc: 'Freshwater river discharge & stratified layers' },
  { name: 'Equatorial Current Belt', lon: 73.5, lat: -2.0, height: 3_200_000, desc: 'Equatorial thermocline & dynamic heat transport' },
  { name: 'Chagos-Laccadive Plateau', lon: 72.5, lat: -6.0, height: 2_400_000, desc: 'Submerged volcanic ridge & deep water soundings' },
  { name: 'Southern Ocean Convergence', lon: 75.0, lat: -50.0, height: 7_000_000, desc: 'Subantarctic water mass boundary' },
];

export function useGlobeCamera({
  viewerRef,
  profiles,
  selectedProfileId,
  exaggeration,
}: {
  viewerRef: React.RefObject<Viewer | null>;
  profiles: Profile[];
  selectedProfileId: string;
  exaggeration: number;
}) {
  const [tourIndex, setTourIndex] = useState(0);
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [dive, setDive] = useState(false);

  // Cinematic Auto-Orbit Spin
  useEffect(() => {
    if (!isOrbiting || !viewerRef.current || viewerRef.current.isDestroyed()) return;
    let animId: number;
    const rotateLoop = () => {
      const inst = viewerRef.current;
      if (inst && !inst.isDestroyed() && isOrbiting) {
        inst.scene.camera.rotate(Cartesian3.UNIT_Z, -0.0008);
        inst.scene.requestRender();
        animId = requestAnimationFrame(rotateLoop);
      }
    };
    animId = requestAnimationFrame(rotateLoop);
    return () => cancelAnimationFrame(animId);
  }, [isOrbiting, viewerRef]);

  const jumpTour = (index: number) => {
    const inst = viewerRef.current;
    if (!inst || inst.isDestroyed()) return;
    let newIndex = index;
    if (newIndex < 0) newIndex = TOUR_LOCATIONS.length - 1;
    if (newIndex >= TOUR_LOCATIONS.length) newIndex = 0;
    setTourIndex(newIndex);
    const loc = TOUR_LOCATIONS[newIndex];

    inst.camera.flyTo({
      destination: Cartesian3.fromDegrees(loc.lon, loc.lat, loc.height),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-88), roll: 0 },
      duration: 1.5,
    });
  };

  const resetHome = () => {
    const inst = viewerRef.current;
    if (!inst || inst.isDestroyed()) return;
    inst.camera.flyTo({
      destination: Cartesian3.fromDegrees(75, -8, 10_500_000),
      orientation: { heading: 0, pitch: CesiumMath.toRadians(-88), roll: 0 },
      duration: 1.5,
    });
  };

  const resetCompass = () => {
    const inst = viewerRef.current;
    if (!inst || inst.isDestroyed()) return;
    const carto = inst.camera.positionCartographic;
    inst.camera.flyTo({
      destination: Cartesian3.fromRadians(
        carto.longitude,
        carto.latitude,
        carto.height
      ),
      orientation: { heading: 0, pitch: inst.camera.pitch, roll: 0 },
      duration: 1.0,
    });
  };

  const tiltView = (mode: 'horizon' | 'nadir') => {
    const inst = viewerRef.current;
    if (!inst || inst.isDestroyed()) return;
    const carto = inst.camera.positionCartographic;
    const lon = CesiumMath.toDegrees(carto.longitude);
    const lat = CesiumMath.toDegrees(carto.latitude);

    if (mode === 'horizon') {
      inst.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat, Math.min(carto.height, 4_500_000)),
        orientation: {
          heading: inst.camera.heading,
          pitch: CesiumMath.toRadians(-35),
          roll: 0,
        },
        duration: 1.2,
      });
    } else {
      inst.camera.flyTo({
        destination: Cartesian3.fromDegrees(lon, lat, carto.height),
        orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
        duration: 1.2,
      });
    }
  };

  const focusSubsurface = (close: boolean) => {
    const instance = viewerRef.current;
    if (!instance || instance.isDestroyed()) return;
    instance.scene.globe.translucency.enabled = close;
    const profile = profiles.find(p => p.id === selectedProfileId);

    if (close && profile) {
      instance.camera.lookAt(
        Cartesian3.fromDegrees(profile.longitude, profile.latitude, -350 * exaggeration),
        new HeadingPitchRange(
          CesiumMath.toRadians(35),
          CesiumMath.toRadians(-25),
          Math.max(220_000, exaggeration * 6000)
        )
      );
      instance.camera.lookAtTransform(Matrix4.IDENTITY);
    } else {
      instance.camera.setView({ destination: Cartesian3.fromDegrees(75, -8, 10_500_000) });
    }
    instance.scene.requestRender();
    setDive(close);
  };

  useEffect(() => {
    if (dive) focusSubsurface(true);
  }, [selectedProfileId, exaggeration]);

  return {
    tourIndex,
    isOrbiting,
    setIsOrbiting,
    dive,
    setDive,
    jumpTour,
    resetHome,
    resetCompass,
    tiltView,
    focusSubsurface
  };
}
