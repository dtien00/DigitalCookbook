import { useEffect } from 'react'

// Full-screen modal image viewer. Used by RecipeDetail's step photos and
// Comments' result photos. Backdrop click, ✕ button, and Escape all close.
// The caller owns the open/closed state — pass a non-null `url` to open,
// call `onClose` to close.
//
// Props:
//   url      — image src (string) or null/falsy to render nothing
//   alt      — alt text for the <img>; empty string ("") if the image is
//              purely decorative and the surrounding context already names it
//   onClose  — invoked on backdrop click, ✕ button, or Escape
//   ariaLabel — optional label for the dialog itself (e.g. "Step photo",
//              "Comment photo"); defaults to "Image"

export default function Lightbox({ url, alt = '', onClose, ariaLabel = 'Image' }) {
    useEffect(() => {
        if (!url) return
        const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [url, onClose])

    if (!url) return null

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            className="fixed inset-0 z-[120] bg-ink/85 flex items-center justify-center p-4"
            onClick={() => onClose?.()}
        >
            <button
                type="button"
                aria-label="Close"
                onClick={(e) => { e.stopPropagation(); onClose?.() }}
                className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-full bg-paper/90 hover:bg-paper text-ink"
            >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
            <img
                src={url}
                alt={alt}
                className="max-w-full max-h-full object-contain"
                onClick={(e) => e.stopPropagation()}
            />
        </div>
    )
}
