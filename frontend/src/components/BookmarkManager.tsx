import React, { useEffect, useState } from 'react';
import { Bookmark, Trash2, ExternalLink, Plus, Check } from 'lucide-react';
import { getJSON, postJSON } from '../api';
import type { QueryResult } from '../types';

interface SavedBookmark {
    id: string;
    title: string;
    note: string;
    query_id: string;
    snapshot_id: string;
    created_at: string;
}

export default function BookmarkManager({
    currentQueryResult,
    onLoadQuery,
}: {
    currentQueryResult: QueryResult | null;
    onLoadQuery?: (queryId: string) => void;
}) {
    const [bookmarks, setBookmarks] = useState<SavedBookmark[]>([]);
    const [titleInput, setTitleInput] = useState('');
    const [noteInput, setNoteInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [savedSuccess, setSavedSuccess] = useState(false);
    const [error, setError] = useState('');

    const fetchBookmarks = async () => {
        try {
            const res = await getJSON<{ status: string; bookmarks: SavedBookmark[] }>('/api/bookmarks');
            if (res.bookmarks) setBookmarks(res.bookmarks);
        } catch (e: any) {
            console.error('Failed to load bookmarks:', e);
        }
    };

    useEffect(() => {
        fetchBookmarks();
    }, []);

    const handleSave = async () => {
        if (!currentQueryResult) return;
        setLoading(true);
        setError('');
        try {
            const payload = {
                title: titleInput.trim() || `Investigation ${currentQueryResult.query_id.slice(0, 8)}`,
                note: noteInput.trim(),
                query_id: currentQueryResult.query_id,
                snapshot_id: currentQueryResult.snapshot_id,
            };

            await postJSON('/api/bookmarks', payload);
            setTitleInput('');
            setNoteInput('');
            setSavedSuccess(true);
            setTimeout(() => setSavedSuccess(false), 3000);
            fetchBookmarks();
        } catch (err: any) {
            setError(err.message || 'Failed to save bookmark.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });
            setBookmarks(prev => prev.filter(b => b.id !== id));
        } catch (err: any) {
            console.error('Failed to delete bookmark:', err);
        }
    };

    return (
        <div
            className="bookmark-manager"
            style={{
                background: 'var(--card-bg, #ffffff)',
                border: '1px solid var(--border, #cbd5e1)',
                borderRadius: '12px',
                padding: '18px',
                marginTop: '20px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Bookmark size={20} style={{ color: 'var(--teal, #087f78)' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink, #0f172a)' }}>
                    Saved Investigations & Bookmarks
                </h3>
            </div>

            {/* Save current investigation box */}
            {currentQueryResult ? (
                <div
                    style={{
                        background: 'var(--subtle-bg, #f8fafc)',
                        border: '1px dashed var(--border, #cbd5e1)',
                        borderRadius: '8px',
                        padding: '12px',
                        marginBottom: '16px',
                    }}
                >
                    <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>
                        📌 Save Active Investigation ({currentQueryResult.profiles.length} profiles returned)
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <input
                            type="text"
                            placeholder="Title (e.g. Indian Ocean Warm Pool Anomaly)"
                            value={titleInput}
                            onChange={e => setTitleInput(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                width: '100%',
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Optional notes or observations..."
                            value={noteInput}
                            onChange={e => setNoteInput(e.target.value)}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                width: '100%',
                            }}
                        />
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={loading}
                            className="button primary"
                            style={{
                                alignSelf: 'flex-start',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                fontSize: '0.82rem',
                            }}
                        >
                            {savedSuccess ? <Check size={16} /> : <Plus size={16} />}
                            <span>{savedSuccess ? 'Bookmark Saved!' : 'Save Bookmark to Database'}</span>
                        </button>
                        {error && <span style={{ color: '#ef4444', fontSize: '0.78rem' }}>{error}</span>}
                    </div>
                </div>
            ) : (
                <p style={{ fontSize: '0.82rem', color: '#64748b', fontStyle: 'italic', marginBottom: '16px' }}>
                    Run an investigation query to bookmark its parameters and results.
                </p>
            )}

            {/* List of Saved Bookmarks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Persistent Database Storage ({bookmarks.length})
                </span>
                {bookmarks.length === 0 ? (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                        No saved bookmarks found.
                    </div>
                ) : (
                    bookmarks.map(b => (
                        <div
                            key={b.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                background: 'var(--subtle-bg, #f1f5f9)',
                                borderRadius: '8px',
                                border: '1px solid var(--border, #e2e8f0)',
                            }}
                        >
                            <div>
                                <strong style={{ fontSize: '0.9rem', color: 'var(--ink, #1e293b)', display: 'block' }}>
                                    {b.title}
                                </strong>
                                {b.note && <span style={{ fontSize: '0.78rem', color: '#64748b', display: 'block' }}>{b.note}</span>}
                                <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px', display: 'block' }}>
                                    Query ID: {b.query_id.slice(0, 10)}... · {b.created_at}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={() => handleDelete(b.id)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        padding: '4px',
                                    }}
                                    title="Delete bookmark"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
