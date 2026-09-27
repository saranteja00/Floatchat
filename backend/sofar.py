"""SOFAR channel depth computation using the GSW Toolbox.

The SOFAR (Sound Fixing And Ranging) channel is the depth at which
sound speed reaches its minimum. This module computes the full
sound-speed profile for an Argo float profile and identifies that minimum.
"""
from __future__ import annotations

import gsw


def sound_speed_profile(profile: dict) -> list[dict]:
    """Build a sound-speed-vs-depth profile for every usable level.

    Each returned dict contains:
        depth_m, pressure_dbar, sound_speed_m_s
    """
    lat = profile.get('latitude')
    lon = profile.get('longitude')
    if lat is None or lon is None:
        return []

    results = []
    for level in profile.get('levels', []):
        temp = level.get('TEMP')
        sal = level.get('PSAL')
        pres = level.get('PRES')
        depth = level.get('depth_m')
        if any(v is None for v in (temp, sal, pres, depth)):
            continue
        try:
            SA = gsw.SA_from_SP(sal, pres, lon, lat)
            CT = gsw.CT_from_t(SA, temp, pres)
            c = float(gsw.sound_speed(SA, CT, pres))
        except Exception:
            continue
        results.append({
            'depth_m': depth,
            'pressure_dbar': pres,
            'sound_speed_m_s': round(c, 3),
        })
    results.sort(key=lambda r: r['depth_m'])
    return results


def sofar_depth(profile: dict) -> dict:
    """Return the SOFAR channel depth and full sound-speed profile.

    Returns a dict with:
        sofar_depth_m  – depth of the sound-speed minimum (None if not enough data)
        sofar_speed    – minimum sound speed in m/s
        profile_count  – number of usable levels
        sound_speed_profile – list of {depth_m, pressure_dbar, sound_speed_m_s}
    """
    ssp = sound_speed_profile(profile)
    if not ssp:
        return {
            'sofar_depth_m': None,
            'sofar_speed': None,
            'profile_count': 0,
            'sound_speed_profile': [],
        }
    min_level = min(ssp, key=lambda r: r['sound_speed_m_s'])
    return {
        'sofar_depth_m': min_level['depth_m'],
        'sofar_speed': min_level['sound_speed_m_s'],
        'profile_count': len(ssp),
        'sound_speed_profile': ssp,
    }
