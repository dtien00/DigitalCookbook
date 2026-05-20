import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster, ToastBar, toast } from 'react-hot-toast'
import App from './App.jsx'
import './index.css'

// Toaster lives at the root, outside App, so it stays mounted across every
// view dispatch in App.jsx (Profile, Bookmarks, CreateRecipe, RecipeDetail,
// home grid). One mount, top-center, default styling — palette retint
// belongs to a separate visual-polish pass.
//
// The children render function wraps each toast in a clickable div that
// calls toast.dismiss(t.id). react-hot-toast does NOT ship click-to-dismiss
// by default — timer-based auto-dismiss only — so this wrapper adds the
// affordance without forfeiting the library's built-in styling, icons, or
// enter/exit animations (ToastBar preserves all of that). Particularly
// useful for the longer-duration error toasts that users may want to clear
// on demand once they've read the message.
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <App />
        <Toaster
            position="top-center"
            toastOptions={{
                duration: 3500,
                style: { fontSize: '0.95rem' },
                success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
                error: { duration: 5000, iconTheme: { primary: '#dc2626', secondary: '#fff' } },
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
