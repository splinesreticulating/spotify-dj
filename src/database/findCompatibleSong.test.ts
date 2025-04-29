import dotenv from 'dotenv'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as settingsCache from '../database/settingsCache.js'
import { Defaults, Settings } from '../types.js'
import { dbClient, platformId } from './init.js'
import { findCompatibleSong } from './nuts.js'

beforeAll(() => {
    dotenv.config()
})

// Helper functions
const createMockSettings = (
    overrides: Partial<Record<Settings, string>> = {},
) => ({
    [Settings.promiscuity]: String(Defaults.promiscuity),
    [Settings.delayAlbum]: '24',
    [Settings.delayArtist]: '12',
    [Settings.delayTitle]: '48',
    [Settings.levelLock]: '3',
    [Settings.genreLock]: '.*',
    [Settings.roboticnessLock]: '0',
    [Settings.yearMin]: '0',
    [Settings.yearMax]: '3000',
    [Settings.playlistId]: '',
    [Settings.retryDelay]: '60000',
    [Settings.bufferDelay]: '15000',
    [Settings.bpmMinMultiplier]: '0.96',
    [Settings.bpmMaxMultiplier]: '1.09',
    ...overrides,
})

const mockSettingsCache = (
    overrides: Partial<Record<Settings, string>> = {},
) => {
    const mockSettings = createMockSettings(overrides)
    return vi
        .spyOn(settingsCache, 'getSettingFromCache')
        .mockImplementation(
            async <T extends Settings | Settings[]>(names: T) => {
                if (Array.isArray(names)) {
                    const result = Object.fromEntries(
                        names.map((setting) => {
                            const settingKey =
                                setting as unknown as keyof typeof Defaults
                            return [
                                setting,
                                mockSettings[setting] ||
                                    (Defaults[settingKey] !== undefined
                                        ? String(Defaults[settingKey])
                                        : null),
                            ]
                        }),
                    ) as Record<Settings, string | null>
                    return result as T extends Settings
                        ? string | null
                        : Record<Settings, string | null>
                }

                const settingKey = names as unknown as keyof typeof Defaults
                const defaultValue = Defaults[settingKey]
                const singleResult =
                    mockSettings[names as Settings] ||
                    (defaultValue !== undefined ? String(defaultValue) : null)
                return singleResult as T extends Settings
                    ? string | null
                    : Record<Settings, string | null>
            },
        )
}

const getSampleRootSong = async (whereClause = '') => {
    const result = await dbClient.query(`
        SELECT n.*, COUNT(ct.branch_id) as branch_count
        FROM nuts n
        JOIN compatibility_tree ct ON n.id = ct.root_id
        ${whereClause}
        GROUP BY n.id
        LIMIT 1
    `)
    if (!result.rows[0]) throw new Error('No sample root song found')
    return result.rows[0]
}

const getLonelyRootSong = async () => {
    const result = await dbClient.query(`
        SELECT n.* FROM nuts n
        WHERE NOT EXISTS (
            SELECT 1 FROM compatibility_tree ct
            WHERE ct.root_id = n.id
        )
        AND bpm IS NOT NULL
        AND key IS NOT NULL
        AND roboticness IS NOT NULL
        AND ${platformId} IS NOT NULL
        LIMIT 1
    `)
    if (!result.rows[0]) throw new Error('No lonely root song found')
    return result.rows[0]
}

const verifyCompatibilityRelation = async (
    rootId: number,
    branchId: number,
) => {
    const { rows } = await dbClient.query(
        'SELECT 1 FROM compatibility_tree WHERE root_id = $1 AND branch_id = $2',
        [String(rootId), String(branchId)],
    )
    return rows.length > 0
}

