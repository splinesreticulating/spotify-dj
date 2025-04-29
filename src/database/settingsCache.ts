import logger from '../logger.js'
import type { Settings } from '../types.js'
import { getFutureTime } from '../utils.js'
import { fetchSettingsFromDb } from './settingsDb.js'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

let settingsCache: Record<string, string> | null = null
let lastRefresh = 0

// Overloads for explicit return types
export function getSettingFromCache(
    names: Settings[],
): Promise<Record<Settings, string | null>>
export function getSettingFromCache(name: Settings): Promise<string | null>

// Implementation
export async function getSettingFromCache(
    names: Settings | Settings[],
): Promise<Record<Settings, string | null> | string | null> {
    await ensureCacheIsValid()

    if (Array.isArray(names)) {
        const result: Record<Settings, string | null> = {} as Record<
            Settings,
            string | null
        >
        for (const name of names as Settings[]) {
            result[name as Settings] = settingsCache?.[name] || null
        }
        logger.debug(
            `Getting settings: ${names.join(', ')}, values: ${JSON.stringify(result)}`,
        )
        return result
    }

    logger.debug(
        `Getting setting from cache: ${names as Settings}, value: ${
            settingsCache?.[names as Settings]
        }, next refresh: ${getFutureTime(CACHE_TTL)}`,
    )
    return settingsCache?.[names as Settings] || null
}

export const getAllSettings = async (): Promise<Record<string, string>> => {
    await ensureCacheIsValid()
    return settingsCache || {}
}

export const refreshCache = async (): Promise<void> => {
    try {
        settingsCache = await fetchSettingsFromDb()
        lastRefresh = Date.now()
        logger.debug('Settings cache refreshed.')
    } catch (error) {
        logger.error(`Failed to refresh settings cache: ${error}`)
        throw error
    }
}

const ensureCacheIsValid = async (): Promise<void> => {
    if (!settingsCache || Date.now() - lastRefresh > CACHE_TTL) {
        await refreshCache()
    }
}

// Initialize cache on module load
refreshCache().catch((error) => {
    logger.error(`Failed to initialize settings cache: ${error}`)
})
