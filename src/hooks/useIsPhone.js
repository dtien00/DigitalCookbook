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
        // Read the list rather than the event, so both listeners share one path.
        const sync = () => setIsPhone(mq.matches)
        sync()
        mq.addEventListener('change', sync)
        // `change` is the right API and fires on a real rotate or window drag,
        // but it was observed not firing under devtools viewport emulation —
        // leaving the CSS breakpoint flipped while this hook still said desktop,
        // i.e. the phone layout rendering the desktop control. `resize` is the
        // cheap backstop: setIsPhone with an unchanged boolean is a no-op in
        // React, so the common case costs one comparison per resize frame.
        window.addEventListener('resize', sync)
        return () => {
            mq.removeEventListener('change', sync)
            window.removeEventListener('resize', sync)
        }
    }, [])

    return isPhone
}
