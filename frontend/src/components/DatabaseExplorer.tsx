import { useEffect, useState } from 'react';
import { Database, RefreshCw, Play, CheckCircle2, Server, Table, HardDrive } from 'lucide-react';
import { getJSON, postJSON } from '../api';

interface DBStatus {
    status: string;
    engine: string;
    database_path: string;
    file_size_kb: number;
    tables: Record<string, number>;
    metadata: Record<string, string>;
}

interface QueryResponse {
    status: string;
    count: number;
    data: Record<string, any>[];
}

export default function DatabaseExplorer() {
    const [dbStatus, setDbStatus] = useState<DBStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [sqlQuery, setSqlQuery] = useState("SELECT p.wmo, p.cycle, p.latitude, p.longitude, COUNT(o.id) as observation_count, ROUND(AVG(o.temperature), 2) as avg_temp_c FROM profiles p JOIN observations o ON p.id = o.profile_id GROUP BY p.id LIMIT 10");
    const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
    const [queryError, setQueryError] = useState('');
    const [queryBusy, setQueryBusy] = useState(false);

    const fetchStatus = async () => {
        setLoading(true);
        try {
            const data = await getJSON<DBStatus>('/api/database/status');
            setDbStatus(data);
        } catch (e) {
            console.error('Failed to fetch DB status:', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await postJSON('/api/database/sync', {});
            await fetchStatus();
        } catch (e) {
            console.error('Database sync error:', e);
        } finally {
            setSyncing(false);
        }
    };

    const handleRunQuery = async (queryToRun?: string) => {
        const q = queryToRun || sqlQuery;
        setQueryBusy(true);
        setQueryError('');
        try {
            const res = await postJSON<QueryResponse>('/api/database/query', { query: q });
            setQueryResult(res);
        } catch (e: any) {
            setQueryError(e.message || 'Error executing SQL query');
            setQueryResult(null);
        } finally {
            setQueryBusy(false);
        }
    };

    return (
        <section className="db-explorer-panel" style={{ marginTop: '24px', padding: '24px', background: 'rgba(15, 34, 45, 0.75)', borderRadius: '12px', border: '1px solid rgba(43, 114, 118, 0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Database size={24} style={{ color: '#2dd4bf' }} />
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f0fdf4' }}>Real Database Connection (SQLite 3 ACID Engine)</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Live persistence and structured SQL querying for ocean observations</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="button secondary" disabled={syncing} onClick={handleSync} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <RefreshCw size={14} className={syncing ? 'spin' : ''} />
                        {syncing ? 'Syncing...' : 'Re-sync DB from Snapshot'}
                    </button>
                </div>
            </div>

            {loading ? (
                <p style={{ color: '#94a3b8' }}>Checking database status...</p>
            ) : dbStatus ? (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                        <div style={{ background: 'rgba(9, 21, 29, 0.7)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                                <Server size={14} /> Connection Status
                            </div>
                            <div style={{ marginTop: '4px', fontWeight: 600, color: '#34d399', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <CheckCircle2 size={16} /> CONNECTED
                            </div>
                        </div>

                        <div style={{ background: 'rgba(9, 21, 29, 0.7)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                                <HardDrive size={14} /> Database Engine & Size
                            </div>
                            <div style={{ marginTop: '4px', fontWeight: 600, color: '#e2e8f0' }}>
                                {dbStatus.engine} ({dbStatus.file_size_kb} KB)
                            </div>
                        </div>

                        <div style={{ background: 'rgba(9, 21, 29, 0.7)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                                <Table size={14} /> Profiles Table
                            </div>
                            <div style={{ marginTop: '4px', fontWeight: 600, color: '#38bdf8' }}>
                                {dbStatus.tables.profiles} profile records
                            </div>
                        </div>

                        <div style={{ background: 'rgba(9, 21, 29, 0.7)', padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#94a3b8' }}>
                                <Table size={14} /> Observations Table
                            </div>
                            <div style={{ marginTop: '4px', fontWeight: 600, color: '#fbbf24' }}>
                                {dbStatus.tables.observations} T-S levels
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'rgba(9, 21, 29, 0.6)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#cbd5e1' }}>SQL Query Runner</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    className="button secondary"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                    onClick={() => {
                                        const q = "SELECT p.wmo, p.cycle, p.latitude, p.longitude, COUNT(o.id) as observation_count, ROUND(AVG(o.temperature), 2) as avg_temp_c FROM profiles p JOIN observations o ON p.id = o.profile_id GROUP BY p.id LIMIT 10";
                                        setSqlQuery(q);
                                        handleRunQuery(q);
                                    }}
                                >
                                    Preset: Average Temp
                                </button>
                                <button
                                    className="button secondary"
                                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                                    onClick={() => {
                                        const q = "SELECT wmo, COUNT(id) as profile_count, MIN(timestamp) as start_date, MAX(timestamp) as end_date FROM profiles GROUP BY wmo";
                                        setSqlQuery(q);
                                        handleRunQuery(q);
                                    }}
                                >
                                    Preset: Float Summary
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                            <textarea
                                value={sqlQuery}
                                onChange={(e) => setSqlQuery(e.target.value)}
                                rows={3}
                                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', background: '#0b1924', color: '#5eead4', border: '1px solid #1e3a4c', borderRadius: '6px', padding: '10px' }}
                                placeholder="Enter SQL SELECT query..."
                            />
                            <button
                                className="button primary"
                                disabled={queryBusy}
                                onClick={() => handleRunQuery()}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: '100px', gap: '4px' }}
                            >
                                <Play size={16} />
                                {queryBusy ? 'Running...' : 'Execute SQL'}
                            </button>
                        </div>

                        {queryError && (
                            <p style={{ color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '8px 12px', borderRadius: '6px', fontSize: '0.85rem' }}>
                                {queryError}
                            </p>
                        )}

                        {queryResult && (
                            <div style={{ marginTop: '12px' }}>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '6px' }}>
                                    Query returned {queryResult.count} record(s):
                                </div>
                                <div style={{ overflowX: 'auto', maxHeight: '200px' }}>
                                    <table className="data-table" style={{ width: '100%', fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr>
                                                {queryResult.data.length > 0 && Object.keys(queryResult.data[0]).map((key) => (
                                                    <th key={key}>{key}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {queryResult.data.map((row, idx) => (
                                                <tr key={idx}>
                                                    {Object.values(row).map((val: any, cIdx) => (
                                                        <td key={cIdx}>{val === null ? 'NULL' : String(val)}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <p style={{ color: '#f87171' }}>Could not connect to database status endpoint.</p>
            )}
        </section>
    );
}
