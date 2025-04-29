import readline from 'node:readline'
import axios from 'axios'
import chalk from 'chalk'
import dotenv from 'dotenv'
import { TAG_CONFIG, standardizeTag } from '../config/tagConfig.js'
import { dbClient } from '../database/init.js'

dotenv.config()

const LASTFM_API_KEY = process.env.LASTFM_API_KEY
const APP_CONTACT = process.env.APP_CONTACT || 'your-email@example.com'

const MB_RATE_LIMIT = 1100 // MusicBrainz requires 1 second between requests, adding 100ms buffer
const LASTFM_RATE_LIMIT = 250 // Last.fm allows 5 requests per second, being conservative
const MB_MIN_TAG_COUNT = 1 // MusicBrainz specific threshold
const LASTFM_MIN_TAG_COUNT = 50 // Keep original threshold for Last.fm

const DISCOGS_TOKEN = process.env.DISCOGS_TOKEN
const DISCOGS_RATE_LIMIT = 1000 // Discogs allows 60 requests per minute

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

interface MusicBrainzTag {
    name: string
    count: number
}

interface DiscogsRelease {
    style?: string[]
    genre?: string[]
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

const promptUser = (question: string): Promise<string> => {
    return new Promise((resolve) => rl.question(question, resolve))
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

async function fetchMusicBrainz(
    endpoint: string,
    query: string,
): Promise<string[]> {
    try {
        await sleep(MB_RATE_LIMIT)
        const searchResponse = await axios.get(
            `https://musicbrainz.org/ws/2/${endpoint}`,
            {
                params: { query, fmt: 'json' },
                headers: { 'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )` },
            },
        )

        const id = searchResponse.data[`${endpoint}s`]?.[0]?.id
        if (!id) return []

        await sleep(MB_RATE_LIMIT)
        const response = await axios.get(
            `https://musicbrainz.org/ws/2/${endpoint}/${id}`,
            {
                params: { inc: 'tags+genres', fmt: 'json' },
                headers: { 'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )` },
            },
        )

        const tagSet = new Set([
            ...(response.data.tags || [])
                .filter((t: MusicBrainzTag) => t.count >= MB_MIN_TAG_COUNT)
                .map((t: MusicBrainzTag) => t.name),
            ...(response.data.genres || [])
                .filter((g: MusicBrainzTag) => g.count >= MB_MIN_TAG_COUNT)
                .map((g: MusicBrainzTag) => g.name),
        ])

        return [...tagSet]
            .filter((tag) => !TAG_CONFIG.blacklist.includes(tag.toLowerCase()))
            .map((tag) => standardizeTag(tag))
    } catch (error) {
        console.error(
            chalk.red(`❌ MusicBrainz API error for ${endpoint}:`),
            error,
        )
        return []
    }
}

async function fetchDiscogs(artist: string, title?: string): Promise<string[]> {
    try {
        await sleep(DISCOGS_RATE_LIMIT)
        const searchResponse = await axios.get(
            'https://api.discogs.com/database/search',
            {
                params: {
                    q: artist,
                    token: DISCOGS_TOKEN,
                    type: title ? 'master' : 'artist',
                },
                headers: {
                    'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )`,
                },
            },
        )

        if (!searchResponse.data.results?.[0]?.id) {
            console.log(
                chalk.yellow(
                    `⚠️  No Discogs ${title ? 'track' : 'artist'} found for: ${artist}`,
                ),
            )
            return []
        }

        await sleep(DISCOGS_RATE_LIMIT)

        if (title) {
            // For tracks, continue with master release lookup
            const response = await axios.get(
                `https://api.discogs.com/masters/${searchResponse.data.results[0].id}`,
                {
                    params: { token: DISCOGS_TOKEN },
                    headers: {
                        'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )`,
                    },
                },
            )

            const tagSet = new Set([
                ...(response.data.styles || []),
                ...(response.data.genres || []),
            ])
            return [...tagSet]
                .filter(
                    (tag): tag is string =>
                        typeof tag === 'string' &&
                        !TAG_CONFIG.blacklist.includes(tag.toLowerCase()),
                )
                .map((tag) => standardizeTag(tag))
        }
        // For artists, get their main releases
        const artistId = searchResponse.data.results[0].id
        const releasesResponse = await axios.get(
            `https://api.discogs.com/artists/${artistId}/releases`,
            {
                params: {
                    token: DISCOGS_TOKEN,
                    sort: 'year',
                    sort_order: 'desc',
                },
                headers: {
                    'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )`,
                },
            },
        )

        const tagSet = new Set<string>()
        for (const release of releasesResponse.data.releases.slice(0, 3)) {
            if (release.type === 'master') {
                await sleep(DISCOGS_RATE_LIMIT)
                const masterResponse = await axios.get(
                    `https://api.discogs.com/masters/${release.id}`,
                    {
                        params: { token: DISCOGS_TOKEN },
                        headers: {
                            'User-Agent': `Butterfly/1.0.0 ( ${APP_CONTACT} )`,
                        },
                    },
                )
                if (masterResponse.data.styles) {
                    for (const s of masterResponse.data.styles) tagSet.add(s)
                }
                if (masterResponse.data.genres) {
                    for (const g of masterResponse.data.genres) tagSet.add(g)
                }
            }
        }
        return [...tagSet]
            .filter((tag) => !TAG_CONFIG.blacklist.includes(tag.toLowerCase()))
            .map((tag) => standardizeTag(tag))
    } catch (error) {
        console.error(chalk.red('❌ Discogs API error:'), error)
        return []
    }
}

const getLastFmTags = (artist: string, title: string) =>
    fetchLastFm('track.getTopTags', { artist, track: title })
const getLastFmArtistTags = (artist: string) =>
    fetchLastFm('artist.getTopTags', { artist })
const getMusicBrainzTags = (artist: string, title: string) =>
    fetchMusicBrainz('recording', `artist:${artist} AND recording:${title}`)
const getMusicBrainzArtistTags = (artist: string) =>
    fetchMusicBrainz('artist', artist)
const getDiscogsTrackTags = (artist: string, title: string) =>
    fetchDiscogs(artist, title)
const getDiscogsArtistTags = (artist: string) => fetchDiscogs(artist)

async function getAllSongsNeedingTags(): Promise<Song[]> {
    const { rows } = await dbClient.query(
        `
        SELECT id, title, artists, tags
        FROM nuts
        WHERE tags IS NULL OR array_length(tags, 1) < $1
        ORDER BY id
    `,
        [TAG_CONFIG.maxTagsPerSong],
    )

    return rows
}

async function updateAllSongTags() {
    if (!LASTFM_API_KEY) {
        console.error('LASTFM_API_KEY not found in environment variables')
        process.exit(1)
    }

    try {
        const songs = await getAllSongsNeedingTags()
        if (songs.length === 0) {
            console.log('No songs found that need tag updates')
            process.exit(0)
        }

        console.log(
            chalk.bold(`Found ${songs.length} songs that need tag updates`),
        )

        for (const song of songs) {
            console.clear()
            console.log(
                chalk.bold(
                    `Processing ${chalk.cyan(song.title)} by ${chalk.yellow(song.artists[0])}`,
                ),
            )
            console.log(
                chalk.dim(
                    `Progress: ${songs.indexOf(song) + 1}/${songs.length}`,
                ),
            )

            // Fetch all tags in parallel
            const [
                lastfmArtistTags,
                musicbrainzArtistTags,
                discogsArtistTags,
                lastfmTrackTags,
                musicbrainzTrackTags,
                discogsTrackTags,
            ] = await Promise.all([
                getLastFmArtistTags(song.artists[0]),
                getMusicBrainzArtistTags(song.artists[0]),
                getDiscogsArtistTags(song.artists[0]),
                getLastFmTags(song.artists[0], song.title),
                getMusicBrainzTags(song.artists[0], song.title),
                getDiscogsTrackTags(song.artists[0], song.title),
            ])

            // Display results with colors
            console.log(
                chalk.bold(
                    `\n🎵 Tags for ${chalk.cyan(song.title)} by ${chalk.yellow(song.artists[0])}:`,
                ),
            )
            console.log(
                chalk.dim(
                    `�� Edit URL: ${chalk.underline(`http://soundwave:2309/dashboard/songs/${song.id}/edit`)}`,
                ),
            )
            console.log(
                chalk.dim(
                    `📌 Current tags: ${song.tags?.length ? chalk.white(song.tags.join(', ')) : chalk.gray('none')}`,
                ),
            )

            console.log(chalk.bold('\n👤 Artist tags:'))
            console.log(
                `${chalk.blue('1.')} Last.fm: ${
                    lastfmArtistTags.length
                        ? chalk.white(lastfmArtistTags.join(', '))
                        : chalk.gray('none')
                }`,
            )
            console.log(
                `${chalk.blue('2.')} MusicBrainz: ${
                    musicbrainzArtistTags.length
                        ? chalk.white(musicbrainzArtistTags.join(', '))
                        : chalk.gray('none')
                }`,
            )
            console.log(
                `${chalk.blue('3.')} Discogs: ${
                    discogsArtistTags.length
                        ? chalk.white(discogsArtistTags.join(', '))
                        : chalk.gray('none')
                }`,
            )

            console.log(chalk.bold('\n💿 Track tags:'))
            console.log(
                `${chalk.blue('4.')} Last.fm: ${
                    lastfmTrackTags.length
                        ? chalk.white(lastfmTrackTags.join(', '))
                        : chalk.gray('none')
                }`,
            )
            console.log(
                `${chalk.blue('5.')} MusicBrainz: ${
                    musicbrainzTrackTags.length
                        ? chalk.white(musicbrainzTrackTags.join(', '))
                        : chalk.gray('none')
                }`,
            )
            console.log(
                `${chalk.blue('6.')} Discogs: ${
                    discogsTrackTags.length
                        ? chalk.white(discogsTrackTags.join(', '))
                        : chalk.gray('none')
                }`,
            )

            const answer = await promptUser(
                chalk.bold('\n📝 Apply which tag groups? ') +
                    chalk.blue(
                        '(Enter numbers separated by spaces, "skip", or "exit"): ',
                    ),
            )

            if (answer.toLowerCase() === 'exit') {
                console.log(chalk.yellow('\n⚠️  Exiting script'))
                return
            }

            if (answer.toLowerCase() === 'skip') {
                console.log(chalk.yellow('\n⚠️  Skipping this song'))
                continue
            }

            // Process selected tags
            const selections = answer.split(' ').map(Number)
            const tagSources = [
                lastfmArtistTags,
                musicbrainzArtistTags,
                discogsArtistTags,
                lastfmTrackTags,
                musicbrainzTrackTags,
                discogsTrackTags,
            ]
            const selectedTags = selections
                .filter((n) => n >= 1 && n <= 6)
                .flatMap((n) => tagSources[n - 1])

            if (selectedTags.length === 0) {
                console.log('No tags applied')
                continue
            }

            // Combine with existing whitelisted tags
            const existingTags = new Set(
                (song.tags || [])
                    .map((tag: string) => tag.toLowerCase())
                    .filter((tag: string) =>
                        TAG_CONFIG.whitelist.includes(tag),
                    ),
            )
            for (const tag of selectedTags) existingTags.add(tag)
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
                chalk.green('\n✅ Updated tags: ') +
                    chalk.white(finalTags.join(', ')),
            )

            // Add a small delay before processing the next song
            await sleep(1000)
        }
    } catch (error) {
        console.error(chalk.red('\n❌ Error updating tags:'), error)
    } finally {
        rl.close()
        await dbClient.end()
    }
}

// Run the script
updateAllSongTags()
