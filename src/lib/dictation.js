// Pure rules behind per-step dictation — the mic in each CreateRecipe step
// head. The recognizer itself is the browser's Web Speech API, driven by
// src/hooks/useSpeechDictation.js; everything here is plain data in and plain
// data out, so the rules are unit-tested without a browser or a microphone.

// The browser's SpeechRecognition constructor if dictation can run here, else
// null. Chrome and Safari still ship it only under the webkit prefix; Firefox
// ships it disabled. Microphone access needs a secure context (HTTPS or
// localhost), so an http:// LAN address — how a phone reaches the dev server —
// gets no mic at all rather than one that fails on every tap.
export function recognitionCtorFor(win) {
    if (!win || !win.isSecureContext) return null
    return win.SpeechRecognition || win.webkitSpeechRecognition || null
}

// Split a SpeechRecognitionResultList into settled and still-changing text.
// Rebuilt from the whole list on every event rather than accumulated, so an
// engine that re-sends earlier results can't double them up. Segments are
// trimmed and re-joined with single spaces: Chrome prefixes later segments
// with a space, other engines don't.
export function readResults(results) {
    const finals = []
    const interims = []
    const count = results?.length ?? 0
    for (let i = 0; i < count; i++) {
        const result = results[i]
        const text = (result?.[0]?.transcript ?? '').trim()
        if (!text) continue
        if (result.isFinal) finals.push(text)
        else interims.push(text)
    }
    return { finalText: finals.join(' '), interimText: interims.join(' ') }
}

// A sentence ends here: . ! or ? optionally followed by closing quotes or
// brackets — "Stir well." / 'Season "to taste."' / "(about 5 min.)".
const SENTENCE_END = /[.!?]["'”’)\]]*$/

// Add a dictated phrase to the end of a step's instruction.
//   - Appends, never replaces: whatever the author typed survives.
//   - One space between old and new; none if the step already ends in
//     whitespace (a trailing space or a new line).
//   - Capitalises the phrase only where a sentence starts: an empty step,
//     after . ! or ?, or at the start of a new line.
//   - Never adds a period. The recognizer stops on a pause, which can land
//     mid-sentence, and the next tap should read as a continuation.
//   - Never lowercases. A capital mid-sentence may be a name or "I", and some
//     engines capitalise every utterance — a stray capital is a one-key fix,
//     a lowercased "Parmesan" is a silent one.
export function appendTranscript(existing, transcript) {
    const base = existing ?? ''
    const phrase = (transcript ?? '').replace(/\s+/g, ' ').trim()
    if (!phrase) return base
    if (base.trim() === '') return capitalise(phrase)
    const startsSentence = /\n\s*$/.test(base) || SENTENCE_END.test(base.trimEnd())
    const next = startsSentence ? capitalise(phrase) : phrase
    return /\s$/.test(base) ? base + next : `${base} ${next}`
}

function capitalise(text) {
    return text.replace(/^\p{Ll}/u, c => c.toUpperCase())
}

// What to do about a SpeechRecognition `error` event, and what to tell the
// author. `action` is one of:
//   'ignore'  — our own abort(); nothing to say.
//   'retry'   — recoverable: explain, keep the mic.
//   'disable' — this browser can't dictate here: say so once and hide every
//               mic for the rest of the page-load.
//
// `hasSucceeded` is whether the engine has returned any words since the page
// loaded. A failure after that proves the engine works, so it's transient.
// `online` is checked separately because Chrome's recognizer is server-based:
// an offline Chrome reports the same `network` code as Brave, whose speech
// backend is switched off entirely — and Brave can't be told apart before a
// start, because it still exposes the constructor.
export function describeDictationError(code, { online = true, hasSucceeded = false } = {}) {
    if (code === 'aborted') return { action: 'ignore', message: null }
    if (code === 'not-allowed') {
        return { action: 'retry', message: 'Microphone access is blocked — allow it in your browser’s site settings, then tap the mic again.' }
    }
    if (code === 'no-speech') {
        return { action: 'retry', message: 'Didn’t catch anything — tap the mic and try again.' }
    }
    if (code === 'network' && !online) {
        return { action: 'retry', message: 'Voice input needs an internet connection.' }
    }
    if (hasSucceeded) {
        return { action: 'retry', message: 'Voice input stopped unexpectedly — tap the mic to try again.' }
    }
    if (code === 'service-not-allowed') {
        return { action: 'disable', message: 'Voice input isn’t available here. On Apple devices it needs Siri or Dictation turned on.' }
    }
    if (code === 'audio-capture') {
        return { action: 'disable', message: 'No microphone was found, so voice input is off.' }
    }
    return { action: 'disable', message: 'Voice input isn’t available in this browser.' }
}

// A stop within this long of starting is a change of mind, not a failed try.
export const QUICK_STOP_MS = 3000

// Whether a session that ended with no words and no error counts against the
// engine. Error codes can't catch every broken recognizer: Opera exposes the
// constructor, but its recognizer never returns a result — and never raises
// an error to say so. A session the engine ended by itself always counts
// (Chrome answers silence with a `no-speech` error, so ending with nothing
// and no reason is the symptom); one the author stopped counts only if it
// ran long enough for them to have said something.
export function isEmptyStrike({ stoppedByUser = false, durationMs = 0 } = {}) {
    return !stoppedByUser || durationMs >= QUICK_STOP_MS
}

// What to say after an empty session that counted. The first is just "say it
// again"; a second in a row, before the engine has ever returned a word, means
// it isn't going to — hide the mic rather than leave one that fails on every
// tap. `emptyStreak` includes this session.
export function describeEmptySession({ emptyStreak = 1, hasSucceeded = false } = {}) {
    if (hasSucceeded || emptyStreak < 2) {
        return { action: 'retry', message: 'Didn’t catch anything — tap the mic and try again.' }
    }
    return { action: 'disable', message: 'Voice input isn’t returning any words in this browser. It works in Chrome and Safari.' }
}
