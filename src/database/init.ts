import dotenv from 'dotenv'
import pkg from 'pg'
import logger from '../logger.js'
import { handleDatabaseError } from '../utils.js'

dotenv.config()

const { Client } = pkg

const isLocal = process.env.POSTGRES_HOST === 'localhost' || process.env.POSTGRES_HOST === '127.0.0.1';

export const dbClient = new Client({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.POSTGRES_PORT),
    ssl: isLocal ? false : { rejectUnauthorized: false },
})

logger.debug(`Connecting to database at ${process.env.POSTGRES_HOST}`)

dbClient
    .connect()
    .then(() => logger.info('Nutsack: found => connected.'))
    .catch((error) => {
        handleDatabaseError(error)
        process.exit(1)
    })

export const platformId = 'spotify_id'
