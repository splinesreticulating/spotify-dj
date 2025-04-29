import readline from 'node:readline'
import dotenv from 'dotenv'
import open from 'open'
import {
    likedSongAdditions,
    likedSongDeletions,
    saveLikedSongs,
} from '../database/nuts.js'
import { generateAuthUrl, getLikedSongs, getToken } from '../spotify/api.js'
import type { SpotifyError } from '../types.js'

dotenv.config()

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})

const askQuestion = (query: string): Promise<string> =>
    new Promise((resolve) => rl.question(query, (answer) => resolve(answer)))

const authenticateSpotify = async () => {
    const authUrl = generateAuthUrl()
    console.log(`Please log in to Spotify here: ${authUrl}`)
    await open(authUrl)

    const code = (
        await askQuestion('Enter the code from the redirect URL: ')
    ).trim()
    if (!code) {
        console.error('No authorization code provided.')
        process.exit(1)
    }

    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI ?? '',
    })

    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
        'base64',
    )

    try {
        const { data } = await getToken(authHeader, params.toString())

        return data.access_token
    } catch (error) {
        const spotifyError = error as SpotifyError
        console.error(
            'Error during token request:',
            spotifyError.response?.data || spotifyError.message,
        )

        throw new Error('Failed to authenticate with Spotify.')
    }
}

const promptUser = async (
    message: string,
    options: string[] = ['yes', 'no'],
): Promise<string> => {
    console.log(message)
    console.log(`Options: ${options.join(' / ')}`)
    const answer = await askQuestion('Your choice: ')

    if (!options.includes(answer.toLowerCase())) {
        console.log(
            `Invalid option. Please choose one of the following: ${options.join(', ')}`,
        )
        return promptUser(message, options) // Recursively ask again
    }

    return answer.toLowerCase()
}

const refreshAllLikes = async () => {
    const accessToken = await authenticateSpotify()

    // Fetch all liked songs from Spotify
    const spotifySongs = await getLikedSongs(accessToken)
    const spotifyIds = spotifySongs.map((song) => song.spotifyId)

    // Find songs to add and delete
    const songsToAddIds = await likedSongAdditions(spotifyIds)
    const songsToDelete = await likedSongDeletions(spotifyIds)

    // Filter Spotify songs for ones to add
    const songsToAdd = spotifySongs.filter((song) =>
        songsToAddIds.includes(song.spotifyId),
    )

    if (songsToAdd.length > 0) {
        console.log(`Found ${songsToAdd.length} songs to add:`)
        const { inserted, skipped } = await saveLikedSongs(songsToAdd)

        console.log(`Successfully added ${inserted.length} songs:`)
        for (const song of inserted) {
            console.log(`- ${song.title} by ${song.artists.join(', ')}`)
        }

        if (skipped.length > 0) {
            console.log(`\nSkipped ${skipped.length} duplicate songs:`)
            for (const song of skipped) {
                console.log(`- ${song.title} by ${song.artists.join(', ')}`)
            }
        }
    }

    // Handle deletions as before...
    if (songsToDelete.length > 0) {
        console.log('\nFound songs to delete:')
        function isSongWithArtists(
            song: unknown,
        ): song is { title: string; artists: string[] } {
            return (
                typeof song === 'object' &&
                song !== null &&
                'title' in song &&
                'artists' in song &&
                Array.isArray((song as { artists?: unknown }).artists)
            )
        }

        for (const song of songsToDelete) {
            if (isSongWithArtists(song)) {
                const { title, artists } = song
                console.log(`- ${title} by ${artists.join(', ')}`)
            } else {
                console.log('- [Unknown song object]', song)
            }
        }

        const answer = await promptUser(
            'Do you want to proceed with deleting these songs?',
            ['yes', 'no'],
        )

        if (answer === 'yes') {
            const songIdsToDelete = songsToDelete
                .map((song) =>
                    typeof song === 'object' &&
                    song !== null &&
                    'spotify_id' in song
                        ? (song as { spotify_id: string | null }).spotify_id
                        : null,
                )
                .filter((id): id is string => id !== null)
            console.log(
                `Would have deleted ${songIdsToDelete.length} songs from the database.`,
            )
        } else {
            console.log('Deletion cancelled by the user.')
        }
    }
}

const main = async () => {
    try {
        await refreshAllLikes()
    } catch (error) {
        console.error(
            `Failed to refresh liked songs: ${(error as SpotifyError).message}`,
        )
    } finally {
        rl.close()
        process.exit(0)
    }
}

main()
