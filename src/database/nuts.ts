import logger from '../logger.js'
import type {
    MetaDataWithId,
    NowPlayingSong,
    SongRecord,
    SpotifyLikedSong,
} from '../types.js'
import { Defaults, Settings } from '../types.js'
import { flipACoin, getCompatibleKeys, getSimilarLevels } from '../utils.js'
import { compatibilityParams } from './compatibilityParams.js'
import {
    executeCompatibilityQuery,
    logSongDetails,
} from './compatibilityUtils.js'
import { dbClient } from './init.js'
import {
    albumDelay,
    artistDelay,
    bpmRange,
    compatibilityCheck,
    compatibilityTreeQuery,
    deleteSongs as deleteSongsQuery,
    dequeueInternal,
    exactLevel,
    exactRoboticness,
    genreLock,
    getInternalQueueQuery,
    hoursIntoShow,
    hoursOffCheck,
    insertHistory,
    key,
    likedSongAdditions as likedSongAdditionsQuery,
    likedSongDeletions as likedSongDeletionsQuery,
    queueInternally,
    relaxedRoboticness,
    roboticnessLock,
    saveLikedSongs as saveLikedSongsQuery,
    selectFromNuts,
    selectPlatformId,
    similarLevels,
    titleDelay,
    unprocessedSongs as unprocessedSongsQuery,
    updateAlbumDate,
    updateArtistDate,
    updatePlayCount,
    updateTitleDate,
} from './queries.js'
import { getSettingFromCache } from './settingsCache.js'
import { withTransaction } from './transactionUtils.js'

let cachedBpmMinMultiplier: number | null = null
let cachedBpmMaxMultiplier: number | null = null

const initializeSettingsCache = async () => {
    const bpmSettings = await getSettingFromCache([
        Settings.bpmMinMultiplier,
        Settings.bpmMaxMultiplier,
    ])
    cachedBpmMinMultiplier =
        Number(bpmSettings[Settings.bpmMinMultiplier]) ||
        Defaults.bpmMinMultiplier
    cachedBpmMaxMultiplier =
        Number(bpmSettings[Settings.bpmMaxMultiplier]) ||
        Defaults.bpmMaxMultiplier
}

const getLevelToUse = async (
    currentSong: SongRecord | MetaDataWithId,
    levelLock: number | null,
) => {
    // If no level lock, just use current song's level
    if (levelLock === null || !('level' in currentSong)) {
        return currentSong.level
    }

    // Use level lock if we're in first hour of a show, otherwise use current song's level
    const now = new Date()
    const currentTime = now.toTimeString().split(' ')[0]
    const currentDay = now.getDay()
    const result = await dbClient.query(hoursIntoShow as string, [
        currentTime,
        currentDay,
    ])

    type HoursSinceStartRow = { hours_since_start: number }
    const rows = result.rows as unknown as HoursSinceStartRow[]
    const hours = rows[0]?.hours_since_start ?? 999
    return hours <= 1
        ? levelLock
        : Number(currentSong.level) !== levelLock
          ? currentSong.level
          : levelLock
}

const getMetaData = async (trackId: string): Promise<SongRecord | null> => {
    try {
        const result = await dbClient.query(selectFromNuts, [trackId])

        if (result.rows.length === 0) {
            return null
        }

        const song = result.rows[0]

        logger.debug(`Found ${song.title} in database`)

        if (song.key !== null && song.key !== undefined) {
            logger.debug('Found metadata')
            return song
        }
        logger.info('No metadata found')
        return null
    } catch (error) {
        throw new Error(error as unknown as string)
    }
}

