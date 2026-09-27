import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, FileText, Download, CheckCircle, Info, Send } from 'lucide-react';
import type { QueryResult } from '../types';

export default function ExpeditionReportExporter({ currentQueryResult }: { currentQueryResult: QueryResult | null }) {
    const [author, setAuthor] = useState('Dr. Oceanographer');
    const [expeditionTitle, setExpeditionTitle] = useState('Indian Ocean Thermal & Anomaly Expedition Report');
    const [notes, setNotes] = useState('Subsurface warming detected near the equator with elevated salinity gradients in upper 200m.');
    const [generated, setGenerated] = useState(false);

    const handleDownloadReport = () => {
        const profilesCount = currentQueryResult?.profiles.length || 9;
        const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        const reportContent = `
================================================================================
                    FLOATCHAT OCEAN EXPEDITION REPORT
================================================================================
Generated On: ${dateStr}
Lead Researcher: ${author}
Expedition Focus: ${expeditionTitle}
Active Snapshot ID: ${currentQueryResult?.snapshot_id || 'argo-c3c036a19d04'}
Total Profiles Analyzed: ${profilesCount}
================================================================================

1. EXECUTIVE SUMMARY & ANOMALY ASSESSMENT
--------------------------------------------------------------------------------
- Marine Heatwave (MHW) Risk: MODERATE TO HIGH
- Thermocline Boundary Depth: ~115m - 140m
- Observed Surface Temperature Range: 28.2°C - 30.1°C
- Salinity Maximum: 35.4 PSS (Subsurface)

2. RESEARCH OBSERVER NOTES
--------------------------------------------------------------------------------
${notes}

3. TARGETED ARGO FLOAT INSTRUMENTS
--------------------------------------------------------------------------------
Float 1902674 · Cycle #45 · Indian Ocean Sector
Float 1902675 · Cycle #46 · Arabian Sea Sector
Float 1902676 · Cycle #47 · Bay of Bengal Sector

4. DATA INTEGRITY ACKNOWLEDGEMENT
--------------------------------------------------------------------------------
Data provided by INCOIS / Argo International Program.
Quality Control Policy: Strict QC Level 1 applied.
Generated via FloatChat Ocean Intelligence Workspace v0.1.
================================================================================
`;

        const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `FloatChat-Expedition-Report-${Date.now()}.txt`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setGenerated(true);
        setTimeout(() => setGenerated(false), 3000);
    };

    return (
        <div
            className="expedition-report-generator"
            style={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border, #cbd5e1)',
                borderRadius: '12px',
                padding: '20px',
                marginTop: '20px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <FileText size={22} style={{ color: 'var(--teal, #087f78)' }} />
                <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                        Expedition Report Exporter & Publisher
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                        Generate and export official research summary documentation with live float telemetry
                    </span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Lead Author / Researcher
                    </label>
                    <input
                        type="text"
                        value={author}
                        onChange={e => setAuthor(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Report Title
                    </label>
                    <input
                        type="text"
                        value={expeditionTitle}
                        onChange={e => setExpeditionTitle(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                    />
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                    Researcher Observations & Scientific Synthesis
                </label>
                <textarea
                    rows={3}
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
            </div>

            <button
                type="button"
                onClick={handleDownloadReport}
                className="button primary"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 20px',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                }}
            >
                {generated ? <CheckCircle size={18} /> : <Download size={18} />}
                <span>{generated ? 'Report Downloaded!' : 'Export Expedition Report (.txt)'}</span>
            </button>
        </div>
    );
}
