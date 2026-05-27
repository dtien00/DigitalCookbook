import { useState } from 'react'

// Stage 14 item 4 — tab system for the left page of ProfileBookSpread.
// The fixed-height container (min(75vh, 700px)) keeps the spread visually
// stable across tab swaps; tab content that exceeds the cap scrolls
// within its own panel.
//
// Visual: the tab list mirrors the right-page carousel indicator pill
// (paper-shade rounded pill, rust active state) so the two surfaces
// read as a paired control system.
//
// The optional `detached` flag on a tab definition breaks the tab out
// of the main pill into its own pill. Detached tabs may also carry an
// `onSelect` override — when present, clicking the tab fires
// `onSelect()` instead of swapping the active panel. Used for the
// Following tab (Stage 14 item 5), which navigates to the standalone
// /profile/following phonebook route rather than rendering its panel
// inline.
//
// Tabs prop shape: { id, label, content, detached?, onSelect?, disabled? }[]
export default function ProfileTabs({ tabs, defaultTabId, containerRef }) {
    const initial = defaultTabId && tabs.some(t => t.id === defaultTabId)
        ? defaultTabId
        : tabs[0]?.id
    const [activeId, setActiveId] = useState(initial)
    // Tabs with an onSelect override aren't selectable as panels — they
    // delegate their click to the caller (e.g. router navigate). Pin the
    // resolved active tab to the ones that DO render a panel so a stale
    // activeId pointing at a delegated tab never blanks the panel area.
    const panelTabs = tabs.filter(t => !t.onSelect)
    const active =
        panelTabs.find(t => t.id === activeId)
        ?? panelTabs[0]

    const mainTabs = tabs.filter(t => !t.detached)
    const detachedTabs = tabs.filter(t => t.detached)

    return (
        <div ref={containerRef} className="profile-tabs">
            <nav className="profile-tabs-nav" role="tablist" aria-label="Profile sections" aria-orientation="vertical">
                <ul className="profile-tabs-list">
                    {mainTabs.map(tab => (
                        <li key={tab.id}>
                            <button
                                type="button"
                                role="tab"
                                id={`profile-tab-trigger-${tab.id}`}
                                aria-selected={tab.id === activeId}
                                aria-controls={`profile-tab-panel-${tab.id}`}
                                disabled={tab.disabled}
                                onClick={() => setActiveId(tab.id)}
                                style={tab.color ? { '--ribbon-color': tab.color } : undefined}
                                className={'profile-tab-btn' + (tab.id === activeId ? ' is-current' : '')}
                            >
                                {tab.icon && <span className="profile-tab-icon" aria-hidden="true">{tab.icon}</span>}
                                <span className="profile-tab-label">{tab.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {detachedTabs.length > 0 && (
                    <div className="profile-tab-detached-group">
                        {detachedTabs.map(tab => {
                            const delegated = typeof tab.onSelect === 'function'
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role={delegated ? undefined : 'tab'}
                                    id={`profile-tab-trigger-${tab.id}`}
                                    aria-selected={delegated ? undefined : tab.id === activeId}
                                    aria-controls={delegated ? undefined : `profile-tab-panel-${tab.id}`}
                                    onClick={() => delegated ? tab.onSelect() : setActiveId(tab.id)}
                                    style={tab.color ? { '--ribbon-color': tab.color } : undefined}
                                    className={
                                        'profile-tab-detached'
                                        + (!delegated && tab.id === activeId ? ' is-current' : '')
                                    }
                                >
                                    <span className="profile-tab-detached-icon" aria-hidden="true">{tab.icon}</span>
                                    <span className="profile-tab-detached-label">{tab.label}</span>
                                    {delegated && (
                                        <svg
                                            aria-hidden="true"
                                            viewBox="0 0 24 24"
                                            width="14"
                                            height="14"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="profile-tab-detached-chevron"
                                        >
                                            <polyline points="9 6 15 12 9 18" />
                                        </svg>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </nav>

            {active && (
                <div
                    role="tabpanel"
                    id={`profile-tab-panel-${active.id}`}
                    aria-labelledby={`profile-tab-trigger-${active.id}`}
                    className="profile-tabs-panel"
                >
                    {active.content}
                </div>
            )}
        </div>
    )
}
