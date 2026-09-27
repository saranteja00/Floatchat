export interface LayerConfig {
  id: string;
  name: string;
  description: string;
  default_opacity: number;
  dataset: string;
  variable: string;
}
export interface Profile {
  id: string;
  wmo: string;
  cycle: number;
  latitude: number;
  longitude: number;
  timestamp: string;
  data_mode: string;
  max_depth_m: number;
  level_count: number;
  temperature_count: number;
  salinity_count: number;
  position_qc: string;
  time_qc: string;
}


export interface Catalog {
  snapshot_id: string;
  method_version: string;
  created_at: string;
  title: string;
  attribution: string;
  doi: string;
  profiles: Profile[];
}

export interface Observation {
  source_level: number;
  depth_m: number;
  pressure_dbar: number;
  pressure_qc: string;
  temperature: number | null;
  temperature_qc: string;
  salinity: number | null;
  salinity_qc: string;
}

export interface ProfileResult {
  result_id: string;
  snapshot_id: string;
  method_version: string;
  profile: Profile;
  plan: { profile_id: string; min_depth: number; max_depth: number; qc: string; variables?: Variable[] };
  source: { url: string; filename: string; sha256: string; acquired_at: string; profile_index: number; variables: Record<string, string> };
  methods: Record<string, string>;
  counts: { source_levels: number; retained_levels: number; excluded_levels: number; temperature: number; salinity: number };
  observations: Observation[];
  warnings: string[];
}

export type Variable = 'temperature' | 'salinity';
export interface QueryPlan {
  snapshot_id: string;
  float_ids: string[];
  start_date: string;
  end_date: string;
  min_depth: number;
  max_depth: number;
  variables: Variable[];
  qc: 'strict' | 'expanded';
  bounds: { west: number; east: number; south: number; north: number } | null;
  intent?: string | null;
}
export type QualityCounts = Record<'metadata_qc' | 'pressure_or_depth' | 'outside_depth' | 'no_requested_values' | 'retained', number>;
export interface QualityAudit {
  method: string; source_levels: number; totals: QualityCounts; modes: Record<string, number>;
  profiles: { profile_id: string; wmo: string; cycle: number; timestamp: string; mode: string; source_levels: number; counts: QualityCounts; variables: Partial<Record<Variable, { valid: number; missing: number; qc_excluded: number }>> }[];
  coverage: { wmo: string; usable_profiles: number; first: string | null; last: string | null; largest_gap_days: number | null }[];
}
export interface QueryResult {
  quality?: QualityAudit;
  query_id: string;
  snapshot_id: string;
  plan: QueryPlan;
  profiles: ProfileResult[];
  counts: { matched_profiles: number; usable_profiles: number; floats: number; observations: number };
  ranges: Partial<Record<Variable, { min: number; max: number; count: number } | null>>;
  summary: string;
  warnings: string[];
}

export interface MHWProfile {
  profile_id: string;
  wmo: string;
  cycle: number;
  timestamp: string;
  max_surface_temp: number | null;
  surface_anomaly: number;
  severity: 'Normal' | 'Moderate' | 'Strong' | 'Severe' | 'Extreme';
}

export interface OceanAnalyticsResult {
  query_id: string;
  profile_count: number;
  total_paired_samples: number;
  mld: {
    mean_mld_temp_m: number | null;
    mean_mld_density_m: number | null;
    mld_temp_range_m: [number, number] | null;
  };
  water_masses: {
    counts: Record<string, number>;
    percentages: Record<string, number>;
  };
  mhw: {
    surface_p90_threshold_c: number;
    subsurface_p90_threshold_c: number;
    total_profiles_analyzed: number;
    mhw_detected_profiles: number;
    severity_breakdown: Record<string, number>;
    profiles: MHWProfile[];
  };
  executive_summary: string;
  profiles: Array<{
    profile_id: string;
    wmo: string;
    cycle: number;
    timestamp: string;
    latitude: number;
    longitude: number;
    mld: { mld_temp_m: number | null; mld_density_m: number | null; surface_temp_c: number | null; surface_sal_psu: number | null };
    primary_water_mass: string;
  }>;
}

export const dateLabel = (value: string, short = false) => new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', ...(short ? {} : { year: 'numeric' as const }), timeZone: 'UTC',
}).format(new Date(value));

export const coordinates = (lat: number, lon: number) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

export const floatColor = (wmo: string) => ({ '1902674': '#1b8b86', '1902675': '#c7893b', '1902676': '#647dbc' })[wmo] ?? '#1b8b86';

