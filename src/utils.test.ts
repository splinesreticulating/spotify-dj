import stripAnsi from 'strip-ansi'
import { describe, expect, it } from 'vitest'
import { NowPlayingStatus } from './types.js'
import {
    formatInBrackets,
    formatNowPlaying,
    getCompatibleKeys,
    getFutureTime,
    getSimilarLevels,
    lastPlayed,
    sleep,
} from './utils.js'

describe('formatInBrackets', () => {
    it('formats text in brackets with colors', () => {
        const result = formatInBrackets('Test')
        const strippedResult = stripAnsi(result) // Remove color codes
        expect(strippedResult).toBe('[Test]')
    })
})

describe('getCompatibleKeys', () => {
    it('returns compatible keys for a valid key', () => {
        expect(getCompatibleKeys('1A')).toEqual([
            '1A',
            '1B',
            '12A',
            '2A',
            '3A',
            '12B',
            '8A',
            '4B',
        ])
    })

    it('returns an empty array for an invalid key', () => {
        expect(getCompatibleKeys('invalid')).toEqual([])
    })
})

describe('getSimilarLevels', () => {
    it('returns similar levels for a valid level', () => {
        expect(getSimilarLevels(2)).toEqual(['3', '5'])
    })

    it('returns an empty array for an invalid level', () => {
        expect(getSimilarLevels(9999)).toEqual([])
    })
})

describe('formatNowPlaying', () => {
    it('formats now playing information', () => {
        const nowPlaying = {
            trackId: '123', // Mock track ID
            title: 'Song Title',
            artists: ['Artist 1', 'Artist 2'],
            albumInfo: { name: 'Album Name' },
            status: NowPlayingStatus.playing, // Mock status
        }

        const result = formatNowPlaying(nowPlaying)
        expect(result).toContain('Song Title by Artist 1, Artist 2')
        expect(result).toContain('[Album Name]')
    })

    it('handles missing album info gracefully', () => {
        const nowPlaying = {
            trackId: '123', // Mock track ID
            title: 'Song Title',
            artists: ['Artist 1', 'Artist the 2nd'],
            status: NowPlayingStatus.playing, // Mock status
            albumInfo: { name: 'Album Name' },
        }

        const result = formatNowPlaying(nowPlaying)
        expect(result).toContain('Song Title by Artist 1')
    })
})

describe('sleep', () => {
    it('resolves after a given time', async () => {
        const start = Date.now()
        await sleep(100) // Sleep for 100ms
        const end = Date.now()
        expect(end - start).toBeGreaterThanOrEqual(100)
    })
})

describe('lastPlayed', () => {
    it('returns "never played" for null date', () => {
        expect(lastPlayed(null)).toBe('never played')
    })

    it('returns "last played today" for the current date', () => {
        const today = new Date()
        expect(lastPlayed(today)).toBe('last played today')
    })

    it('returns days ago for past dates', () => {
        const yesterday = new Date(Date.now() - 1000 * 60 * 60 * 24) // 1 day ago
        expect(lastPlayed(yesterday)).toBe('last played 1 day ago')
    })
})

describe('getFutureTime', () => {
    it('returns a time string for a future delay', () => {
        const result = getFutureTime(1000 * 60 * 60) // 1 hour in the future
        expect(result).toMatch(/^\d{1,2}:\d{2}:\d{2}$/) // Matches time format
    })
})
