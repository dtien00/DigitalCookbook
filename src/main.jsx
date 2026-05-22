import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster, ToastBar, toast } from 'react-hot-toast'
import App from './App.jsx'
import MaintenancePage from './components/MaintenancePage.jsx'
import './index.css'

// Toaster lives at the root, outside App, so it stays mounted across every
// view dispatch in App.jsx (Profile, Bookmarks, CreateRecipe, RecipeDetail,
// home grid). One mount, top-center, rustic palette via CSS variables from
// @theme in index.css so the toast surface stays in sync with the rest of
// the app without restating hex values here. Icon colors swap green/red for
// rust/rose-dark — the rustic palette has no green, so rust carries the
// affirmative tone and rose-dark the warning, consistent with the Delete
// button treatment on the recipe detail page.
//
// The children render function wraps each toast in a clickable div that
// calls toast.dismiss(t.id). react-hot-toast does NOT ship click-to-dismiss
// by default — timer-based auto-dismiss only — so this wrapper adds the
// affordance without forfeiting the library's built-in styling, icons, or
// enter/exit animations (ToastBar preserves all of that). Particularly
// useful for the longer-duration error toasts that users may want to clear
// on demand once they've read the message.
const inMaintenance = import.meta.env.VITE_MAINTENANCE === 'true'

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {inMaintenance ? <MaintenancePage /> : <App />}
        <Toaster
            position="top-center"
            toastOptions={{
                duration: 3500,
                style: {
                    fontSize: '0.95rem',
                    background: 'var(--color-paper-shade)',
                    color: 'var(--color-ink)',
                    border: '1px solid var(--color-paper-shade)',
                },
                success: { iconTheme: { primary: 'var(--color-rust)', secondary: 'var(--color-paper)' } },
                error: { duration: 5000, iconTheme: { primary: 'var(--color-rose-dark)', secondary: 'var(--color-paper)' } },
            }}
        >
            {(t) => (
                <div
                    onClick={() => toast.dismiss(t.id)}
                    style={{ cursor: 'pointer' }}
                >
                    <ToastBar toast={t} />
                </div>
            )}
        </Toaster>
    </React.StrictMode>,
)
