import { describe, it, expect } from 'vitest'
import { escapeHtml } from './copyText'

// escapeHtml is the only pure export here — copyText/copyRich are clipboard
// side-effects that need a browser. It guards the text/html clipboard flavour,
// where ingredient names and notes arrive as user-authored free text.
describe('escapeHtml', () => {
    it('leaves ordinary text untouched', () => {
        expect(escapeHtml('Shopping list — 4 items')).toBe('Shopping list — 4 items')
    })

    it('escapes all five HTML-significant characters', () => {
        expect(escapeHtml('&')).toBe('&amp;')
        expect(escapeHtml('<')).toBe('&lt;')
        expect(escapeHtml('>')).toBe('&gt;')
        expect(escapeHtml('"')).toBe('&quot;')
        expect(escapeHtml("'")).toBe('&#39;')
    })

    it('escapes the ampersand first so entities are not double-encoded', () => {
        // Naive ordering would turn < into &lt; then & into &amp;lt;
        expect(escapeHtml('<b>')).toBe('&lt;b&gt;')
        expect(escapeHtml('a & <b>')).toBe('a &amp; &lt;b&gt;')
    })

    it('neutralises a script tag in an ingredient name', () => {
        expect(escapeHtml('<script>alert(1)</script>'))
            .toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('neutralises an attribute break-out in a URL', () => {
        expect(escapeHtml('http://x/#a" onmouseover="evil()'))
            .toBe('http://x/#a&quot; onmouseover=&quot;evil()')
    })

    it('coerces non-strings rather than throwing', () => {
        expect(escapeHtml(4)).toBe('4')
        expect(escapeHtml(null)).toBe('null')
    })

    it('preserves newlines (the caller converts them to <br>)', () => {
        expect(escapeHtml('a\nb')).toBe('a\nb')
    })
})
