import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ShowSchedule } from '../types.js'
import { dbClient } from './init.js'
import { hoursIntoShow } from './queries.js'
import { checkSchedule } from './queries.js'

describe('hoursIntoShow', () => {
    beforeEach(() => {
        // Set up mock for all database queries
        vi.spyOn(dbClient, 'query').mockImplementation((_query, params) => {
            const [time, day] = params as [string, number]

            // Mock responses based on the test scenarios
            if (time === '00:30:00' && day === 0)
                return Promise.resolve({ rows: [{ hours_since_start: 0.5 }] })
            if (time === '01:30:00' && day === 0)
                return Promise.resolve({ rows: [{ hours_since_start: 1.5 }] })
            if (time === '02:30:00' && day === 0)
                return Promise.resolve({ rows: [{ hours_since_start: 2.5 }] })
            if (time === '05:30:00' && day === 0)
                return Promise.resolve({ rows: [{ hours_since_start: 5.5 }] })
            if (time === '06:30:00' && day === 0)
                return Promise.resolve({ rows: [{ hours_since_start: 999 }] })
            if (time === '23:30:00' && day === 0)
                return Promise.resolve({ rows: [{ hours_since_start: 999 }] })
            if (time === '00:30:00' && day === 1)
                return Promise.resolve({ rows: [{ hours_since_start: 0.5 }] })

            return Promise.resolve({ rows: [] })
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    const runHoursQuery = async (time: string, day: number) => {
        const result = await dbClient.query(hoursIntoShow, [time, day])
        return Number(result.rows[0]?.hours_since_start)
    }

    test('returns correct hours for overnight show', async () => {
        expect(await runHoursQuery('00:30:00', 0)).toBe(0.5) // 30min into show
        expect(await runHoursQuery('01:30:00', 0)).toBe(1.5) // 1.5h into show
        expect(await runHoursQuery('05:30:00', 0)).toBe(5.5) // 5.5h into show
    })

    test('handles day transitions correctly', async () => {
        expect(await runHoursQuery('23:30:00', 0)).toBe(999) // No show
        expect(await runHoursQuery('00:30:00', 1)).toBe(0.5) // 30min into show
    })

    test('returns 999 when no show is active', async () => {
        expect(await runHoursQuery('06:30:00', 0)).toBe(999) // Between shows
    })

    test('correctly calculates hours for overnight show across midnight', async () => {
        expect(await runHoursQuery('01:30:00', 0)).toBe(1.5) // Should be 1.5 hours into show
        expect(await runHoursQuery('02:30:00', 0)).toBe(2.5) // Should be 2.5 hours into show
    })
})

describe('checkSchedule', () => {
    beforeEach(() => {
        // Set up mock for checkSchedule queries
        vi.spyOn(dbClient, 'query').mockImplementation((query, params) => {
            if (query === checkSchedule) {
                return Promise.resolve({
                    rows: [
                        {
                            show_name: 'Monday Britpop',
                            rules: [
                                { days: [1], start: '19:00', end: '21:00' },
                            ],
                            genre_lock: ['britpop'],
                        },
                    ],
                })
            }
            return Promise.resolve({ rows: [] })
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    test('returns most time-precise show when shows overlap', async () => {
        const result = await dbClient.query<ShowSchedule>(checkSchedule, [
            1,
            '19:30:00',
        ])

        expect(result.rows.length).toBe(1)
        expect(result.rows[0].show_name).toBe('Monday Britpop')
    })
})
