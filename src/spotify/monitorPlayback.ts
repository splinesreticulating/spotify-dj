import {
    dequeueNextSong,
    getInternalQueue,
    knownSong,
    queueNextCompatibleSong,
    updateDatesHistoryAndPlayCount,
} from '../database/nuts.js'
import { checkAndUpdateSchedule } from '../database/schedule.js'
import { updateSetting } from '../database/settings.js'
import { getSettingFromCache } from '../database/settingsCache.js'
import logger from '../logger.js'
import { Defaults, NowPlayingStatus, Settings } from '../types.js'
import { formatNowPlaying, getFutureTime } from '../utils.js'
import {
    appendToPlaylist,
    getLatestPlaylist,
    getNowPlaying,
    refreshAccessToken,
} from './api.js'

const refreshPlaylistId = async (token: string): Promise<string> => {
    const latestPlaylistId = await getLatestPlaylist(token)
    const playlistId = await getSettingFromCache(Settings.playlistId)

    if (latestPlaylistId !== playlistId) {
        logger.info('Using new playlist')
        await updateSetting(Settings.playlistId, latestPlaylistId)
        return latestPlaylistId
    }
    return playlistId
}

export async function monitorPlayback(
    accessToken: string,
    refreshToken: string,
    updateAccessToken: (newToken: string) => void,
): Promise<void> {
    // Check schedule first
    await checkAndUpdateSchedule()

    const settings = await getSettingFromCache([
        Settings.bufferDelay,
        Settings.retryDelay,
    ])
    const BUFFER_DELAY =
        Number(settings[Settings.bufferDelay]) || Defaults.bufferDelay
    const RETRY_DELAY =
        Number(settings[Settings.retryDelay]) || Defaults.retryDelay
    const SHORT_RETRY = 2_000 // Short retry for recoverable errors

    const retry = async (delay: number, token: string) => {
        logger.debug(`Next check @ ${getFutureTime(delay)}...`)
        setTimeout(
            () => monitorPlayback(token, refreshToken, updateAccessToken),
            delay,
        )
    }

    const executeWithTokenRefresh = async <T>(
        operation: (token: string) => Promise<T>,
    ): Promise<T> => {
        let currentToken = accessToken;
        try {
            return await operation(currentToken);
        } catch (error) {
            if (
                typeof error === 'object' &&
                error &&
                'status' in error &&
                error.status === 401
            ) {
                const newToken = await refreshAccessToken(refreshToken);
                if (newToken) {
                    updateAccessToken(newToken);
                    currentToken = newToken;
                    return operation(currentToken);
                }
            }
            throw error;
        }
    }

    try {
        // Get current playback state
        const nowPlaying = await executeWithTokenRefresh(getNowPlaying)

        // Handle no track or expired token
        if (!nowPlaying || nowPlaying.status === NowPlayingStatus.noTrack) {
            logger.info('Dead air! Dead air!!')
            return retry(RETRY_DELAY, accessToken)
        }

        logger.info(formatNowPlaying(nowPlaying))

        // Update history if known
        if (await knownSong(nowPlaying.trackId)) {
            await updateDatesHistoryAndPlayCount(nowPlaying)
        } else {
            logger.info(`Don't know this one`)
        }

        // Ensure queue isn't empty
        if ((await getInternalQueue()).length === 0) {
            logger.debug('Adding a compatible song to empty queue')
            await queueNextCompatibleSong(nowPlaying.trackId)
        }

        // Calculate when to queue the next song
        const timeUntilNext = Math.max(
            (nowPlaying.durationMs ?? 0) -
                (nowPlaying.progressMs ?? 0) -
                BUFFER_DELAY,
            1000,
        )

        logger.info(`Processing queue @ ${getFutureTime(timeUntilNext)}...`)

        // Queue up next song near the end of current song
        setTimeout(async () => {
            try {
                const nextSong = await dequeueNextSong()
                if (!nextSong) {
                    logger.error('Failed to dequeue the next song.')
                    return retry(SHORT_RETRY, accessToken)
                }

                const playlistId =
                    await executeWithTokenRefresh(refreshPlaylistId)
                await executeWithTokenRefresh((token) =>
                    appendToPlaylist(token, nextSong.spotify_id, playlistId),
                )

                logger.info(`Added "${nextSong.title}" to playlist`)
                await retry(30_000, accessToken)
            } catch (error) {
                logger.error(`Error processing queue: ${error}`)
                await retry(RETRY_DELAY, accessToken)
            }
        }, timeUntilNext)
    } catch (error) {
        logger.error(`Playback monitoring error: ${error}`)
        retry(RETRY_DELAY, accessToken)
    }
}
