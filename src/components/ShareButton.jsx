import { toast } from 'react-hot-toast'

// Share affordance for the recipe detail page. Copies the canonical
// /recipe/:id URL to the clipboard and surfaces a toast confirming the
// copy — uniform behavior on mobile and desktop, no OS share sheet.
// Visual treatment mirrors the PDF download button next to it; both
// read as a paired "do something with this recipe" cluster.

export default function ShareButton({ url }) {
    const handleShare = async () => {
        try {
            await navigator.clipboard.writeText(url)
            toast.success('Link copied to clipboard')
        } catch (error) {
            toast.error('Could not copy link: ' + error.message)
        }
    }

    return (
        <button
            onClick={handleShare}
            aria-label="Share this recipe"
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-paper-shade hover:bg-tan/40 text-ink text-sm font-medium rounded-md transition-colors"
        >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            <span className="hidden sm:inline">Share</span>
        </button>
    )
}
