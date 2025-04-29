import dotenv from 'dotenv'
import express from 'express'
import logger from './logger.js'
import { generateAuthUrl, getToken } from './spotify/api.js'
import { monitorPlayback } from './spotify/monitorPlayback.js'
import { formatInBrackets } from './utils.js'

console.clear()
dotenv.config()

const app = express()
const { CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, SERVER_PORT } = process.env

let accessToken = ''
let refreshToken = ''

const updateAccessToken = (newToken: string) => {
    accessToken = newToken
}

// Redirect user to Spotify authorization
app.get('/login', (_req, res) => {
    res.redirect(generateAuthUrl())
})

// Handle Spotify's callback with the authorization code
app.get('/callback', async (req, res) => {
    const code = req.query.code as string

    try {
        if (!REDIRECT_URI) {
            throw new Error('REDIRECT_URI is not defined')
        }
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT_URI,
        })

        const authHeader = Buffer.from(
            `${CLIENT_ID}:${CLIENT_SECRET}`,
        ).toString('base64')

        const { data } = await getToken(authHeader, params.toString())

        // Store tokens
        accessToken = data.access_token
        refreshToken = data.refresh_token

        // Start spotify playback monitoring
        monitorPlayback(accessToken, refreshToken, updateAccessToken)
        res.send('Spotify monitoring started.')
    } catch (error) {
        res.send('Error retrieving access token')
        logger.error(error)
    }
})

app.listen(SERVER_PORT, () =>
    logger.info(
        `Go to ${formatInBrackets(
            `http://localhost:${SERVER_PORT}/login`,
        )} to start Spotify monitoring`,
    ),
)
