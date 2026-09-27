import { useEffect, useState } from 'react';
import { fetchOceanAnalytics, exportGeoJSON } from '../api';
import type { OceanAnalyticsResult, QueryResult } from '../types';

export default function OceanAnalyticsPanel({ queryResult }: { queryResult: QueryResult | null }) {
    const [data, setData] = useState<OceanAnalyticsResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!queryResult) {
            setData(null);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        fetchOceanAnalytics(queryResult.plan, controller.signal)
            .then(res => {
                setData(res);
                setLoading(false);
            })
            .catch(err => {
                if (err.name !== 'AbortError') {
                    setError(err.message ?? 'Failed to compute ocean analytics.');
                    setLoading(false);
                }
            });
        return () => controller.abort();
    }, [queryResult]);

    if (!queryResult) return null;

    const severityBadgeClass = (severity: string) => {
        switch (severity) {
            case 'Moderate': return 'badge-warning';
            case 'Strong': return 'badge-orange';
            case 'Severe': return 'badge-danger';
            case 'Extreme': return 'badge-critical';
            default: return 'badge-neutral';
        }
    };

    return (
        <section className="profile-detail ocean-analytics-panel" aria-labelledby="analytics-title" style={{ marginTop: '24px' }}>
            <div className="detail-heading">
                <div>
                    <div className="eyebrow">ADVANCED SCIENTIFIC & OCEANOGRAPHIC ANALYTICS</div>
                    <h2 id="analytics-title">Ocean Dynamics, MHW & Water Mass Intelligence</h2>
                    <p>TEOS-10 Density · Mixed Layer Depth · Marine Heatwave Exceedances · GeoJSON Export</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="button secondary" disabled={!data} onClick={() => data && exportGeoJSON(queryResult.plan)}>
                        📥 Export GeoJSON
                    </button>
                </div>
            </div>

            {loading && <div className="loading-state">Computing TEOS-10 density, MLD, and Marine Heatwave anomalies...</div>}
            {error && <div className="error-message">Error: {error}</div>}

            {data && (
                <div className="analytics-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Executive Summary Card */}
                    <div className="card" style={{ padding: '16px', background: 'rgba(27, 139, 134, 0.08)', borderRadius: '8px', borderLeft: '4px solid #1b8b86' }}>
                        <h4 style={{ margin: '0 0 8px 0', color: '#1b8b86', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🤖</span> AI Executive Summary & Anomaly Overview
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: '1.5' }}>{data.executive_summary}</p>
                    </div>

                    {/* Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                        {/* Marine Heatwave Card */}
                        <div className="card" style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>🌡️ Marine Heatwave (MHW) Status</h4>
                            <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                                Surface 90th Percentile Baseline: <strong>{data.mhw.surface_p90_threshold_c} °C</strong>
                            </div>
                            <div style={{ fontSize: '0.9rem', marginBottom: '12px' }}>
                                Exceeding Profiles: <strong>{data.mhw.mhw_detected_profiles} / {data.mhw.total_profiles_analyzed}</strong>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {Object.entries(data.mhw.severity_breakdown).map(([sev, count]) => (
                                    <span key={sev} style={{ padding: '4px 8px', borderRadius: '12px', fontSize: '0.8rem', background: count > 0 ? '#e0f2fe' : '#f1f5f9', fontWeight: 600 }}>
                                        {sev}: {count}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Mixed Layer Depth Card */}
                        <div className="card" style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>🌊 Mixed Layer Depth (MLD)</h4>
                            <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                                Thermal MLD (ΔT = 0.2 °C): <strong>{data.mld.mean_mld_temp_m ?? 'N/A'} m</strong>
                            </div>
                            <div style={{ fontSize: '0.9rem', marginBottom: '8px' }}>
                                Density MLD (Δσ = 0.03 kg/m³): <strong>{data.mld.mean_mld_density_m ?? 'N/A'} m</strong>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                Range across query: {data.mld.mld_temp_range_m ? `${data.mld.mld_temp_range_m[0]}m – ${data.mld.mld_temp_range_m[1]}m` : 'N/A'}
                            </div>
                        </div>

                        {/* Water Mass Breakdown Card */}
                        <div className="card" style={{ padding: '16px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <h4 style={{ margin: '0 0 12px 0', color: '#0f172a' }}>🧪 Water Mass Classification</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {Object.entries(data.water_masses.percentages).map(([wm, pct]) => (
                                    <div key={wm} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                        <span style={{ fontWeight: 500 }}>{wm}</span>
                                        <span style={{ fontWeight: 700, color: '#1b8b86' }}>{pct}% ({data.water_masses.counts[wm]} samples)</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Profile Inspection Table */}
                    <details style={{ marginTop: '12px' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#1b8b86' }}>
                            Inspect Per-Profile Dynamics & Heatwave Anomalies ({data.profiles.length} profiles)
                        </summary>
                        <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                        <th style={{ padding: '8px' }}>Float / Cycle</th>
                                        <th style={{ padding: '8px' }}>Date</th>
                                        <th style={{ padding: '8px' }}>Thermal MLD</th>
                                        <th style={{ padding: '8px' }}>Density MLD</th>
                                        <th style={{ padding: '8px' }}>Water Mass</th>
                                        <th style={{ padding: '8px' }}>MHW Severity</th>
                                        <th style={{ padding: '8px' }}>Surface Anomaly</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.profiles.map(p => {
                                        const mhwProf = data.mhw.profiles.find(m => m.profile_id === p.profile_id);
                                        return (
                                            <tr key={p.profile_id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '8px', fontWeight: 600 }}>{p.wmo} / c{p.cycle}</td>
                                                <td style={{ padding: '8px' }}>{new Date(p.timestamp).toISOString().split('T')[0]}</td>
                                                <td style={{ padding: '8px' }}>{p.mld.mld_temp_m ? `${p.mld.mld_temp_m} m` : 'N/A'}</td>
                                                <td style={{ padding: '8px' }}>{p.mld.mld_density_m ? `${p.mld.mld_density_m} m` : 'N/A'}</td>
                                                <td style={{ padding: '8px' }}>{p.primary_water_mass}</td>
                                                <td style={{ padding: '8px' }}>
                                                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem', background: mhwProf?.severity === 'Normal' ? '#f1f5f9' : '#fee2e2', color: mhwProf?.severity === 'Normal' ? '#475569' : '#b91c1c', fontWeight: 600 }}>
                                                        {mhwProf?.severity ?? 'Normal'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px' }}>
                                                    {mhwProf?.surface_anomaly ? `${mhwProf.surface_anomaly > 0 ? '+' : ''}${mhwProf.surface_anomaly} °C` : '0 °C'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </div>
            )}
        </section>
    );
}
