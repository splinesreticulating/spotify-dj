import axios from 'axios'
import dotenv from 'dotenv'
import logger from '../logger.js'
import {
    type NowPlayingSong,
    NowPlayingStatus,
    type SpotifyArtist,
    type SpotifyError,
    type SpotifyLikedSong,
} from '../types.js'
import { SpotifyUrls } from '../types.js'
import { sleep } from '../utils.js'
import { likedSongToDbRecord } from './converters.js'
dotenv.config()

const {
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI,
    SCOPES,
    WAIT_BETWEEN_API_CALLS,
} = process.env

const getHeaders = (accessToken: string) => ({
    Authorization: `Bearer ${accessToken}`,
})

const logError = (message: string, error: SpotifyError) => {
    logger.error(
        `${message}: ${error.response ? error.response.data.error.message : error.message}`,
    )
    logger.debug(JSON.stringify(error))
}

export const getNowPlaying = async (
    accessToken: string,
): Promise<NowPlayingSong> => {
    const headers = getHeaders(accessToken)

    try {
        const { data } = await axios.get(SpotifyUrls.nowPlaying, { headers })

        return data?.is_playing
            ? {
                  trackId: data.item.id,
                  durationMs: data.item.duration_ms,
                  progressMs: data.progress_ms,
                  artists: (data.item.artists as SpotifyArtist[]).map(
                      (artist) => artist.name,
                  ),
                  title: data.item.name,
                  albumInfo: data.item.album,
                  status: NowPlayingStatus.playing,
              }
            : {
                  status: NowPlayingStatus.noTrack,
                  trackId: 'no_track',
                  title: '',
                  artists: [],
                  durationMs: 0,
                  progressMs: 0,
                  albumInfo: { name: 'none ' },
              }
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
            throw { status: 401, message: 'Token expired' }
        }
        logError(
            'Error fetching currently playing track:',
            error as SpotifyError,
        )
        throw error
    }
}

export const refreshAccessToken = async (refreshToken: string) => {
    const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    })

    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
        'base64',
    )

    try {
        const { data } = await axios.post(
            SpotifyUrls.token,
            params.toString(),
            {
                headers: {
                    Authorization: `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            },
        )
        logger.info('Access token refreshed')
        return data.access_token
    } catch (error) {
        logError('Error refreshing access token:', error as SpotifyError)
    }
}

export const generateAuthUrl = (): string => {
    if (!CLIENT_ID || !SCOPES || !REDIRECT_URI) {
        throw new Error(
            'Missing CLIENT_ID, SCOPES, or REDIRECT_URI in environment variables.',
        )
    }

    const scopes = SCOPES.trim()

    return `${
        SpotifyUrls.authorize
    }?response_type=code&client_id=${CLIENT_ID}&scope=${encodeURIComponent(
        scopes,
    )}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
}

export const appendToPlaylist = async (
    token: string,
    spotifyId: string | null,
    playlistId: string,
): Promise<void> => {
    if (!spotifyId) {
        throw new Error('Cannot append to playlist: Spotify ID is null')
    }
    const headers = getHeaders(token)

    try {
        const playlistUrl = `${SpotifyUrls.playlists}/${playlistId}/tracks`
        const { data } = await axios.post(
            playlistUrl,
            { uris: [`spotify:track:${spotifyId}`] },
            { headers },
        )
        return data
    } catch (error) {
        logError('Error appending track to playlist:', error as SpotifyError)
        throw error
    }
}

export const getLikedSongs = async (
    accessToken: string,
    limit?: number,
    offset = 0,
): Promise<SpotifyLikedSong[]> => {
    const headers = getHeaders(accessToken)
    const batchSize = 50 // Spotify API maximum per request
    let url = `${SpotifyUrls.likedSongs}?limit=${Math.min(
        limit || batchSize,
        batchSize,
    )}&offset=${offset}`
    const allSongs: SpotifyLikedSong[] = []
    let totalSongs = limit || 0

    try {
        let fetchedSongs = 0

        while (url) {
            const response = await axios.get(url, { headers })
            const data = response.data

            if (!limit && !totalSongs) {
                totalSongs = data.total
            }

            const songsBatch = likedSongToDbRecord(data.items)
            allSongs.push(...songsBatch)
            fetchedSongs += songsBatch.length

            const percentage = Math.floor(
                (fetchedSongs / (limit || totalSongs)) * 100,
            )
            process.stdout.write(`\rProcessing songs: [${percentage}%]`)

            if (limit && allSongs.length >= limit) {
                break
            }

            url = data.next ? data.next : null
            if (url) {
                await sleep(Number(WAIT_BETWEEN_API_CALLS || '333'))
            }
        }

        logger.info(`\nTotal liked songs fetched: ${allSongs.length}`)
    } catch (error) {
        logger.error(`Error fetching liked songs: ${error}`)
    }

    return allSongs
}

export const getToken = async (authHeader: string, params: string) =>
    await axios.post(`${SpotifyUrls.token}`, params, {
        headers: {
            Authorization: `Basic ${authHeader}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    })

export const getLatestPlaylist = async (
    accessToken: string,
): Promise<string> => {
    logger.debug('Fetching latest playlist')
    const headers = getHeaders(accessToken)

    try {
        const { data } = await axios.get(SpotifyUrls.myPlaylists, {
            headers,
            params: { limit: 1 },
        })
        const latestPlaylist = data.items[0] // First result is the most recent

        logger.debug(`Got latest playlist ID: ${latestPlaylist.id}`)
        return latestPlaylist.id
    } catch (error) {
        if (axios.isAxiosError(error)) {
            if (error.response?.status === 401) {
                logger.warn('Token expired')
            } else {
                logger.error(
                    `Error fetching latest playlist (${error.response?.status}): ${
                        error.response?.data?.error?.message || error.message
                    }`,
                )
            }
        } else {
            logger.error('Unexpected error:', error)
        }
        throw error
    }
}
