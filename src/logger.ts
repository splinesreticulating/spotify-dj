import dotenv from 'dotenv'
import winston from 'winston'
import WinstonCloudWatch from 'winston-cloudwatch'

dotenv.config()

const { combine, timestamp, colorize, printf } = winston.format

const consoleFormat = printf(({ level, message, timestamp }) => {
    const cyanMessage = `\x1b[36m${message}\x1b[0m`
    return `${timestamp} [${level}]: ${cyanMessage}`
})

const consoleTransport = new winston.transports.Console({
    format: combine(colorize(), timestamp(), consoleFormat),
})

const cloudWatchTransport = new WinstonCloudWatch({
    logGroupName: process.env.AWS_LOG_GROUP_NAME || 'butterfly',
    logStreamName: process.env.AWS_LOG_STREAM_NAME || 'local-machine',
    awsRegion: process.env.AWS_REGION || 'us-west-2',
})

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.json(),
    transports: [consoleTransport, cloudWatchTransport],
})

export default logger
