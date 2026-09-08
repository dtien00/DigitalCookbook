import { describe, it, expect } from 'vitest'
import {
    encodeList,
    decodeList,
    payloadHash,
    SHARE_VERSION,
    MAX_SHARE_PAYLOAD,
} from './shareList'

// These pin the URL-share transport: a round-trip must preserve the buy-relevant
// fields, malformed input must be distinguishable from an empty list, and the
// payload hash must be stable (it drives idempotent re-import). React-free, so
// exercised with plain data.

describe('encodeList / decodeList round-trip', () => {
    it('preserves name, unit, quantity, and notes', () => {
        const items = [
            { name: 'Jasmine rice', unit: 'cups', quantity: 2, notes: 'long grain' },
            { name: 'Coconut milk', unit: 'can', quantity: 1, notes: null },
        ]
        const decoded = decodeList(encodeList(items))
        expect(decoded).toEqual([
            { name: 'Jasmine rice', unit: 'cups', quantity: 2, notes: 'long grain' },
            { name: 'Coconut milk', unit: 'can', quantity: 1, notes: null },
        ])
    })

    it('normalises absent optional fields to null', () => {
        const decoded = decodeList(encodeList([{ name: 'Salt' }]))
        expect(decoded).toEqual([{ name: 'Salt', unit: null, quantity: null, notes: null }])
    })

    it('survives non-ASCII names and fraction glyphs', () => {
        const items = [{ name: 'Jalapeño', unit: '½ cup', quantity: 0.5, notes: 'crème fraîche' }]
        expect(decodeList(encodeList(items))).toEqual([
            { name: 'Jalapeño', unit: '½ cup', quantity: 0.5, notes: 'crème fraîche' },
        ])
    })

    it('drops rows with no usable name on encode', () => {
        const decoded = decodeList(encodeList([
            { name: '  ', unit: 'cups', quantity: 1 },
            { name: 'Flour', unit: 'cups', quantity: 3 },
        ]))
        expect(decoded).toHaveLength(1)
        expect(decoded[0].name).toBe('Flour')
    })

    it('produces a URL-fragment-safe payload (base64url alphabet only)', () => {
        const encoded = encodeList([{ name: 'Butter (unsalted)', unit: 'tbsp', quantity: 4 }])
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('round-trips an empty list to a valid empty array', () => {
        expect(decodeList(encodeList([]))).toEqual([])
    })
})

describe('decodeList failure modes', () => {
    it('returns null for a non-string / empty input', () => {
        expect(decodeList(null)).toBeNull()
        expect(decodeList('')).toBeNull()
        expect(decodeList(42)).toBeNull()
    })

    it('returns null for a truncated / malformed payload', () => {
        const good = encodeList([{ name: 'Flour', unit: 'cups', quantity: 3 }])
        // Lop off the tail the way a chat app clipping a long URL would.
        expect(decodeList(good.slice(0, Math.max(1, good.length - 4)))).toBeNull()
    })

    it('returns null for a payload whose version is unknown', () => {
        const bytes = new TextEncoder().encode(JSON.stringify({ v: SHARE_VERSION + 1, i: [] }))
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        const encoded = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        expect(decodeList(encoded)).toBeNull()
    })

    it('distinguishes malformed (null) from valid-empty ([])', () => {
        expect(decodeList('!!!not-base64!!!')).toBeNull()
        expect(decodeList(encodeList([]))).toEqual([])
    })
})

describe('payloadHash', () => {
    it('is stable for an identical payload', () => {
        const a = encodeList([{ name: 'Flour', unit: 'cups', quantity: 3 }])
        const b = encodeList([{ name: 'Flour', unit: 'cups', quantity: 3 }])
        expect(payloadHash(a)).toBe(payloadHash(b))
    })

    it('differs when the payload differs', () => {
        const a = encodeList([{ name: 'Flour', unit: 'cups', quantity: 3 }])
        const b = encodeList([{ name: 'Flour', unit: 'cups', quantity: 4 }])
        expect(payloadHash(a)).not.toBe(payloadHash(b))
    })

    it('returns a non-empty string and tolerates junk', () => {
        expect(payloadHash('anything')).toMatch(/^[a-z0-9]+$/)
        expect(typeof payloadHash(null)).toBe('string')
    })
})

describe('MAX_SHARE_PAYLOAD', () => {
    it('is a sane positive ceiling', () => {
        expect(MAX_SHARE_PAYLOAD).toBeGreaterThan(500)
    })
})
