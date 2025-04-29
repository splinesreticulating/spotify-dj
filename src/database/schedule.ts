import chalk from 'chalk'
import logger from '../logger.js'
import { Settings, type ShowSchedule } from '../types.js'
import { dbClient } from './init.js'
import { checkSchedule } from './queries.js'
import { updateSetting } from './settings.js'
import { getSettingFromCache } from './settingsCache.js'

const SCHEDULE_SETTINGS = [
    Settings.levelLock,
    Settings.genreLock,
    Settings.roboticnessLock,
    Settings.yearMin,
    Settings.yearMax,
] as const

const DEFAULT_SETTINGS = {
    [Settings.levelLock]: '', // no lock
    [Settings.genreLock]: '.*', // match any genre
    [Settings.roboticnessLock]: '0',
    [Settings.yearMin]: '1800',
    [Settings.yearMax]: '5000',
} as const

export const checkAndUpdateSchedule = async (): Promise<void> => {
    try {
        const now = new Date()
        const currentTime = now.toTimeString().split(' ')[0]
        logger.debug(
            `Checking schedule for day ${now.getDay()} at ${currentTime}`,
        )

        const schedule = await getActiveSchedule(now.getDay(), currentTime)
        const rawSettings = await getSettingFromCache([...SCHEDULE_SETTINGS])

        if (!rawSettings) {
            logger.error('Failed to get current settings')
            return
        }

        // Convert null values to empty strings and assert type
        const currentSettings = Object.entries(rawSettings).reduce(
            (acc, [key, value]) => {
                acc[key as Settings] = value ?? ''
                return acc
            },
            {} as Record<Settings, string>,
        )

        if (schedule) {
            await handleActiveSchedule(schedule, currentSettings)
        } else {
            await handleNoActiveSchedule(currentSettings)
        }
    } catch (error) {
        logger.error(`Error checking schedule: ${error}`)
    }
}

const getActiveSchedule = async (
    day: number,
    time: string,
): Promise<ShowSchedule | null> => {
    const result = await dbClient.query<ShowSchedule>(checkSchedule, [
        day,
        time,
    ])
    return result.rows[0] || null
}

const handleActiveSchedule = async (
    schedule: ShowSchedule,
    currentSettings: Record<Settings, string>,
) => {
    const newSettings = {
        [Settings.levelLock]: schedule.level_lock.toString(),
        [Settings.genreLock]: schedule.genre_lock,
        [Settings.roboticnessLock]: schedule.roboticness_lock.toString(),
        [Settings.yearMin]: schedule.year_min.toString(),
        [Settings.yearMax]: schedule.year_max.toString(),
    }

    const hasChanges = Object.entries(newSettings).some(
        ([setting, value]) => currentSettings[setting as Settings] !== value,
    )

    if (hasChanges) {
        await updateSetting([...SCHEDULE_SETTINGS], Object.values(newSettings))
        logger.info(
            chalk.white(
                `Schedule updated: ${schedule.show_name} ` +
                    `(Level: ${schedule.level_lock}, ` +
                    `Genre: ${schedule.genre_lock}, ` +
                    `Roboticness: ${schedule.roboticness_lock}, ` +
                    `Years: ${schedule.year_min}-${schedule.year_max})`,
            ),
        )
    }
}

const handleNoActiveSchedule = async (
    currentSettings: Record<Settings, string>,
) => {
    const needsReset = Object.entries(DEFAULT_SETTINGS).some(
        ([setting, defaultValue]) =>
            currentSettings[setting as Settings] !== defaultValue,
    )

    if (needsReset) {
        await updateSetting(
            [...SCHEDULE_SETTINGS],
            Object.values(DEFAULT_SETTINGS),
        )
        logger.info('No active show - reset settings to defaults')
    }
}
