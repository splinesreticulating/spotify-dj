import readline from 'node:readline'
import axios from 'axios'
import chalk from 'chalk'
import dotenv from 'dotenv'
import { TAG_CONFIG, standardizeTag } from '../config/tagConfig.js'
import { dbClient } from '../database/init.js'

dotenv.config()

const LASTFM_API_KEY = process.env.LASTFM_API_KEY

// Being very conservative with rate limits (Last.fm allows 5 requests per second)
const LASTFM_RATE_LIMIT = 500
const LASTFM_MIN_TAG_COUNT = 50
const BATCH_COOLDOWN = 5000
const BATCH_SIZE = 3500 // Process slightly less than the daily limit

interface LastFmTag {
    name: string
    count: number
}

interface Song {
    id: number
    title: string
    artists: string[]
    tags: string[]
}

async function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchLastFm(method: string, params: object): Promise<string[]> {
    try {
        await sleep(LASTFM_RATE_LIMIT)
        const response = await axios.get('http://ws.audioscrobbler.com/2.0/', {
            params: {
                method,
                api_key: LASTFM_API_KEY,
                format: 'json',
                ...params,
            },
        })

        const tags = response.data.toptags?.tag || []
        return tags
            .filter(
                (tag: LastFmTag) =>
                    tag.count >= LASTFM_MIN_TAG_COUNT &&
                    !TAG_CONFIG.blacklist.includes(tag.name.toLowerCase()),
            )
            .map((tag: LastFmTag) => standardizeTag(tag.name))
    } catch (error) {
        console.error(chalk.red('❌ Last.fm API error:'), error)
        return []
    }
}

const getLastFmArtistTags: (artist: string) => Promise<string[]> = (
    artist: string,
) => fetchLastFm('artist.getTopTags', { artist })

async function getAllSongs(startId = 0): Promise<Song[]> {
    const { rows } = await dbClient.query(
        'SELECT id, title, artists, tags FROM nuts WHERE id >= $1 ORDER BY id',
        [startId],
    )
    return rows
}

async function promptForStartId(): Promise<number> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise<number>((resolve) => {
        rl.question(
            'Enter starting song ID (or press Enter for ID 0): ',
            (answer) => {
                rl.close()
                const startId = Number.parseInt(answer) || 0
                resolve(startId)
            },
        )
    })
}

async function updateAllSongTags() {
    if (!LASTFM_API_KEY) {
        console.error('LASTFM_API_KEY not found in environment variables')
        process.exit(1)
    }

    const startId = await promptForStartId()
    console.log(chalk.blue(`Starting from ID: ${startId}`))

    try {
        const songs = await getAllSongs(startId)
        if (songs.length === 0) {
            console.log('No songs found that need tag updates')
            process.exit(0)
        }

        console.log(
            chalk.bold(`Found ${songs.length} songs that need tag updates`),
        )
        console.log(
            chalk.yellow(
                `⚠️ This will take multiple days due to Last.fm API limits (${BATCH_SIZE} songs per day)`,
            ),
        )

        const songsToProcess = songs.slice(0, BATCH_SIZE)
        console.log(
            chalk.bold(`Processing batch of ${songsToProcess.length} songs`),
        )

        let lastProcessedId = startId
        for (let i = 0; i < songsToProcess.length; i++) {
            const song = songsToProcess[i]
            lastProcessedId = song.id
            console.log(
                chalk.bold(
                    `Processing ${chalk.cyan(song.title)} by ${chalk.yellow(song.artists[0])}`,
                ),
            )
            console.log(
                chalk.dim(`Progress: ${i + 1}/${songsToProcess.length}`),
            )

            // Only fetch Last.fm artist tags
            const lastfmArtistTags = await getLastFmArtistTags(song.artists[0])

            // Combine with existing whitelisted tags
            const existingTags = new Set(
                (song.tags || [])
                    .map((tag: string) => tag.toLowerCase())
                    .filter((tag: string) =>
                        TAG_CONFIG.whitelist.includes(tag),
                    ),
            )
            for (const tag of lastfmArtistTags) existingTags.add(tag)
            const finalTags = [...existingTags].slice(
                0,
                TAG_CONFIG.maxTagsPerSong,
            )

            // Update database
            await dbClient.query('UPDATE nuts SET tags = $1 WHERE id = $2', [
                finalTags,
                song.id,
            ])
            console.log(
                chalk.green('✅ Updated tags: ') +
                    chalk.white(finalTags.join(', ')),
            )

            // Add a cooldown period every 10 songs
            if ((i + 1) % 10 === 0) {
                console.log(
                    chalk.yellow(
                        '😴 Taking a short break to respect rate limits...',
                    ),
                )
                await sleep(BATCH_COOLDOWN)
            } else {
                await sleep(LASTFM_RATE_LIMIT)
            }
        }

        if (songs.length > BATCH_SIZE) {
            console.log(
                chalk.yellow(
                    `\n⚠️ There are ${songs.length - BATCH_SIZE} songs remaining.`,
                ),
            )
            console.log(
                chalk.yellow(
                    'Run this script again with the following command to continue:',
                ),
            )
            console.log(
                chalk.cyan(`yarn update-tags-batch ${lastProcessedId + 1}`),
            )
        }
    } catch (error) {
        console.error(chalk.red('❌ Error updating tags:'), error)
    } finally {
        await dbClient.end()
    }
}

updateAllSongTags()
