import {describe, it, expect} from 'vitest'
import {isComposingKeyEvent, isCommitEnter} from './imeComposition'

// A React SyntheticKeyboardEvent stand-in: the fields our handlers read, plus
// the nativeEvent React hangs the real KeyboardEvent off.
const keyEvent = (key, {isComposing = false, keyCode} = {}) => ({
    key,
    keyCode,
    nativeEvent: {key, isComposing, keyCode},
})

describe('isComposingKeyEvent', () => {
    it('is false for an ordinary key press', () => {
        expect(isComposingKeyEvent(keyEvent('Enter'))).toBe(false)
    })
    it('detects isComposing on the native event (Chrome, Safari, Firefox)', () => {
        expect(isComposingKeyEvent(keyEvent('Enter', {isComposing: true}))).toBe(true)
    })
    it('detects isComposing set directly on the event', () => {
        expect(isComposingKeyEvent({key: 'Enter', isComposing: true})).toBe(true)
    })
    it('detects the legacy keyCode 229 some Android builds report instead', () => {
        expect(isComposingKeyEvent(keyEvent('Enter', {keyCode: 229}))).toBe(true)
    })
    it('does not mistake a normal Enter keyCode (13) for composition', () => {
        expect(isComposingKeyEvent(keyEvent('Enter', {keyCode: 13}))).toBe(false)
    })
    it('tolerates a null/undefined event', () => {
        expect(isComposingKeyEvent(null)).toBe(false)
        expect(isComposingKeyEvent(undefined)).toBe(false)
    })
})

describe('isCommitEnter', () => {
    it('accepts a plain Enter', () => {
        expect(isCommitEnter(keyEvent('Enter'))).toBe(true)
    })
    it('ignores every other key', () => {
        for (const k of ['a', 'Tab', 'Escape', 'ArrowDown', ' ']) {
            expect(isCommitEnter(keyEvent(k))).toBe(false)
        }
    })

    // The regression this whole module exists for. On a phone, moving from Qty
    // to Unit with the keyboard's "Next" key fires Enter while the IME is still
    // composing. Acting on it (preventDefault + focus the next input) orphans
    // the composing region at offset 0, and the field then fills up backwards:
    // "TAblespoon" was stored as "noopselbAT". Ignoring the composing Enter
    // lets the IME commit first, so the caret advances normally.
    it('ignores the Enter an IME sends while still composing', () => {
        expect(isCommitEnter(keyEvent('Enter', {isComposing: true}))).toBe(false)
        expect(isCommitEnter(keyEvent('Enter', {keyCode: 229}))).toBe(false)
    })
    it('accepts the real Enter that follows the composing one', () => {
        // The IME commits on the first Enter, then the user presses Next again.
        expect(isCommitEnter(keyEvent('Enter', {isComposing: true}))).toBe(false)
        expect(isCommitEnter(keyEvent('Enter', {isComposing: false}))).toBe(true)
    })
})
