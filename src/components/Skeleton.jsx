// Loading placeholders that match the shape of the content they're
// standing in for. Three flavors are exported for the call sites we
// have today; the base <Skeleton> can be composed for one-offs.
//
// All use Tailwind's animate-pulse (subtle opacity oscillation) on a
// paper-shade fill so they read as "loading" without being noisy. The
// outer wrapper carries aria-hidden — the loading state is announced
// once by the parent's status text or live region, not per shimmer.

export default function Skeleton({ className = '' }) {
    return (
        <div aria-hidden="true" className={`bg-paper-shade rounded animate-pulse ${className}`} />
    )
}

// Masonry-friendly card placeholders. Varying heights match the
// natural variation of the real grid so the layout doesn't jump when
// the real data arrives.
const CARD_HEIGHTS = ['h-48', 'h-64', 'h-56', 'h-72', 'h-52', 'h-60', 'h-44', 'h-56']

export function SkeletonCard({ index = 0 }) {
    const heightClass = CARD_HEIGHTS[index % CARD_HEIGHTS.length]
    return (
        <div className="mb-4 break-inside-avoid overflow-hidden rounded-lg border border-paper-shade bg-[#fbf6f1]">
            <Skeleton className={`w-full ${heightClass} rounded-none`} />
        </div>
    )
}

// Stand-in for a single comment row while the thread loads. Mirrors
// the real CommentItem layout: avatar circle + header line + two
// body lines.
export function SkeletonComment() {
    return (
        <li className="flex gap-3">
            <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        </li>
    )
}
