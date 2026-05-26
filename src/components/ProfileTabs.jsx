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
// of the main pill into its own pill with a route-hint chevron. Used
// for the Following tab (Stage 14 item 5 — the chevron telegraphs the
// future phonebook book/route that the tab will eventually navigate
// to instead of swapping in-place).
//
// Tabs prop shape: { id, label, content, detached?, disabled? }[]
export default function ProfileTabs({ tabs, defaultTabId, containerRef }) {
    const initial = defaultTabId && tabs.some(t => t.id === defaultTabId)
        ? defaultTabId
        : tabs[0]?.id
    const [activeId, setActiveId] = useState(initial)
    const active = tabs.find(t => t.id === activeId) ?? tabs[0]

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
                        {detachedTabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                id={`profile-tab-trigger-${tab.id}`}
                                aria-selected={tab.id === activeId}
                                aria-controls={`profile-tab-panel-${tab.id}`}
                                onClick={() => setActiveId(tab.id)}
                                style={tab.color ? { '--ribbon-color': tab.color } : undefined}
                                className={
                                    'profile-tab-detached'
                                    + (tab.id === activeId ? ' is-current' : '')
                                }
                            >
                                <span className="profile-tab-detached-icon" aria-hidden="true">{tab.icon}</span>
                                <span className="profile-tab-detached-label">{tab.label}</span>
                            </button>
                        ))}
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