describe('Compatibility Tree', () => {
    it('should find compatible songs using the compatibility tree', async () => {
        const rootSong = await getSampleRootSong(`
            WHERE EXISTS (
                SELECT 1 FROM compatibility_tree ct2
                JOIN nuts n2 ON n2.id = ct2.branch_id
                WHERE ct2.root_id = n.id
                AND n2.level = n.level
                AND (EXTRACT(EPOCH FROM (NOW() - n2.date_played)) / 3600 > n2.hours_off OR n2.date_played IS NULL)
            )
        `)

        mockSettingsCache({
            [Settings.promiscuity]: '0',
            [Settings.levelLock]: String(rootSong.level),
            [Settings.genreLock]: '.*',
            [Settings.delayAlbum]: '0',
            [Settings.delayArtist]: '0',
            [Settings.delayTitle]: '0',
        })

        const compatibleSong = await findCompatibleSong(rootSong, 0)
        expect(compatibleSong).not.toBeNull()

        if (compatibleSong) {
            const hasRelation = await verifyCompatibilityRelation(
                rootSong.id,
                compatibleSong.id,
            )
            expect(hasRelation).toBe(true)
        }
    })

    it('should respect level lock constraints', async () => {
        const rootSong = await getSampleRootSong('WHERE n.level = 3')
        mockSettingsCache({
            [Settings.promiscuity]: '10',
            [Settings.levelLock]: '3',
        })

        const compatibleSong = await findCompatibleSong(rootSong, 0)
        expect(compatibleSong).not.toBeNull()
        if (compatibleSong) {
            expect(compatibleSong.level).toBe(3)
        }
    })

    it('should fall back to regular search when no tree matches exist', async () => {
        mockSettingsCache({
            [Settings.promiscuity]: '10',
            [Settings.levelLock]: '1',
        })

        const rootSong = await getLonelyRootSong()
        const compatibleSong = await findCompatibleSong(rootSong, 0)

        expect(compatibleSong).not.toBeNull()
        if (compatibleSong) {
            const hasRelation = await verifyCompatibilityRelation(
                rootSong.id,
                compatibleSong.id,
            )
            expect(hasRelation).toBe(false)
        }
    })

    it('should respect delay settings', async () => {
        const rootSong = await getSampleRootSong()
        mockSettingsCache({
            [Settings.promiscuity]: '0',
            [Settings.delayAlbum]: '1440', // 60 days
            [Settings.delayArtist]: '720', // 30 days
            [Settings.delayTitle]: '2880', // 120 days
        })

        const compatibleSong = await findCompatibleSong(rootSong, 0)
        expect(compatibleSong).not.toBeNull()

        if (compatibleSong) {
            const {
                rows: [delays],
            } = await dbClient.query(
                `
                SELECT 
                    EXTRACT(EPOCH FROM (NOW() - date_album_played))/3600 as album_hours,
                    EXTRACT(EPOCH FROM (NOW() - date_artist_played))/3600 as artist_hours,
                    EXTRACT(EPOCH FROM (NOW() - date_title_played))/3600 as title_hours
                FROM nuts 
                WHERE id = $1
            `,
                [compatibleSong.id],
            )

            expect(
                delays.album_hours === null || delays.album_hours >= 24,
            ).toBe(true)
            expect(
                delays.artist_hours === null || delays.artist_hours >= 12,
            ).toBe(true)
            expect(
                delays.title_hours === null || delays.title_hours >= 48,
            ).toBe(true)
        }
    })

    it('should respect hours_off constraint', async () => {
        const rootSong = await getSampleRootSong()
        mockSettingsCache({ [Settings.promiscuity]: '0' })

        const compatibleSong = await findCompatibleSong(rootSong, 0)
        expect(compatibleSong).not.toBeNull()

        if (compatibleSong) {
            const {
                rows: [{ hours_elapsed }],
            } = await dbClient.query(
                `
                SELECT EXTRACT(EPOCH FROM (NOW() - date_played)) / 3600 as hours_elapsed
                FROM nuts 
                WHERE id = $1
            `,
                [compatibleSong.id],
            )

            expect(
                hours_elapsed === null ||
                    hours_elapsed > compatibleSong.hours_off,
            ).toBe(true)
        }
    })

    afterAll(async () => {
        await dbClient.end()
    })
})
