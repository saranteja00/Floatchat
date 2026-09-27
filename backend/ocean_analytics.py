"""Oceanographic analytics module for FloatChat.

Calculates TEOS-10 / UNESCO potential density (sigma_theta),
classifies water masses, estimates Mixed Layer Depth (MLD),
detects Marine Heatwaves (MHW), generates executive summaries,
and exports oceanographic GeoJSON feature collections.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


def compute_potential_density(temperature_c: float, salinity_psu: float) -> float:
    """
    Computes UNESCO 1983 (EOS-80) potential density anomaly sigma_theta (kg/m^3) at surface reference (p=0).
    sigma_theta = density(S, T, 0) - 1000 kg/m^3.
    """
    t = float(temperature_c)
    s = float(salinity_psu)

    # Pure water density at 1 atm
    rho_w = (
        999.842594
        + 6.793952e-2 * t
        - 9.09529e-3 * (t**2)
        + 1.001685e-4 * (t**3)
        - 1.120083e-6 * (t**4)
        + 6.536332e-9 * (t**5)
    )

    a = (
        8.24493e-1
        - 4.0899e-3 * t
        + 7.6438e-5 * (t**2)
        - 8.2467e-7 * (t**3)
        + 5.3875e-9 * (t**4)
    )
    b = -5.72466e-3 + 1.0227e-4 * t - 1.6546e-6 * (t**2)
    c = 4.8314e-4

    rho = rho_w + a * s + b * (s**1.5) + c * (s**2)
    return max(0.0, rho - 1000.0)


def classify_water_mass(temperature_c: float, salinity_psu: float, depth_m: float) -> str:
    """
    Classifies an observed (T, S, depth) sample into major Indian Ocean water masses.
    """
    t = float(temperature_c)
    s = float(salinity_psu)
    sigma = compute_potential_density(t, s)

    if depth_m > 1500 or t < 3.0:
        return "Deep & Bottom Water (DBW)"
    if 300 <= depth_m <= 1200 and 3.0 <= t <= 8.0 and 34.0 <= s <= 34.8:
        return "Antarctic Intermediate Water (AAIW)"
    if s < 34.5 and t >= 23.0 and depth_m <= 200:
        return "Bay of Bengal Water (BBW)"
    if s >= 35.5 and t >= 19.0 and depth_m <= 200:
        return "Arabian Sea High Salinity Water (ASHW)"
    if 34.5 <= s <= 35.8 and 8.0 <= t <= 19.0 and 25.2 <= sigma <= 27.2:
        return "Indian Ocean Central Water (IOCW)"
    if depth_m <= 100 and t >= 25.0:
        return "Tropical Surface Water (TSW)"

    return "Equatorial / Mixed Water (EQW)"


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates Haversine distance in km between two lat/lon coordinates."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def calculate_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates initial compass bearing in degrees (0-360) from point 1 to point 2."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lambda = math.radians(lon2 - lon1)
    y = math.sin(delta_lambda) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lambda)
    theta = math.atan2(y, x)
    return (math.degrees(theta) + 360.0) % 360.0


def calculate_drift_velocities(query_result: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Calculates 1000m parking depth subsurface Lagrangian drift velocity vectors (v_drift in cm/s and bearing)
    between consecutive cycles for each float.
    """
    from datetime import datetime
    profiles = query_result.get("profiles", [])
    floats_map: Dict[str, List[Dict[str, Any]]] = {}

    for pr in profiles:
        p_info = pr.get("profile", {})
        wmo = p_info.get("wmo")
        if wmo not in floats_map:
            floats_map[wmo] = []
        floats_map[wmo].append(p_info)

    drift_results: List[Dict[str, Any]] = []

    for wmo, float_profs in floats_map.items():
        sorted_profs = sorted(float_profs, key=lambda x: x.get("cycle", 0))
        for i in range(1, len(sorted_profs)):
            p1 = sorted_profs[i - 1]
            p2 = sorted_profs[i]

            lat1, lon1 = p1.get("latitude"), p1.get("longitude")
            lat2, lon2 = p2.get("latitude"), p2.get("longitude")
            t1_str, t2_str = p1.get("timestamp"), p2.get("timestamp")

            if None in (lat1, lon1, lat2, lon2, t1_str, t2_str):
                continue

            try:
                t1 = datetime.fromisoformat(t1_str.replace("Z", "+00:00"))
                t2 = datetime.fromisoformat(t2_str.replace("Z", "+00:00"))
                delta_sec = (t2 - t1).total_seconds()
                if delta_sec <= 0:
                    continue

                dist_km = haversine_distance_km(lat1, lon1, lat2, lon2)
                speed_cm_s = (dist_km * 100000.0) / delta_sec
                bearing = calculate_bearing_deg(lat1, lon1, lat2, lon2)

                drift_results.append({
                    "wmo": wmo,
                    "from_cycle": p1.get("cycle"),
                    "to_cycle": p2.get("cycle"),
                    "from_profile_id": p1.get("id"),
                    "to_profile_id": p2.get("id"),
                    "distance_km": round(dist_km, 2),
                    "time_delta_days": round(delta_sec / 86400.0, 2),
                    "speed_cm_s": round(speed_cm_s, 2),
                    "bearing_deg": round(bearing, 1),
                    "lat": lat2,
                    "lon": lon2,
                })
            except Exception:
                continue

    return drift_results



