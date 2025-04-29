import fs from 'node:fs/promises'
import readline from 'node:readline'
import axios from 'axios'
import chalk from 'chalk'
import dotenv from 'dotenv'
import { dbClient } from '../database/init.js'
import {
    audioFeaturesToLevel,
    saneBPM,
    scaleAndRound,
    spotifytoCamelotKey,
} from '../spotify/converters.js'
import { sleep } from '../utils.js'

dotenv.config()

const WAIT_BETWEEN_API_CALLS = 1000
const STATS_FILE = '.soundstat-stats.json'
const CHECKED_FILE = '.soundstat-checked'

const query = `
    SELECT n.spotify_id, n.title, n.artists
    FROM nuts n
    WHERE n.key IS NULL
    AND n.spotify_id IS NOT NULL
`

const checkApiStats = async () => {
    try {
        const response = await axios.get(
            'https://soundstat.info/api/v1/stats',
            {
                headers: {
                    'x-api-key': process.env.SOUNDSTAT_API_KEY,
                    Accept: 'application/json',
                },
            },
        )
        const stats = response.data

        if (stats.general?.analyzed_tracks) {
            const currentTotal = stats.general.analyzed_tracks

            try {
                const previousStats = await fs.readFile(STATS_FILE, 'utf8')
                const { analyzed_tracks: previousTotal } =
                    JSON.parse(previousStats)
                const difference = currentTotal - previousTotal
                if (difference > 0) {
                    console.log(
                        chalk.blue(
                            `\nℹ Total tracks analyzed: ${currentTotal.toLocaleString()} (+${difference.toLocaleString()})\n`,
                        ),
                    )
                } else {
                    console.log(
                        chalk.blue(
                            `\nℹ Total tracks analyzed: ${currentTotal.toLocaleString()}\n`,
                        ),
                    )
                }
            } catch (error) {
                console.log(
                    chalk.blue(
                        `\nℹ Total tracks analyzed: ${currentTotal.toLocaleString()}\n`,
                    ),
                )
            }

            await fs.writeFile(
                STATS_FILE,
                JSON.stringify({ analyzed_tracks: currentTotal }),
            )
        }
        return true
    } catch (error: unknown) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            error.response &&
            typeof error.response === 'object' &&
            'status' in error.response
        ) {
            // error is likely AxiosError or similar
            console.error(
                chalk.red('❌ Failed to get API stats:'),
                (error as { response: { status: string | number } }).response
                    .status,
            )
        } else {
            console.error(
                chalk.red('❌ Failed to get API stats:'),
                error instanceof Error ? error.message : String(error),
            )
        }
        return false
    }
}

const clearScreen = () => {
    process.stdout.write('\x1Bc')
}

const createPrompt = () => {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
}

const askQuestion = async (
    rl: readline.Interface,
    question: string,
): Promise<string> => {
    return new Promise((resolve) => rl.question(question, resolve))
}

interface TunebatData {
    key: string
    bpm: number
}

interface AudioFeatures {
    key: string
    bpm: number
    level: number
    instrumentalness: number
    danceability: number
    energy: number
    liveness: number
    loudness: number
    valence: number
    time_signature: number
    roboticness: number
}

const getManualTunebatData = async (
    title: string,
    artists: string,
    rl: readline.Interface,
): Promise<TunebatData | null> => {
    const url = `https://tunebat.com/Search?q=${encodeURIComponent(`${title} ${artists}`)}`
    console.log(chalk.blue(`\nPlease check: ${url}`))

    const bpmStr = await askQuestion(
        rl,
        chalk.cyan('Enter the BPM (or press enter to skip): '),
    )
    if (!bpmStr) return null

    const bpm = Number.parseInt(bpmStr)
    if (Number.isNaN(bpm)) {
        console.log(chalk.red('Invalid BPM value'))
        return null
    }
    const key = await askQuestion(
        rl,
        chalk.cyan('\nEnter the key (or press enter to skip): '),
    )
    if (!key) return null

    return { key, bpm }
}

const getSpotifyFeatures = async (
    spotify_id: string,
): Promise<AudioFeatures> => {
    const response = await axios.get(
        `${process.env.AUDIO_FEATURES_URL}/${spotify_id}`,
        {
            headers: {
                'x-api-key': process.env.SOUNDSTAT_API_KEY,
                Accept: 'application/json',
            },
        },
    )

    if (!response.data.features) {
        console.log(`${spotify_id}: ${response.data.detail}`)
        throw new Error('missing features key')
    }

    const features = response.data.features

    return {
        key: spotifytoCamelotKey(features.key, features.mode),
        bpm: saneBPM(features.tempo),
        level: audioFeaturesToLevel(features),
        instrumentalness: scaleAndRound(features.instrumentalness),
        danceability: scaleAndRound(features.danceability),
        energy: scaleAndRound(features.energy),
        liveness: features.liveness || 0,
        loudness: scaleAndRound(features.loudness),
        valence: scaleAndRound(features.valence),
        time_signature: features.time_signature || 4,
        roboticness: 2,
    }
}

