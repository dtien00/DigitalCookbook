import {describe, it, expect} from 'vitest'
import {appendTranscript, readResults, recognitionCtorFor, describeDictationError} from './dictation'

// A SpeechRecognitionResult stand-in: an array-like of alternatives (only the
// first is read) carrying `isFinal`.
const result = (transcript, isFinal) => Object.assign([{transcript}], {isFinal})

describe('appendTranscript', () => {
    it('fills an empty step, capitalising the first letter', () => {
        expect(appendTranscript('', 'preheat the oven')).toBe('Preheat the oven')
    })
    it('treats a whitespace-only step as empty', () => {
        expect(appendTranscript('  \n ', 'preheat the oven')).toBe('Preheat the oven')
    })
    it('appends mid-sentence with one space, leaving the case alone', () => {
        expect(appendTranscript('Whisk the eggs', 'with the sugar')).toBe('Whisk the eggs with the sugar')
    })
    it('capitalises after a finished sentence', () => {
        expect(appendTranscript('Whisk the eggs.', 'fold in the flour')).toBe('Whisk the eggs. Fold in the flour')
        expect(appendTranscript('Done!', 'serve warm')).toBe('Done! Serve warm')
        expect(appendTranscript('Too thick?', 'add milk')).toBe('Too thick? Add milk')
    })
    it('sees a sentence end through closing quotes and brackets', () => {
        expect(appendTranscript('Season "to taste."', 'rest it')).toBe('Season "to taste." Rest it')
        expect(appendTranscript('Simmer (about 5 min.)', 'stir')).toBe('Simmer (about 5 min.) Stir')
    })
    it('capitalises at the start of a new line without adding a space', () => {
        expect(appendTranscript('Stir well\n', 'bake it')).toBe('Stir well\nBake it')
    })
    it('adds no second space when the step already ends in one', () => {
        expect(appendTranscript('Whisk the eggs ', 'gently')).toBe('Whisk the eggs gently')
    })
    it('never adds a period — an auto-stop can land mid-sentence', () => {
        const first = appendTranscript('', 'whisk the eggs and')
        expect(first).toBe('Whisk the eggs and')
        expect(appendTranscript(first, 'the sugar')).toBe('Whisk the eggs and the sugar')
    })
    it('never lowercases — a capital mid-sentence may be a name or "I"', () => {
        expect(appendTranscript('Grate the', 'Parmesan')).toBe('Grate the Parmesan')
        expect(appendTranscript('Taste it and', 'I add salt')).toBe('Taste it and I add salt')
    })
    it('leaves a leading digit alone', () => {
        expect(appendTranscript('', '350 degrees for 20 minutes')).toBe('350 degrees for 20 minutes')
    })
    it('collapses and trims whitespace in the phrase', () => {
        expect(appendTranscript('Stir', '   and \n  fold  ')).toBe('Stir and fold')
    })
    it('returns the step unchanged for an empty phrase', () => {
        expect(appendTranscript('Whisk the eggs', '   ')).toBe('Whisk the eggs')
    })
    it('tolerates null/undefined inputs', () => {
        expect(appendTranscript(undefined, 'stir')).toBe('Stir')
        expect(appendTranscript('Stir', null)).toBe('Stir')
    })
})

describe('readResults', () => {
    it('splits settled text from still-changing text', () => {
        const {finalText, interimText} = readResults([result('whisk the eggs', true), result('and the', false)])
        expect(finalText).toBe('whisk the eggs')
        expect(interimText).toBe('and the')
    })
    it('joins segments with single spaces, whatever spacing the engine sends', () => {
        // Chrome prefixes later segments with a space; other engines don't.
        const {finalText} = readResults([result('whisk', true), result(' the eggs', true), result('gently', true)])
        expect(finalText).toBe('whisk the eggs gently')
    })
    it('skips empty or missing alternatives', () => {
        const {finalText, interimText} = readResults([result('  ', true), Object.assign([], {isFinal: false}), result('stir', false)])
        expect(finalText).toBe('')
        expect(interimText).toBe('stir')
    })
    it('tolerates an empty or missing list', () => {
        expect(readResults([])).toEqual({finalText: '', interimText: ''})
        expect(readResults(undefined)).toEqual({finalText: '', interimText: ''})
    })
})

describe('recognitionCtorFor', () => {
    function Unprefixed() {}
    function Prefixed() {}

    it('prefers the unprefixed constructor', () => {
        expect(recognitionCtorFor({isSecureContext: true, SpeechRecognition: Unprefixed, webkitSpeechRecognition: Prefixed})).toBe(Unprefixed)
    })
    it('falls back to the webkit-prefixed one (Chrome, Safari)', () => {
        expect(recognitionCtorFor({isSecureContext: true, webkitSpeechRecognition: Prefixed})).toBe(Prefixed)
    })
    it('is null outside a secure context — an http:// LAN address', () => {
        expect(recognitionCtorFor({isSecureContext: false, webkitSpeechRecognition: Prefixed})).toBe(null)
    })
    it('is null where the API is missing (Firefox)', () => {
        expect(recognitionCtorFor({isSecureContext: true})).toBe(null)
    })
    it('is null with no window', () => {
        expect(recognitionCtorFor(null)).toBe(null)
    })
})

describe('describeDictationError', () => {
    it('ignores our own abort', () => {
        expect(describeDictationError('aborted')).toEqual({action: 'ignore', message: null})
    })
    it('keeps the mic after a permission denial', () => {
        expect(describeDictationError('not-allowed').action).toBe('retry')
    })
    it('keeps the mic when nothing was heard', () => {
        expect(describeDictationError('no-speech').action).toBe('retry')
    })
    it('keeps the mic for a network error while offline — Chrome is server-based', () => {
        const outcome = describeDictationError('network', {online: false})
        expect(outcome.action).toBe('retry')
        expect(outcome.message).toMatch(/internet connection/)
    })
    it('disables for a network error while online before any success — Brave', () => {
        expect(describeDictationError('network', {online: true}).action).toBe('disable')
    })
    it('disables for service-not-allowed, pointing Apple users at Siri/Dictation', () => {
        const outcome = describeDictationError('service-not-allowed')
        expect(outcome.action).toBe('disable')
        expect(outcome.message).toMatch(/Siri or Dictation/)
    })
    it('disables for an unknown code before any success', () => {
        expect(describeDictationError('language-not-supported').action).toBe('disable')
    })
    it('keeps the mic for any failure once the engine has worked', () => {
        for (const code of ['network', 'service-not-allowed', 'audio-capture', 'start-failed']) {
            expect(describeDictationError(code, {hasSucceeded: true}).action).toBe('retry')
        }
    })
    it('gives every outcome except the ignored abort a message', () => {
        for (const code of ['not-allowed', 'no-speech', 'network', 'service-not-allowed', 'audio-capture', 'start-failed']) {
            expect(describeDictationError(code).message).toBeTruthy()
        }
    })
})