def calculate_profile_mld(observations: List[Dict[str, Any]]) -> Dict[str, Optional[float]]:
    """
    Estimates Mixed Layer Depth (MLD) using:
    1. Temperature criterion (mld_temp): depth where T <= T_ref - 0.2 °C (T_ref at z <= 10m)
    2. Density criterion (mld_density): depth where sigma <= sigma_ref + 0.03 kg/m^3
    """
    valid_obs = [
        o for o in sorted(observations, key=lambda x: x["depth_m"])
        if o["temperature"] is not None and o["salinity"] is not None
    ]
    if not valid_obs:
        return {"mld_temp_m": None, "mld_density_m": None, "surface_temp_c": None, "surface_sal_psu": None}

    ref_obs = next((o for o in valid_obs if o["depth_m"] <= 15), valid_obs[0])
    ref_temp = ref_obs["temperature"]
    ref_sal = ref_obs["salinity"]
    ref_sigma = compute_potential_density(ref_temp, ref_sal)

    mld_temp = None
    mld_density = None

    for obs in valid_obs:
        if obs["depth_m"] < ref_obs["depth_m"]:
            continue
        curr_temp = obs["temperature"]
        curr_sigma = compute_potential_density(obs["temperature"], obs["salinity"])

        if mld_temp is None and curr_temp <= (ref_temp - 0.2):
            mld_temp = obs["depth_m"]

        if mld_density is None and curr_sigma >= (ref_sigma + 0.03):
            mld_density = obs["depth_m"]

        if mld_temp is not None and mld_density is not None:
            break

    return {
        "mld_temp_m": round(mld_temp, 1) if mld_temp is not None else None,
        "mld_density_m": round(mld_density, 1) if mld_density is not None else None,
        "surface_temp_c": round(ref_temp, 2),
        "surface_sal_psu": round(ref_sal, 2),
    }