const buildQuery = async ({
    level,
    bpmMin,
    bpmMax,
    compatibleKeys,
    roboticness,
    currentSong,
    alternateBPM = false,
    relaxRoboticness = false,
    broadenLevels = false,
    removeRoboticnessCheck = false,
    excludeHoursOff = false,
    removeKeyCheck = false,
    removeBPMCheck = false,
    removeDelayChecks = false,
    removeGenreLock = false,
    removeYearLock = false,
    depth = 0,
}: {
    level: number
    bpmMin: number
    bpmMax: number
    compatibleKeys: string[]
    roboticness: number
    currentSong: { id?: number } | SongRecord | MetaDataWithId
    alternateBPM?: boolean
    relaxRoboticness?: boolean
    broadenLevels?: boolean
    removeRoboticnessCheck?: boolean
    excludeHoursOff?: boolean
    removeKeyCheck?: boolean
    removeBPMCheck?: boolean
    removeDelayChecks?: boolean
    removeGenreLock?: boolean
    removeYearLock?: boolean
    depth?: number
}) => {
    const settings = await getSettingFromCache([
        Settings.levelLock,
        Settings.genreLock,
        Settings.roboticnessLock,
        Settings.yearMin,
        Settings.yearMax,
        Settings.delayAlbum,
        Settings.delayArtist,
        Settings.delayTitle,
    ])

    const levelLockSetting = Number(settings[Settings.levelLock])
    const genreLockSetting = settings[Settings.genreLock] || '.*'
    const roboticnessLockSetting =
        Number(settings[Settings.roboticnessLock]) || 0
    const delayAlbum = Number(settings[Settings.delayAlbum]) || 360
    const delayArtist = Number(settings[Settings.delayArtist]) || 60
    const delayTitle = Number(settings[Settings.delayTitle]) || 60

    const conditions: string[] = []
    const params: Record<string, unknown> = {}

    // Add condition to exclude Christmas songs
    // unless it's that special time of year
    const now = new Date()
    const isChristmas =
        (now.getMonth() === 10 && now.getDate() >= 1) ||
        (now.getMonth() === 11 && now.getDate() <= 30)
    if (!isChristmas) {
        conditions.push("(tags IS NULL OR NOT ('christmas' = ANY(tags)))")
    }

    if (broadenLevels) {
        conditions.push(similarLevels)
        params.levels = [...getSimilarLevels(Number(level)), String(level)]
    } else if (levelLockSetting !== null && 'level' in currentSong) {
        conditions.push(exactLevel)
        const levelToUse = await getLevelToUse(
            currentSong,
            Number(levelLockSetting),
        )
        params.level = Number(levelToUse)
    } else {
        conditions.push(exactLevel)
        params.level = Number(level)
    }

    // Modify the genre lock condition to be conditional
    if (!removeGenreLock) {
        conditions.push(genreLock)
        params.genreLock = genreLockSetting
    }

    if (!excludeHoursOff) {
        conditions.push(hoursOffCheck)
    }

    if (!removeBPMCheck) {
        if (alternateBPM) {
            if (bpmMin < 60) {
                // Always double very slow BPMs
                params.bpmMin = Math.round(bpmMin * 2)
                params.bpmMax = Math.round(bpmMax * 2)
            } else if (bpmMax > 100) {
                // Always halve faster BPMs to avoid exceeding 200
                params.bpmMin = Math.round(bpmMin / 2)
                params.bpmMax = Math.round(bpmMax / 2)
            } else {
                // For BPMs in the 60-100 range, randomly choose to double or halve
                const multiplier = flipACoin() ? 2 : 0.5
                params.bpmMin = Math.round(bpmMin * multiplier)
                params.bpmMax = Math.round(bpmMax * multiplier)
            }
        } else {
            params.bpmMin = bpmMin
            params.bpmMax = bpmMax
        }
        conditions.push(bpmRange)
    }

    if (!removeKeyCheck) {
        conditions.push(key)
        params.compatibleKeys = compatibleKeys
    }

    if (!removeRoboticnessCheck) {
        if (relaxRoboticness) {
            conditions.push(relaxedRoboticness)
        } else {
            conditions.push(exactRoboticness)
        }
        params.roboticness = roboticness
    }

    if (!removeDelayChecks) {
        // Album delay check
        conditions.push(albumDelay)
        params.delayAlbum = delayAlbum

        // Artist delay check
        conditions.push(artistDelay)
        params.delayArtist = delayArtist

        // Title delay check
        conditions.push(titleDelay)
        params.delayTitle = delayTitle
    }

    // Add roboticness lock check
    if (roboticnessLockSetting !== 0) {
        conditions.push(roboticnessLock)
        params.roboticnessLock = roboticnessLockSetting
    }

    // Modify the year constraints to be conditional
    if (!removeYearLock) {
        conditions.push('year BETWEEN :yearMin AND :yearMax')
        const yearSettings = await getSettingFromCache([
            Settings.yearMin,
            Settings.yearMax,
        ])
        params.yearMin = yearSettings[Settings.yearMin]
        params.yearMax = yearSettings[Settings.yearMax]
    }

    const sql = compatibilityCheck(conditions)
    return { sql, params }
}

