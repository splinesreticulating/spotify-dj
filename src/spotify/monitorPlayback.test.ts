import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    getInternalQueue,
    knownSong,
    queueNextCompatibleSong,
    updateDatesHistoryAndPlayCount,
} from '../database/nuts.js'
import { getSettingFromCache } from '../database/settingsCache.js'
import logger from '../logger.js'
import { Defaults, NowPlayingStatus, Settings } from '../types.js'
import { getNowPlaying, refreshAccessToken } from './api.js'
import { monitorPlayback } from './monitorPlayback.js'

vi.mock('../database/nuts.js')
vi.mock('./api.js', () => ({
    getNowPlaying: vi.fn(),
    refreshAccessToken: vi.fn(),
    appendToPlaylist: vi.fn(),
}))
vi.mock('../logger.js', () => ({
    default: {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}))
vi.mock('../database/settings.js', () => ({
    fetchSetting: vi.fn(),
    updateSetting: vi.fn(),
}))
vi.mock('../database/settingsCache.js', () => ({
    getSettingFromCache: vi.fn().mockImplementation(async (setting) => {
        const mockSettings: Partial<Record<Settings, string>> = {
            [Settings.bufferDelay]: '15000',
            [Settings.retryDelay]: '60000',
        }
        if (Array.isArray(setting)) {
            return setting.reduce(
                (acc, s: Settings) => {
                    acc[s] =
                        mockSettings[s] ||
                        String(
                            Defaults[s as unknown as keyof typeof Defaults] ??
                                '',
                        )
                    return acc
                },
                {} as Record<Settings, string>,
            )
        }
        return (
            mockSettings[setting as Settings] ||
            String(Defaults[setting as unknown as keyof typeof Defaults] ?? '')
        )
    }),
}))

const mockUpdateAccessToken = vi.fn()

const createMockNowPlaying = (status = NowPlayingStatus.playing) => ({
    status,
    trackId: 'mockTrackId',
    durationMs: 300000,
    progressMs: 100000,
    artists: ['Mock Artist'],
    title: 'Mock Song',
    albumInfo: { name: 'Mock Album' },
})

const mockNowPlaying = createMockNowPlaying()

const mockNextSong = {
    spotify_id: 'nextSpotifyId',
    title: 'Next Song',
}

// Explicitly typecast mocks as Vitest's Mock type
const mockGetNowPlaying = getNowPlaying as Mock
const mockKnownSong = knownSong as Mock
const mockGetQueue = getInternalQueue as Mock
const mockRefreshAccessToken = refreshAccessToken as Mock
const mockFetchSetting = getSettingFromCache as Mock

describe('monitorPlayback', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockFetchSetting.mockResolvedValue('mock-playlist-id')
    })

    it('should handle no track playing and retry after delay', async () => {
        mockGetNowPlaying.mockResolvedValue({
            status: NowPlayingStatus.noTrack,
        })

        const setTimeoutSpy = vi.spyOn(global, 'setTimeout')

        await monitorPlayback(
            'accessToken',
            'refreshToken',
            mockUpdateAccessToken,
        )

        expect(logger.info).toHaveBeenCalledWith('Dead air! Dead air!!')
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60000)

        setTimeoutSpy.mockRestore()
    })

    it('should update song history if the song is known', async () => {
        mockGetNowPlaying.mockResolvedValue(mockNowPlaying)
        mockKnownSong.mockResolvedValue(true)

        await monitorPlayback(
            'accessToken',
            'refreshToken',
            mockUpdateAccessToken,
        )

        expect(updateDatesHistoryAndPlayCount).toHaveBeenCalledWith(
            mockNowPlaying,
        )
    })

    it('should queue a compatible song if the queue is empty', async () => {
        mockGetNowPlaying.mockResolvedValue(mockNowPlaying)
        mockKnownSong.mockResolvedValue(false)
        mockGetQueue.mockResolvedValue([])

        await monitorPlayback(
            'accessToken',
            'refreshToken',
            mockUpdateAccessToken,
        )

        expect(queueNextCompatibleSong).toHaveBeenCalledWith(
            mockNowPlaying.trackId,
        )
    })

    it('should handle token refresh on 401 error', async () => {
        mockGetNowPlaying.mockRejectedValue({ status: 401 })
        mockRefreshAccessToken.mockResolvedValue('newAccessToken')

        await monitorPlayback(
            'accessToken',
            'refreshToken',
            mockUpdateAccessToken,
        )

        expect(refreshAccessToken).toHaveBeenCalledWith('refreshToken')
        expect(mockUpdateAccessToken).toHaveBeenCalledWith('newAccessToken')
    })

    it('should retry on unexpected errors', async () => {
        mockGetNowPlaying.mockRejectedValue(new Error('Unexpected error'))

        const setTimeoutSpy = vi.spyOn(global, 'setTimeout')

        await monitorPlayback(
            'accessToken',
            'refreshToken',
            mockUpdateAccessToken,
        )

        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Playback monitoring error'),
        )
        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60000)

        setTimeoutSpy.mockRestore()
    })
})
