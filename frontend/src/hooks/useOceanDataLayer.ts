import { useEffect } from 'react';
import { Cartesian2, Cartesian3, Color, CustomDataSource, LabelStyle, PolylineDashMaterialProperty, PolylineGlowMaterialProperty, VerticalOrigin, Viewer } from 'cesium';
import { floatColor, type Profile, type ProfileResult, type Variable, type Observation } from '../types';
import { COLOR_DOMAINS, colorFraction, displayHeight } from '../exploration';

const tint = (value: number | null, variable: Variable) => {
  const fraction = colorFraction(value, variable);
  return fraction === null ? Color.fromCssColorString('#8f9da6') : Color.fromHsl((1 - fraction) * 0.64, 0.85, 0.60);
};

export function useOceanDataLayer({
  viewerRef,
  observationsRef,
  picksRef,
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
  level,
}: {
  viewerRef: React.RefObject<Viewer | null>;
  observationsRef: React.RefObject<CustomDataSource | null>;
  picksRef: React.MutableRefObject<Map<string, { profileId: string; sample?: Observation; wmo?: string; cycle?: number }>>;
  ready: boolean;
  profiles: Profile[];
  selected: string;
  result: ProfileResult | null;
  results?: ProfileResult[];
  exaggeration: number;
  variable: Variable;
  maxVisibleDepth: number;
  showHistory: boolean;
  showSoundings: boolean;
  level?: Observation;
}) {
  useEffect(() => {
    const instance = viewerRef.current;
    const source = observationsRef.current;
    if (!ready || !instance || instance.isDestroyed() || !source) return;

    source.entities.removeAll();
    picksRef.current.clear();

    // 1. Surface float beacons
    for (const profile of profiles) {
      const active = profile.id === selected;
      const id = `profile:${profile.id}`;
      const pos = Cartesian3.fromDegrees(profile.longitude, profile.latitude, 0);

      source.entities.add({
        id,
        position: pos,
        point: {
          pixelSize: active ? 14 : 7,
          color: active ? Color.fromCssColorString('#00f5b4') : Color.fromCssColorString(floatColor(profile.wmo)),
          outlineColor: active ? Color.WHITE : Color.fromCssColorString('#041624'),
          outlineWidth: active ? 2.5 : 1,
        },
        ...(active ? {
          label: {
            text: `Float ${profile.wmo} · Cycle ${profile.cycle}`,
            font: 'bold 11px "Inter", Roboto, sans-serif',
            fillColor: Color.WHITE,
            outlineColor: Color.fromCssColorString('#041420'),
            outlineWidth: 3,
            style: LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cartesian2(0, -22),
            verticalOrigin: VerticalOrigin.BOTTOM,
          }
        } : {}),
      });

      if (active) {
        source.entities.add({
          position: pos,
          ellipse: {
            semiMinorAxis: 40000,
            semiMajorAxis: 40000,
            material: Color.fromCssColorString('#00f5b4').withAlpha(0.2),
            outline: true,
            outlineColor: Color.fromCssColorString('#00f5b4'),
            outlineWidth: 1.5,
          }
        });
      }

      picksRef.current.set(id, { profileId: profile.id, wmo: profile.wmo, cycle: profile.cycle });
    }

    // 2. Drift tracks
    if (showHistory) {
      for (const wmo of new Set(profiles.map(p => p.wmo))) {
        const history = profiles.filter(p => p.wmo === wmo).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        if (history.length > 1) {
          source.entities.add({
            polyline: {
              positions: history.map(p => Cartesian3.fromDegrees(p.longitude, p.latitude, 0)),
              width: 1.8,
              material: new PolylineDashMaterialProperty({
                color: Color.fromCssColorString(floatColor(wmo)).withAlpha(0.8),
                dashLength: 10,
              }),
            }
          });
        }
      }
    }

    // 3. Subsurface depth sounding columns
    const visibleIds = new Set(profiles.map(p => p.id));
    const columns = results
      ? results.filter(r => visibleIds.has(r.profile.id))
      : (result && result.profile.id === selected ? [result] : []);

    for (const column of columns) {
      const { latitude, longitude, id: profId, wmo, cycle } = column.profile;
      const validSamples = column.observations.filter(o => o.depth_m <= maxVisibleDepth);
      if (!validSamples.length) continue;

      const isSelectedColumn = profId === selected;
      const deepestSample = validSamples[validSamples.length - 1];

      if (showSoundings) {
        const surfacePos = Cartesian3.fromDegrees(longitude, latitude, 0);
        const bottomPos = Cartesian3.fromDegrees(
          longitude,
          latitude,
          displayHeight(deepestSample.depth_m, exaggeration)
        );

        source.entities.add({
          polyline: {
            positions: [surfacePos, bottomPos],
            width: isSelectedColumn ? 3 : 1.2,
            material: isSelectedColumn
              ? new PolylineGlowMaterialProperty({
                  glowPower: 0.25,
                  taperPower: 0.75,
                  color: Color.fromCssColorString('#00f5b4'),
                })
              : new PolylineDashMaterialProperty({
                  color: Color.fromCssColorString('#38c8f5').withAlpha(0.45),
                  dashLength: 8,
                }),
          },
        });
      }

      for (const sample of validSamples) {
        const id = `level:${column.result_id}:${sample.source_level}`;
        const highlighted = isSelectedColumn && sample.source_level === level?.source_level;
        const sampleAlt = displayHeight(sample.depth_m, exaggeration);
        const samplePos = Cartesian3.fromDegrees(longitude, latitude, sampleAlt);

        source.entities.add({
          id,
          position: samplePos,
          point: {
            pixelSize: highlighted ? 11 : isSelectedColumn ? 5.5 : 3.5,
            color: tint(sample[variable], variable),
            outlineColor: highlighted ? Color.WHITE : Color.fromCssColorString('#031422'),
            outlineWidth: highlighted ? 2.5 : 0.8,
          },
          ...(highlighted ? {
            label: {
              text: `${sample[variable]?.toFixed(2) ?? '—'} ${COLOR_DOMAINS[variable].units} · ${sample.depth_m.toFixed(0)}m`,
              font: 'bold 11px "Inter", sans-serif',
              fillColor: Color.WHITE,
              outlineColor: Color.fromCssColorString('#041624'),
              outlineWidth: 3,
              style: LabelStyle.FILL_AND_OUTLINE,
              pixelOffset: new Cartesian2(12, 0),
              verticalOrigin: VerticalOrigin.CENTER,
            }
          } : {}),
        });

        picksRef.current.set(id, {
          profileId: column.profile.id,
          sample,
          wmo,
          cycle,
        });
      }
    }

    instance.scene.requestRender();
  }, [
    profiles, selected, result, results, exaggeration, variable,
    level?.source_level, ready, maxVisibleDepth, showHistory, showSoundings, viewerRef, observationsRef, picksRef
  ]);
}
