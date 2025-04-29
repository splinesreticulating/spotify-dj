import readline from 'node:readline'
import axios from 'axios'
import chalk from 'chalk'
import dotenv from 'dotenv'
import { dbClient } from '../database/init.js'
import logger from '../logger.js'

dotenv.config()

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const APP_CONTACT = process.env.APP_CONTACT || 'your-email@example.com'

const MB_RATE_LIMIT = 1100
const DISCOGS_RATE_LIMIT = 1000

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

const promptUser = (question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.toLowerCase().trim())
        })
    })
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getMusicBrainzYear(
    artist: string,
    title: string,
): Promise<number | null> {
    // Rate limit at the start
    await sleep(MB_RATE_LIMIT)

    try {
        const searchResponse = await axios.get(
            'https://musicbrainz.org/ws/2/recording',
            {
                params: {
                    query: `artist:${artist} AND recording:${title}`,
                    fmt: 'json',
                },
                headers: { 'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )` },
            },
        )

        const recording = searchResponse.data.recordings?.[0]
        if (!recording?.releases?.[0]?.date) return null

        const year = Number.parseInt(recording.releases[0].date.split('-')[0])
        return Number.isNaN(year) ? null : year
    } catch (error) {
        logger.error(`MusicBrainz API error: ${error}`)
        return null
    }
}

async function getDiscogsYear(
    artist: string,
    title: string,
): Promise<number | null> {
    // Rate limit at the start
    await sleep(DISCOGS_RATE_LIMIT)

    try {
        const searchResponse = await axios.get(
            'https://api.discogs.com/database/search',
            {
                params: {
                    q: `${artist} ${title}`,
                    type: 'release',
                    token: DISCOGS_TOKEN,
                },
                headers: {
                    'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )`,
                },
            },
        )

        const release = searchResponse.data.results?.[0]
        if (!release?.year) return null

        return release.year
    } catch (error) {
        logger.error(`Discogs API error: ${error}`)
        return null
    }
}

async function updateIncorrectYears() {
    try {
        const { rows } = await dbClient.query(`
            SELECT id, title, artists, year
            FROM nuts
            WHERE year < 1920
            ORDER BY id
        `)

        logger.info(
            `Found ${rows.length} songs with potentially incorrect years`,
        )
        let updatedCount = 0
        let defaultCount = 0
        let failedCount = 0
        let autoFoundCount = 0

        for (const row of rows) {
            const artist = row.artists[0]
            console.log(
                chalk.blue(
                    `\nProcessing ${updatedCount + defaultCount + failedCount + autoFoundCount + 1}/${rows.length}: ${artist} - ${row.title} (Current year: ${row.year})`,
                ),
            )

            // Try MusicBrainz and Discogs only
            const [mbYear, discogsYear] = await Promise.all([
                getMusicBrainzYear(artist, row.title),
                getDiscogsYear(artist, row.title),
            ])

            console.log(chalk.cyan('Years found:'))
            console.log(chalk.cyan(`  MusicBrainz: ${mbYear || 'not found'}`))
            console.log(chalk.cyan(`  Discogs: ${discogsYear || 'not found'}`))

            // Use the earliest year found from any service
            const validYears = [mbYear, discogsYear].filter(
                (year): year is number => year !== null && year >= 1920,
            )

            if (validYears.length > 0) {
                const earliestYear = Math.min(...validYears)
                await dbClient.query(
                    'UPDATE nuts SET year = $1 WHERE id = $2',
                    [earliestYear, row.id],
                )
                console.log(
                    chalk.green(
                        `✓ Automatically found and updated year to ${earliestYear}`,
                    ),
                )
                autoFoundCount++
                continue
            }

            // If no year found automatically, prompt user
            const answer = await promptUser(
                chalk.yellow(
                    `Enter year (YYYY), or:\nPress Enter for 2010\n's to skip\nYear: `,
                ),
            )

            if (answer === 's') {
                console.log(chalk.yellow('⏭️  Skipped'))
                failedCount++
                continue
            }

            if (answer === '') {
                await dbClient.query(
                    'UPDATE nuts SET year = $1 WHERE id = $2',
                    [2010, row.id],
                )
                console.log(chalk.green('✓ Set year to 2010 (default)'))
                defaultCount++
                continue
            }

            const year = Number.parseInt(answer)
            if (
                !Number.isNaN(year) &&
                year >= 1920 &&
                year <= new Date().getFullYear()
            ) {
                await dbClient.query(
                    'UPDATE nuts SET year = $1 WHERE id = $2',
                    [year, row.id],
                )
                console.log(chalk.green(`✓ Updated year to ${year}`))
                updatedCount++
            } else {
                console.log(chalk.red('❌ Invalid year, skipping'))
                failedCount++
            }
        }

        logger.info('\nProcess complete!')
        logger.info(`Automatically found: ${autoFoundCount} records`)
        logger.info(`Manually updated: ${updatedCount} records`)
        logger.info(`Set to 2010 (default): ${defaultCount} records`)
        logger.info(`Skipped/Failed: ${failedCount} records`)
    } catch (error) {
        logger.error('Error updating years:', error)
    } finally {
        rl.close()
        await dbClient.end()
    }
}

updateIncorrectYears()
