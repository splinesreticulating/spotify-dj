import readline from 'node:readline'
import dotenv from 'dotenv'
import open from 'open'
import { saveLikedSongs } from '../database/nuts.js'
import { generateAuthUrl, getLikedSongs, getToken } from '../spotify/api.js'

dotenv.config()

const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI } = process.env

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
})
const ask = (query: string) =>
    new Promise<string>((resolve) => rl.question(query, resolve))

async function authenticate() {
    const authUrl = generateAuthUrl()
    await open(authUrl)

    const code = await ask('Enter the code from the redirect URL: ')
    const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: code.trim(),
        redirect_uri: REDIRECT_URI ?? '',
    })

    const authHeader = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
        'base64',
    )
    const { data } = await getToken(authHeader, params.toString())
    return data.access_token
}

async function main() {
    try {
        const accessToken = await authenticate()
        const songs = []
        let offset = 0

        // Fetch songs until we hit one we already have
        while (true) {
            const batch = await getLikedSongs(accessToken, 50, offset)
            if (!batch.length) break

            // Check if any song in this batch exists in our database
            const { inserted, skipped } = await saveLikedSongs(batch)
            songs.push(...inserted)

            // As soon as a song is skipped, we've hit our existing library
            if (skipped.length > 0) break

            offset += 50
        }

        if (songs.length === 0) {
            console.log('No new liked songs found')
            return
        }

        console.log(`Added ${songs.length} new songs`)
    } catch (error) {
        console.error(error instanceof Error ? error.message : error)
    } finally {
        rl.close()
        process.exit(0)
    }
}

main()
