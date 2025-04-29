import dotenv from 'dotenv'
import pkg from 'pg'
import logger from '../logger.js'
import { handleDatabaseError } from '../utils.js'

dotenv.config()

const { Client } = pkg

export const dbClient = new Client({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: Number(process.env.POSTGRES_PORT),
    ssl: {
        rejectUnauthorized: false,
    },
})

dbClient
    .connect()
    .then(() => logger.info('Nutsack: found => connected.'))
    .catch((error) => {
        handleDatabaseError(error)
        process.exit(1)
    })

export const platformId = 'spotify_id'