const updateTrackFeatures = async (
    spotify_id: string,
    features: AudioFeatures | TunebatData,
) => {
    const isFullFeatures = 'level' in features
    const query = isFullFeatures
        ? `UPDATE nuts 
           SET key = $1, bpm = $2, level = $3, 
               instrumentalness = $4, danceability = $5, 
               energy = $6, liveness = $7, loudness = $8,
               valence = $9, time_signature = $10, roboticness = $11
           WHERE spotify_id = $12`
        : 'UPDATE nuts SET key = $1, bpm = $2 WHERE spotify_id = $3'

    const values = isFullFeatures
        ? [
              features.key,
              features.bpm,
              features.level,
              features.instrumentalness,
              features.danceability,
              features.energy,
              features.liveness,
              features.loudness,
              features.valence,
              features.time_signature,
              features.roboticness,
              spotify_id,
          ]
        : [features.key, features.bpm, spotify_id]

    await dbClient.query(query, values)
}

const populateAudioFeatures = async () => {
    clearScreen()
    try {
        if (!process.env.SOUNDSTAT_API_KEY) {
            console.error(
                chalk.red(
                    '❌ SOUNDSTAT_API_KEY not found in environment variables',
                ),
            )
            process.exit(1)
        }
        console.log(chalk.green('✓ API Key found'))

        await checkApiStats()

        const { rows } = await dbClient.query(query)
        console.log(chalk.blue(`\n🎵 Found ${rows.length} tracks to process\n`))

        let successCount = 0
        let notFoundCount = 0
        let errorCount = 0

        const rl = createPrompt()
        let toProcess = rows
        try {
            const checkedData = await fs.readFile(CHECKED_FILE, 'utf8')
            const checkedIds = checkedData.split('\n').filter(Boolean)
            if (checkedIds.length) {
                const skipAns = await askQuestion(
                    rl,
                    chalk.cyan(
                        `\nSkip ${checkedIds.length} already-checked IDs? (y/n): `,
                    ),
                )
                if (skipAns.toLowerCase() === 'y') {
                    toProcess = rows.filter(
                        (r) => !checkedIds.includes(r.spotify_id),
                    )
                    console.log(
                        chalk.blue(
                            `\n🎵 Processing ${toProcess.length} tracks after skipping\n`,
                        ),
                    )
                }
            }
        } catch (e) {
            // ignore if no checked file
        }

        for (const record of toProcess) {
            const spotify_id = record.spotify_id
            const trackInfo = `${record.title} by ${record.artists}`
            try {
                const features = await getSpotifyFeatures(spotify_id)
                await updateTrackFeatures(spotify_id, features)
                process.stdout.write(chalk.green('✓'))
                successCount++
            } catch (error: unknown) {
                if (
                    typeof error === 'object' &&
                    error !== null &&
                    'response' in error &&
                    error.response &&
                    typeof error.response === 'object' &&
                    'status' in error.response &&
                    (error as { response: { status: number } }).response
                        .status === 404
                ) {
                    process.stdout.write(
                        chalk.yellow('\nTrack not found in API'),
                    )
                }

                // check and update checked IDs file
                let alreadyChecked = false
                try {
                    const checkedData = await fs.readFile(CHECKED_FILE, 'utf8')
                    const checkedIds = checkedData.split('\n').filter(Boolean)
                    if (checkedIds.includes(spotify_id)) {
                        alreadyChecked = true
                    }
                } catch (e) {
                    // ignore if file does not exist
                }

                if (!alreadyChecked) {
                    await fs.appendFile(CHECKED_FILE, `${spotify_id}\n`)
                    process.stdout.write(chalk.red('x'))
                    notFoundCount++
                } else {
                    const useTunebat = await askQuestion(
                        rl,
                        chalk.cyan(
                            `\nLook up "${trackInfo}" on Tunebat? (y/n): `,
                        ),
                    )
                    if (useTunebat.toLowerCase() === 'y') {
                        process.stdout.write(
                            chalk.yellow('\nTrying Tunebat... '),
                        )
                        const tunebatData = await getManualTunebatData(
                            record.title,
                            record.artists,
                            rl,
                        )
                        if (tunebatData) {
                            await updateTrackFeatures(spotify_id, tunebatData)
                            process.stdout.write(chalk.green('✓'))
                            successCount++
                        } else {
                            process.stdout.write(chalk.red('x'))
                            console.log(
                                `\nNo data entered for: ${chalk.cyan(trackInfo)}`,
                            )
                            notFoundCount++
                        }
                    } else {
                        process.stdout.write(chalk.red('x'))
                        notFoundCount++
                    }
                }
                errorCount++
            }

            // Add a newline every 50 tracks for readability
            if ((toProcess.indexOf(record) + 1) % 50 === 0) {
                process.stdout.write('\n')
            }

            await sleep(WAIT_BETWEEN_API_CALLS)
        }

        rl.close()

        console.log('\n\nSummary:')
        console.log(`Successes: ${successCount}`)
        console.log(`Not Found: ${notFoundCount}`)
        console.log(`Errors: ${errorCount}`)
        console.log('\nDone!')
    } catch (error: unknown) {
        if (
            typeof error === 'object' &&
            error !== null &&
            'response' in error &&
            error.response &&
            typeof error.response === 'object' &&
            'data' in error.response
        ) {
            console.log(
                chalk.red('\n❌ Error:'),
                (error as { response: { data: unknown } }).response.data,
            )
        } else {
            console.log(
                chalk.red('\n❌ Error:'),
                error instanceof Error ? error.message : String(error),
            )
        }
    } finally {
        process.exit(0)
    }
}

populateAudioFeatures()
