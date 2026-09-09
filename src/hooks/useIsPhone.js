import { useEffect, useState } from 'react'

// True while the viewport is at phone width. Drives the ingredient editor's
// two-line row + tap-first unit sheet.
//
// Why a JS media query rather than CSS `hidden` classes: the phone and desktop
// unit pickers are genuinely different controls (a button that opens a sheet
// vs. a text combobox), not one control restyled. Rendering both and hiding one
// would put a phantom tab stop in the row, give the row two elements claiming
// the same `inputRefs` key, and mount a sheet nobody can reach. Choosing in JS
// keeps exactly one in the tree.
//
// 640px matches the `sm:` breakpoint the rest of the app already uses (see
// TimerSetSheet's `sm:items-center`), so the sheet and the CSS row reflow flip
// at the same width.
export const PHONE_MAX_WIDTH = 640

export function useIsPhone() {
    // SSR/no-matchMedia safety: assume desktop, then correct on mount. The app
    // is a client-rendered SPA so this only matters for tests running in a bare
    // environment.
    const [isPhone, setIsPhone] = useState(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return false
        return window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`).matches
    })

    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return
        const mq = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`)
        const onChange = (e) => setIsPhone(e.matches)
        setIsPhone(mq.matches)
        mq.addEventListener('change', onChange)
        return () => mq.removeEventListener('change', onChange)
    }, [])

    return isPhone
}
