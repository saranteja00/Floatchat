import React, { useEffect, useState } from 'react';
import { Sun, Moon, Sparkles, Droplets, Waves } from 'lucide-react';

export type ThemeMode = 'ocean' | 'deep-cyan' | 'midnight-glow' | 'light-emerald';

interface ThemeOption {
    id: ThemeMode;
    name: string;
    icon: React.ReactNode;
    previewColor: string;
}

const THEMES: ThemeOption[] = [
    { id: 'ocean', name: 'Deep Oceanic (Default)', icon: <Waves size={14} />, previewColor: '#071b24' },
    { id: 'deep-cyan', name: 'Cyber Cyan Dark', icon: <Droplets size={14} />, previewColor: '#0a192f' },
    { id: 'midnight-glow', name: 'Midnight Neon Glow', icon: <Moon size={14} />, previewColor: '#0d0f18' },
    { id: 'light-emerald', name: 'Emerald Light Glass', icon: <Sun size={14} />, previewColor: '#eef8f6' },
];

export default function ThemeSelector() {
    const [theme, setTheme] = useState<ThemeMode>(() => {
        return (localStorage.getItem('floatchat_theme') as ThemeMode) || 'ocean';
    });

    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('floatchat_theme', theme);
    }, [theme]);

    const currentThemeObj = THEMES.find((t) => t.id === theme) || THEMES[0];

    return (
        <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
                type="button"
                className="button secondary"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '7px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: 'var(--theme-btn-bg, rgba(255, 255, 255, 0.12))',
                    color: 'var(--theme-btn-text, #e2f1f0)',
                    border: '1px solid var(--theme-btn-border, rgba(255, 255, 255, 0.2))',
                    cursor: 'pointer',
                    backdropFilter: 'blur(6px)',
                    transition: 'all 0.2s ease',
                }}
                aria-label="Change Theme"
            >
                <span
                    style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: currentThemeObj.previewColor,
                        border: '1px solid rgba(255,255,255,0.4)',
                        boxShadow: '0 0 6px ' + currentThemeObj.previewColor,
                    }}
                />
                <Sparkles size={14} />
                <span>{currentThemeObj.name.split(' ')[0]} Theme</span>
            </button>

            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: '110%',
                        right: 0,
                        width: '210px',
                        background: 'var(--theme-menu-bg, #0b222d)',
                        border: '1px solid var(--theme-menu-border, #1e4554)',
                        borderRadius: '12px',
                        padding: '8px',
                        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
                        zIndex: 9999,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    <div
                        style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            color: '#8ab4c0',
                            padding: '6px 8px 4px',
                        }}
                    >
                        Select Color Style
                    </div>

                    {THEMES.map((t) => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                                setTheme(t.id);
                                setIsOpen(false);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: 'none',
                                background: theme === t.id ? 'var(--teal, #087f78)' : 'transparent',
                                color: theme === t.id ? '#ffffff' : '#b0cfd6',
                                fontSize: '11.5px',
                                fontWeight: theme === t.id ? 600 : 400,
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'background 0.15s ease, color 0.15s ease',
                            }}
                        >
                            <span
                                style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    background: t.previewColor,
                                    border: '1px solid rgba(255,255,255,0.3)',
                                    flexShrink: 0,
                                }}
                            />
                            {t.icon}
                            <span style={{ flex: 1 }}>{t.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