export const findCompatibleSong = async (
    currentSong: SongRecord | MetaDataWithId,
    depth = 0,
) => {
    logger.info('Selecting next nut:')

    const promiscuity =
        Number(await getSettingFromCache(Settings.promiscuity)) ??
        Defaults.promiscuity
    const checkCompatiblePool = Math.random() * 10 > promiscuity

    // Try compatible pool first if selected
    if (checkCompatiblePool) {
        logger.info('[compatibility tree search]')
        const compatibleSong = await queryCompatibleSong(
            currentSong,
            depth,
            true,
        )
        if (compatibleSong) return compatibleSong
    }

    // Fall back to all songs
    return await queryCompatibleSong(currentSong, depth, false)
}

const queryCompatibleSong = async (
    currentSong: SongRecord | MetaDataWithId,
    depth: number,
    useCompatiblePool: boolean,
): Promise<SongRecord | null> => {
    try {
        if (useCompatiblePool) {
            const settings = await getSettingFromCache([
                Settings.levelLock,
                Settings.delayAlbum,
                Settings.delayArtist,
                Settings.delayTitle,
                Settings.genreLock,
                Settings.yearMin,
                Settings.yearMax,
            ])

            const levelLock = Number(settings[Settings.levelLock])
            const level = await getLevelToUse(currentSong, levelLock)
            const delayAlbum = Number(settings[Settings.delayAlbum]) || 360
            const delayArtist = Number(settings[Settings.delayArtist]) || 60
            const delayTitle = Number(settings[Settings.delayTitle]) || 60
            const genreLock = settings[Settings.genreLock] || '.*'
            const yearMin = Number(settings[Settings.yearMin]) || -1
            const yearMax = Number(settings[Settings.yearMax]) || 3000

            const result = await dbClient.query(compatibilityTreeQuery, [
                currentSong.id,
                level,
                delayAlbum,
                delayArtist,
                delayTitle,
                genreLock,
                yearMin,
                yearMax,
            ])

            if (result.rows[0]) {
                logSongDetails(result.rows[0])
                return result.rows[0]
            }

            return null
        }

        // Initialize cache if needed
        if (
            cachedBpmMinMultiplier === null ||
            cachedBpmMaxMultiplier === null
        ) {
            await initializeSettingsCache()
        }

        // Regular search logic
        const bpm = currentSong.bpm
        const level = currentSong.level
        const queryParams = {
            level,
            bpmMin: Math.round(bpm * (cachedBpmMinMultiplier ?? 1)),
            bpmMax: Math.round(bpm * (cachedBpmMaxMultiplier ?? 1)),
            compatibleKeys: Array.isArray(getCompatibleKeys(currentSong.key))
                ? getCompatibleKeys(currentSong.key)
                : [],
            roboticness: currentSong.roboticness || 2,
            currentSong,
            useCompatiblePool,
        }

        const maxDepth =
            depth > 0
                ? Math.min(depth, compatibilityParams.length)
                : compatibilityParams.length

        for (let i = 0; i < maxDepth; i++) {
            logger.info(`[${compatibilityParams[i].name}]`)
            const { sql, params } = await buildQuery({
                ...queryParams,
                ...compatibilityParams[i],
            })

            const result = await executeCompatibilityQuery(sql, params)
            if (result) return result
        }
    } catch (error) {
        logger.error(`Error querying database: ${error}`)
    }

    return null
}

export const updateDatesHistoryAndPlayCount = async (
    nowPlayingSong: NowPlayingSong,
) => {
    const { trackId, artists, albumInfo, title } = nowPlayingSong
    const album = albumInfo?.name

    try {
        const playCountResult = await dbClient.query(updatePlayCount, [trackId])
        if (playCountResult.rowCount === 0) {
            logger.info(
                `Error updating play counts: No song found with Spotify ID: ${trackId}`,
            )
            return
        }
        const nutId = playCountResult.rows[0].id

        // Add a record to the history table
        await dbClient.query(insertHistory, [nutId])

        // Update artist play dates for all songs for all artists involved
        await Promise.all(
            artists.map((artist) => dbClient.query(updateArtistDate, [artist])),
        )

        // Update title play date for all songs with this title
        await dbClient.query(updateTitleDate, [title])

        // Update album play date for all songs in this album
        // Not an exact science -- should probably introduce album id to do this properly
        if (album && album.toLowerCase() !== 'unknown album') {
            await dbClient.query(updateAlbumDate, [album, artists])
        }

        logger.debug('Updated dates, play count, and added to history')
    } catch (error) {
        logger.error(
            `Error updating dates, play count, or adding to history: ${error}`,
        )
        throw error
    }
}