def analyze_marine_heatwaves(query_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Detects Marine Heatwave (MHW) events across surface (0-50m) and subsurface (50-200m) observations.
    Calculates temperature anomalies relative to the dataset 90th percentile baseline threshold.
    """
    profiles = query_result.get("profiles", [])
    all_surface_temps: List[float] = []
    all_subsurface_temps: List[float] = []

    profile_mhw_list: List[Dict[str, Any]] = []

    for pr in profiles:
        obs_list = pr.get("observations", [])
        p_info = pr.get("profile", {})
        surf_temps = [o["temperature"] for o in obs_list if o["depth_m"] <= 50 and o["temperature"] is not None]
        sub_temps = [o["temperature"] for o in obs_list if 50 < o["depth_m"] <= 200 and o["temperature"] is not None]

        all_surface_temps.extend(surf_temps)
        all_subsurface_temps.extend(sub_temps)

    # 90th percentile baselines (default fallback: 29.5 °C for surface in Indian Ocean)
    surf_sorted = sorted(all_surface_temps) if all_surface_temps else [29.0]
    sub_sorted = sorted(all_subsurface_temps) if all_subsurface_temps else [24.0]

    surf_p90 = surf_sorted[int(len(surf_sorted) * 0.90)] if surf_sorted else 29.0
    sub_p90 = sub_sorted[int(len(sub_sorted) * 0.90)] if sub_sorted else 24.0

    severity_counts = {"Normal": 0, "Moderate": 0, "Strong": 0, "Severe": 0, "Extreme": 0}

    for pr in profiles:
        obs_list = pr.get("observations", [])
        p_info = pr.get("profile", {})
        surf_obs = [o["temperature"] for o in obs_list if o["depth_m"] <= 50 and o["temperature"] is not None]
        max_surf_t = max(surf_obs) if surf_obs else None

        anomaly = (max_surf_t - surf_p90) if max_surf_t is not None else 0.0

        if anomaly <= 0:
            severity = "Normal"
        elif anomaly < 1.0:
            severity = "Moderate"
        elif anomaly < 2.0:
            severity = "Strong"
        elif anomaly < 3.0:
            severity = "Severe"
        else:
            severity = "Extreme"

        severity_counts[severity] += 1

        profile_mhw_list.append({
            "profile_id": p_info.get("id"),
            "wmo": p_info.get("wmo"),
            "cycle": p_info.get("cycle"),
            "timestamp": p_info.get("timestamp"),
            "max_surface_temp": round(max_surf_t, 2) if max_surf_t else None,
            "surface_anomaly": round(anomaly, 2),
            "severity": severity,
        })

    mhw_detected_count = sum(v for k, v in severity_counts.items() if k != "Normal")

    return {
        "surface_p90_threshold_c": round(surf_p90, 2),
        "subsurface_p90_threshold_c": round(sub_p90, 2),
        "total_profiles_analyzed": len(profiles),
        "mhw_detected_profiles": mhw_detected_count,
        "severity_breakdown": severity_counts,
        "profiles": profile_mhw_list,
    }


def compute_ocean_analytics(query_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Aggregates oceanographic analytics for a completed query:
    1. Mixed Layer Depth (MLD) per profile & regional mean.
    2. Water mass classification counts & percentages.
    3. Marine Heatwave (MHW) assessment.
    4. Generated AI / Natural Language Executive Summary.
    """
    profiles = query_result.get("profiles", [])
    water_mass_counts: Dict[str, int] = {}
    total_valid_samples = 0

    mld_temp_list: List[float] = []
    mld_density_list: List[float] = []

    profile_summaries: List[Dict[str, Any]] = []

    for pr in profiles:
        p_info = pr.get("profile", {})
        obs_list = pr.get("observations", [])
        mld = calculate_profile_mld(obs_list)

        if mld["mld_temp_m"] is not None:
            mld_temp_list.append(mld["mld_temp_m"])
        if mld["mld_density_m"] is not None:
            mld_density_list.append(mld["mld_density_m"])

        # Water mass calculation
        wm_profile_counts: Dict[str, int] = {}
        for o in obs_list:
            if o["temperature"] is not None and o["salinity"] is not None and o["depth_m"] is not None:
                wm = classify_water_mass(o["temperature"], o["salinity"], o["depth_m"])
                water_mass_counts[wm] = water_mass_counts.get(wm, 0) + 1
                wm_profile_counts[wm] = wm_profile_counts.get(wm, 0) + 1
                total_valid_samples += 1

        primary_wm = max(wm_profile_counts.items(), key=lambda x: x[1])[0] if wm_profile_counts else "Unknown"

        profile_summaries.append({
            "profile_id": p_info.get("id"),
            "wmo": p_info.get("wmo"),
            "cycle": p_info.get("cycle"),
            "timestamp": p_info.get("timestamp"),
            "latitude": p_info.get("latitude"),
            "longitude": p_info.get("longitude"),
            "mld": mld,
            "primary_water_mass": primary_wm,
        })

    mhw_analysis = analyze_marine_heatwaves(query_result)
    drift_velocities = calculate_drift_velocities(query_result)

    mean_mld_temp = round(sum(mld_temp_list) / len(mld_temp_list), 1) if mld_temp_list else None
    mean_mld_density = round(sum(mld_density_list) / len(mld_density_list), 1) if mld_density_list else None

    # Percentages of water masses
    water_mass_percentages = {
        wm: round((count / total_valid_samples) * 100, 1)
        for wm, count in water_mass_counts.items()
    } if total_valid_samples > 0 else {}

    # Executive Summary generation
    mean_speed = round(sum(d["speed_cm_s"] for d in drift_velocities) / len(drift_velocities), 2) if drift_velocities else 0.0
    exec_summary = (
        f"Analyzed {len(profiles)} Argo profiles with {total_valid_samples} paired T-S measurements. "
        f"Average Mixed Layer Depth: {mean_mld_temp or 'N/A'} m (thermal) / {mean_mld_density or 'N/A'} m (density). "
        f"Subsurface 1000m Lagrangian Drift: Mean speed {mean_speed} cm/s across {len(drift_velocities)} trajectory vectors. "
        f"Marine Heatwave Status: {mhw_analysis['mhw_detected_profiles']} profile(s) exceeding 90th percentile thermal thresholds. "
        f"Dominant Water Mass: {max(water_mass_percentages.items(), key=lambda x: x[1])[0] if water_mass_percentages else 'Mixed'} "
        f"({max(water_mass_percentages.values(), default=0)}% of observations)."
    )

    return {
        "query_id": query_result.get("query_id", ""),
        "profile_count": len(profiles),
        "total_paired_samples": total_valid_samples,
        "mld": {
            "mean_mld_temp_m": mean_mld_temp,
            "mean_mld_density_m": mean_mld_density,
            "mld_temp_range_m": [min(mld_temp_list), max(mld_temp_list)] if mld_temp_list else None,
        },
        "water_masses": {
            "counts": water_mass_counts,
            "percentages": water_mass_percentages,
        },
        "mhw": mhw_analysis,
        "drift_velocities": drift_velocities,
        "executive_summary": exec_summary,
        "profiles": profile_summaries,
    }



def export_geojson(query_result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Exports a GeoJSON FeatureCollection of all matched profile locations with oceanographic metadata.
    """
    analytics = compute_ocean_analytics(query_result)
    analytics_by_id = {p["profile_id"]: p for p in analytics["profiles"]}
    mhw_by_id = {p["profile_id"]: p for p in analytics["mhw"]["profiles"]}

    features: List[Dict[str, Any]] = []

    for pr in query_result.get("profiles", []):
        p_info = pr.get("profile", {})
        pid = p_info.get("id")
        pa = analytics_by_id.get(pid, {})
        pmhw = mhw_by_id.get(pid, {})

        feature = {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [p_info.get("longitude"), p_info.get("latitude"), p_info.get("max_depth_m", 0)],
            },
            "properties": {
                "profile_id": pid,
                "wmo": p_info.get("wmo"),
                "cycle": p_info.get("cycle"),
                "timestamp": p_info.get("timestamp"),
                "data_mode": p_info.get("data_mode"),
                "max_depth_m": p_info.get("max_depth_m"),
                "retained_levels": pr.get("counts", {}).get("retained_levels", 0),
                "mld_temp_m": pa.get("mld", {}).get("mld_temp_m"),
                "mld_density_m": pa.get("mld", {}).get("mld_density_m"),
                "primary_water_mass": pa.get("primary_water_mass"),
                "mhw_severity": pmhw.get("severity", "Normal"),
                "surface_anomaly_c": pmhw.get("surface_anomaly", 0.0),
            },
        }
        features.append(feature)

    return {
        "type": "FeatureCollection",
        "query_id": query_result.get("query_id"),
        "snapshot_id": query_result.get("snapshot_id"),
        "features": features,
    }
