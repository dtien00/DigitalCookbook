// Guards for key handlers that live on top of a soft-keyboard IME.
//
// Why this exists (the "reversed units" bug):
//
// The ingredient editor repurposes Enter as "commit this field and move focus
// to the next one". On a phone that same physical key is the keyboard's
// Next/Go/Done action — and crucially, it is ALSO the key an IME (Gboard, the
// iOS keyboard, any CJK IME) uses to accept the text it is still composing.
//
// While a composition is in flight the browser dispatches a keydown whose
// `key` is 'Enter' but whose `isComposing` is true; Android Chrome additionally
// reports the legacy `keyCode` 229 ("IME processing") for these. If the app
// preventDefault()s that key and yanks focus to the next input, the IME never
// gets to finish: its composing region is orphaned and re-anchored at offset 0
// of the newly focused field. Every character committed afterwards is then
// inserted at index 0, so the field fills up backwards --- "tablespoon" lands
// in the DB as "noopselbat".
//
// So: never treat a composing keydown as a real key press. Let it through
// untouched and the IME commits normally; the *next*, non-composing Enter is
// the one that means "advance".
//
// `keyCode` is deprecated but is the only signal some Android builds give us,
// and React's SyntheticKeyboardEvent still forwards it, so both checks stay.
const IME_KEYCODE = 229

// True when this key event is an IME composition artefact rather than a real
// press the app should act on. Accepts a React SyntheticKeyboardEvent, a native
// KeyboardEvent, or any plain object with the same shape (which is what the
// tests use --- no DOM required).
export function isComposingKeyEvent(event) {
    if (!event) return false
    if (event.isComposing === true) return true
    // React's synthetic event mirrors most fields but not `isComposing`, so the
    // native event underneath is the authoritative source when it is present.
    if (event.nativeEvent && event.nativeEvent.isComposing === true) return true
    if (event.keyCode === IME_KEYCODE) return true
    if (event.nativeEvent && event.nativeEvent.keyCode === IME_KEYCODE) return true
    return false
}

// True when `event` is the plain Enter that should commit a field and advance
// focus. Every Enter handler in the recipe editor funnels through this so the
// composing case is impossible to forget in one of them.
export function isCommitEnter(event) {
    if (!event || event.key !== 'Enter') return false
    return !isComposingKeyEvent(event)
}