export const knownSong = async (spotifyId: string): Promise<boolean> => {
    const query = selectFromNuts
    const result = await dbClient.query(query, [spotifyId])

    return result.rows.length === 1
}

const deleteSongs = async (spotifyIds: string[]) => {
    if (spotifyIds.length === 0) {
        logger.info('No songs to delete.')
        return
    }

    try {
        await dbClient.query(deleteSongsQuery, [spotifyIds])
    } catch (error) {
        logger.error(`Error deleting songs: ${error}`)
        throw error
    }
}

export const likedSongAdditions = async (
    spotifyIds: string[],
): Promise<string[]> => {
    try {
        const result = await dbClient.query(likedSongAdditionsQuery, [
            spotifyIds,
        ])
        return result.rows.map((row) => row.spotify_id)
    } catch (error) {
        logger.error(`Error finding songs to add: ${error}`)
        throw error
    }
}

export const likedSongDeletions = async (
    spotifyIds: string[],
): Promise<unknown[]> => {
    try {
        const result = await dbClient.query(likedSongDeletionsQuery, [
            spotifyIds,
        ])

        return result.rows.map((row) => ({
            spotifyId: row.spotify_id,
            artists: row.artists,
            title: row.title,
        }))
    } catch (error) {
        logger.error(`Error finding songs to delete: ${error}`)
        throw error
    }
}

interface SaveLikedSongsResult {
    inserted: { spotify_id: string; title: string; artists: string[] }[]
    skipped: SpotifyLikedSong[]
}

export const saveLikedSongs = async (
    songs: SpotifyLikedSong[],
): Promise<SaveLikedSongsResult> => {
    return withTransaction(async () => {
        const result: SaveLikedSongsResult = {
            inserted: [],
            skipped: [],
        }

        for (const song of songs) {
            const values = [
                song.spotifyId,
                song.title,
                `{${song.artists.map((artist) => `"${artist.replace(/"/g, '\\"')}"`).join(',')}}`,
                song.album,
                song.year,
                `{${song.imageUrls.map((url) => `"${url.replace(/"/g, '\\"')}"`).join(',')}}`,
                song.duration,
                song.explicit,
                song.dateLiked,
                3,
            ]

            const queryResult = await dbClient.query(
                saveLikedSongsQuery,
                values,
            )

            if (queryResult.rows.length > 0) {
                result.inserted.push(queryResult.rows[0])
            } else {
                result.skipped.push(song)
            }
        }

        return result
    })
}

export const queueNextCompatibleSong = async (currentTrackId: string) => {
    const metaData = await getMetaData(currentTrackId)
    if (!metaData) throw new Error(`No metadata found for ${currentTrackId}`)

    const compatibleSong = await findCompatibleSong(metaData)
    if (!compatibleSong) throw new Error('No compatible songs found.')

    await dbClient.query(queueInternally, [compatibleSong.id])
}

export const getInternalQueue = async () => {
    const result = await dbClient.query(getInternalQueueQuery)

    logger.debug(
        result.rows[0]
            ? `Found ${result.rows[0].title} in the internal queue`
            : 'No songs in the internal queue',
    )

    // warn if the queue has more than one song
    if (result.rows.length > 1) {
        logger.warn(
            `Internal queue overflow: [${result.rows.length} songs queued]`,
        )
    }

    return result.rows
}

export const dequeueNextSong = async () => {
    return withTransaction(async () => {
        const deleteResult = await dbClient.query(dequeueInternal)

        if (deleteResult.rows.length === 0) return null

        const nutId = deleteResult.rows[0].nut_id
        const songResult = await dbClient.query(selectPlatformId, [nutId])

        return songResult.rows[0]
    })
}
