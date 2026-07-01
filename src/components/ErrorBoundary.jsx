import { Component } from 'react'
import { useLocation } from 'react-router-dom'

// Route-level error boundary (FABLE.md §4.1). Before this existed, any
// render-time exception anywhere in the tree white-screened the whole
// app — the worst failure mode for a cook mid-recipe. The boundary wraps
// the routed content (inside <Routes>' parent, below the header chrome in
// main.jsx's tree) so a crash shows a rustic-palette apology card instead
// of a blank page, and the rest of the shell stays alive.
//
// Class component because error boundaries still require the class
// lifecycle (getDerivedStateFromError); everything else in the project
// stays functional. The exported wrapper keys the boundary by pathname so
// client-side navigation away from a crashed route automatically resets
// it — "go somewhere else" recovers without a full reload.
class Boundary extends Component {
    state = { error: null }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error, info) {
        // Surface the component stack in the console for diagnosis; there
        // is no error-reporting backend to ship it to (yet).
        console.error('Render error caught by ErrorBoundary:', error, info?.componentStack)
    }

    render() {
        if (!this.state.error) return this.props.children

        return (
            <div className="paper-grain min-h-screen">
                <div className="text-center py-16 px-4">
                    <p className="text-2xl text-tan mb-4">✦</p>
                    <p className="font-display text-xl text-ink mb-2">Something went wrong</p>
                    <p className="font-display italic text-rose mb-6">
                        This page hit an unexpected error. Your recipes and lists are safe.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-paper-shade hover:bg-tan/40 text-ink font-medium rounded-md transition-colors"
                    >
                        Reload the page
                    </button>
                </div>
            </div>
        )
    }
}

export default function ErrorBoundary({ children }) {
    const { pathname } = useLocation()
    return <Boundary key={pathname}>{children}</Boundary>
}
