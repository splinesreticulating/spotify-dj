import logger from '../logger.js'
import { Defaults, Settings } from '../types.js'
import type { SongRecord } from '../types.js'
import { lastPlayed } from '../utils.js'
import { handleDatabaseError } from '../utils.js'
import { dbClient } from './init.js'
import { processNamedParameters } from './queryUtils.js'
import { getSettingFromCache } from './settingsCache.js'

export const logSongDetails = (song: SongRecord, prefix = 'Next up') => {
    const { bpm, artists, title, key, level, date_played, year } = song
    logger.info(
        `${prefix} at level ${level}: [${year}] ${title} by ${artists.join(
            ', ',
        )} (${bpm}/${key}) - ${lastPlayed(date_played)}`,
    )
}

export const executeCompatibilityQuery = async (
    sql: string,
    params: Record<string, unknown>,
): Promise<SongRecord | null> => {
    try {
        const settings = await getSettingFromCache([
            Settings.promiscuity,
            Settings.roboticnessLock,
        ])

        params.promiscuity =
            Number(settings[Settings.promiscuity]) || Defaults.promiscuity
        params.roboticnessLock = Number(settings[Settings.roboticnessLock]) || 0

        const { sql: processedSql, values } = processNamedParameters(
            sql,
            params,
        )

        logger.debug('Executing SQL:')
        logger.debug(processedSql)
        logger.debug(`with values: ${JSON.stringify(values)}`)

        // The SQL and values above are what will be sent to Postgres
        const res = await dbClient.query(processedSql, values)

        if (res.rows.length > 0) {
            const compatibleSong: SongRecord = res.rows[0]
            logSongDetails(compatibleSong)
            return compatibleSong
        }
        return null
    } catch (error) {
        handleDatabaseError(error)
        return null
    }
}
