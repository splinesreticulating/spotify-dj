import { describe, expect, it } from 'vitest'
import { spotifytoCamelotKey } from './converters.js'

describe('spotifytoCamelotKey', () => {
    it('returns the correct major key', () => {
        expect(spotifytoCamelotKey(0, 1)).toBe('8B')
        expect(spotifytoCamelotKey(7, 1)).toBe('9B')
    })

    it('returns the correct minor key', () => {
        expect(spotifytoCamelotKey(0, 0)).toBe('8A')
        expect(spotifytoCamelotKey(7, 0)).toBe('9A')
    })

    it('returns default key for invalid inputs', () => {
        expect(spotifytoCamelotKey(12, 1)).toBe('6A') // Key out of range
        expect(spotifytoCamelotKey(0, 2)).toBe('6A') // Invalid mode
    })
})
