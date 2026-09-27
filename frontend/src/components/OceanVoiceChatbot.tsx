import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, Bot, Volume2, VolumeX, X, MessageSquare, Sparkles } from 'lucide-react';
import { postJSON } from '../api';
import type { QueryPlan, QueryResult } from '../types';
import { useQueryStore } from '../store/queryStore';

interface ChatMessage {
    id: string;
    sender: 'user' | 'assistant';
    text: string;
    timestamp: string;
    plan?: QueryPlan | null;
    isClarification?: boolean;
}

export default function OceanVoiceChatbot({
    catalogSnapshotId,
    onNavigateAsk,
}: {
    catalogSnapshotId: string;
    onNavigateAsk: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [listening, setListening] = useState(false);
    const [voiceEnabled, setVoiceEnabled] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: 'welcome',
            sender: 'assistant',
            text: 'Hello! I am AquaAI, your oceanographic research assistant. Ask me questions by typing or using your microphone (e.g. "Detect Marine Heatwaves in May 2025" or "Show float 1902674").',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
    ]);
    const [busy, setBusy] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, open]);

    // Setup Web Speech Recognition if available
    useEffect(() => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                setInput(transcript);
                setListening(false);
                handleSend(transcript);
            };

            recognition.onerror = () => {
                setListening(false);
            };

            recognition.onend = () => {
                setListening(false);
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert('Speech recognition is not supported in this browser. You can type your query below.');
            return;
        }
        if (listening) {
            recognitionRef.current.stop();
            setListening(false);
        } else {
            setListening(true);
            recognitionRef.current.start();
        }
    };

    const speakText = (text: string) => {
        if (!voiceEnabled || !('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text.slice(0, 250));
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
    };

    const handleSend = async (textToSend?: string) => {
        const queryText = (textToSend || input).trim();
        if (!queryText || busy) return;

        const userMsg: ChatMessage = {
            id: String(Date.now()),
            sender: 'user',
            text: queryText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setBusy(true);

        try {
            // PHASE 1: Interpret
            setMessages(prev => [...prev, { id: 'status', sender: 'assistant', text: 'Understanding query...', timestamp: '' }]);
            const res = await postJSON<{ message: string; plan?: QueryPlan | null; fallback_reason?: string }>(
                '/api/interpret',
                {
                    question: queryText,
                    context: {
                        snapshot_id: catalogSnapshotId || 'argo-62206b02518a',
                        float_ids: [],
                        start_date: '2025-05-01',
                        end_date: '2025-05-31',
                        min_depth: 0,
                        max_depth: 2100,
                        variables: ['temperature', 'salinity'],
                        qc: 'strict',
                        bounds: null,
                    },
                }
            );

            if (!res.plan) {
                setMessages(prev => prev.filter(m => m.id !== 'status').concat([{
                    id: String(Date.now() + 1),
                    sender: 'assistant',
                    text: res.message,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isClarification: true,
                }]));
                return;
            }

            // PHASE 2: Query ARGO Data
            setMessages(prev => prev.map(m => m.id === 'status' ? { ...m, text: 'Searching ARGO observations...' } : m));
            const queryRes = await postJSON<QueryResult>('/api/query', res.plan);
            
            // Sync to global state
            useQueryStore.getState().applyPlan(res.plan);
            useQueryStore.getState().setResults(queryRes);

            // PHASE 3 & 4: Answer Generation
            setMessages(prev => prev.map(m => m.id === 'status' ? { ...m, text: 'Preparing evidence...' } : m));
            const answerText = await postJSON<string>('/api/generate_answer', { question: queryText, result: queryRes });

            // Remove status message and show final answer
            setMessages(prev => prev.filter(m => m.id !== 'status').concat([{
                id: String(Date.now() + 1),
                sender: 'assistant',
                text: answerText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                plan: res.plan,
            }]));
            speakText('Analysis complete.');
        } catch (err: any) {
            setMessages(prev => [
                ...prev,
                {
                    id: String(Date.now() + 1),
                    sender: 'assistant',
                    text: err.message ?? 'I encountered an error understanding your request.',
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
            ]);
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {/* Floating Chat Trigger Button */}
            <button
                type="button"
                className="ocean-chatbot-trigger"
                onClick={() => setOpen(prev => !prev)}
                aria-label="Open Ocean AI Voice Assistant"
                style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 18px',
                    borderRadius: '30px',
                    background: 'linear-gradient(135deg, #1b8b86 0%, #0f5257 100%)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: '0 4px 14px rgba(27, 139, 134, 0.4)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                }}
            >
                <Sparkles size={18} />
                <span>AquaAI Voice Chat</span>
            </button>

            {/* Chat Drawer Window */}
            {open && (
                <div
                    className="ocean-chatbot-drawer"
                    style={{
                        position: 'fixed',
                        bottom: '80px',
                        right: '24px',
                        width: '380px',
                        height: '520px',
                        zIndex: 1000,
                        background: '#ffffff',
                        borderRadius: '16px',
                        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            padding: '14px 16px',
                            background: '#0f172a',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Bot size={20} style={{ color: '#38bdf8' }} />
                            <div>
                                <strong style={{ fontSize: '0.95rem', display: 'block' }}>AquaAI Ocean Assistant</strong>
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Voice & Natural Language Intelligence</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                onClick={() => setVoiceEnabled(v => !v)}
                                title={voiceEnabled ? 'Mute voice responses' : 'Enable voice responses'}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                            >
                                {voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                            </button>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                aria-label="Close Assistant"
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Messages Body */}
                    <div
                        style={{
                            flex: 1,
                            padding: '16px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            background: '#f8fafc',
                        }}
                    >
                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                style={{
                                    alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                                    maxWidth: '82%',
                                    padding: '10px 14px',
                                    borderRadius: msg.sender === 'user' ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                                    background: msg.sender === 'user' ? '#1b8b86' : '#ffffff',
                                    color: msg.sender === 'user' ? '#ffffff' : '#1e293b',
                                    boxShadow: msg.sender === 'assistant' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    fontSize: '0.88rem',
                                    lineHeight: '1.45',
                                }}
                            >
                            <div style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                                {msg.isClarification && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setOpen(false);
                                            onNavigateAsk();
                                        }}
                                        style={{
                                            marginTop: '8px',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '5px 10px',
                                            borderRadius: '8px',
                                            background: '#0f172a',
                                            color: '#38bdf8',
                                            border: '1px solid #38bdf8',
                                            fontSize: '0.78rem',
                                            cursor: 'pointer',
                                            fontWeight: 600,
                                        }}
                                    >
                                        <MessageSquare size={12} />
                                        Open Query Filters →
                                    </button>
                                )}

                                <span
                                    style={{
                                        display: 'block',
                                        fontSize: '0.7rem',
                                        opacity: 0.7,
                                        marginTop: '4px',
                                        textAlign: 'right',
                                    }}
                                >
                                    {msg.timestamp}
                                </span>
                            </div>
                        ))}
                        {busy && <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>AquaAI is thinking...</div>}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Presets */}
                    <div
                        style={{
                            padding: '6px 12px',
                            background: '#f1f5f9',
                            display: 'flex',
                            gap: '6px',
                            overflowX: 'auto',
                            borderTop: '1px solid #e2e8f0',
                        }}
                    >
                        {['Detect MHW', 'Show Float 1902674', 'Salinity spikes'].map(chip => (
                            <button
                                key={chip}
                                type="button"
                                onClick={() => handleSend(chip)}
                                style={{
                                    whiteSpace: 'nowrap',
                                    padding: '3px 8px',
                                    borderRadius: '12px',
                                    background: '#ffffff',
                                    border: '1px solid #cbd5e1',
                                    fontSize: '0.75rem',
                                    color: '#475569',
                                    cursor: 'pointer',
                                }}
                            >
                                {chip}
                            </button>
                        ))}
                    </div>

                    {/* Input Controls */}
                    <div
                        style={{
                            padding: '10px 12px',
                            background: '#ffffff',
                            borderTop: '1px solid #e2e8f0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                        }}
                    >
                        <button
                            type="button"
                            onClick={toggleListening}
                            style={{
                                background: listening ? '#ef4444' : '#f1f5f9',
                                color: listening ? '#ffffff' : '#475569',
                                border: 'none',
                                borderRadius: '50%',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                            }}
                            title={listening ? 'Stop listening' : 'Start voice input'}
                        >
                            {listening ? <MicOff size={18} /> : <Mic size={18} />}
                        </button>
                        <input
                            type="text"
                            placeholder={listening ? 'Listening...' : 'Type or speak question...'}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSend();
                            }}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: '20px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.85rem',
                                outline: 'none',
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => handleSend()}
                            disabled={!input.trim() || busy}
                            style={{
                                background: '#1b8b86',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '50%',
                                width: '36px',
                                height: '36px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                opacity: !input.trim() || busy ? 0.5 : 1,
                            }}
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
