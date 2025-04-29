import { Chalk } from 'chalk'
import logger from './logger.js'
import type { NowPlayingSong } from './types.js'

const chalk = new Chalk({ level: 2 }) // 256 colors

const camelotKeyCompatibilityMap: { [key: string]: string[] } = {
    '1A': ['1A', '1B', '12A', '2A', '3A', '12B', '8A', '4B'],
    '1B': ['1B', '1A', '12B', '2B', '3B', '12A', '8B', '4A'],
    '2A': ['2A', '2B', '1A', '3A', '4A', '1B', '9A', '5B'],
    '2B': ['2B', '2A', '1B', '3B', '4B', '1A', '9B', '5A'],
    '3A': ['3A', '3B', '2A', '4A', '5A', '2B', '10A', '6B'],
    '3B': ['3B', '3A', '2B', '4B', '5B', '2A', '10B', '6A'],
    '4A': ['4A', '4B', '3A', '5A', '6A', '3B', '11A', '7B'],
    '4B': ['4B', '4A', '3B', '5B', '6B', '3A', '11B', '7A'],
    '5A': ['5A', '5B', '4A', '6A', '7A', '4B', '12A', '8B'],
    '5B': ['5B', '5A', '4B', '6B', '7B', '4A', '12B', '8A'],
    '6A': ['6A', '6B', '5A', '7A', '8A', '5B', '1A', '9B'],
    '6B': ['6B', '6A', '5B', '7B', '8B', '5A', '1B', '9A'],
    '7A': ['7A', '7B', '6A', '8A', '9A', '6B', '2A', '10B'],
    '7B': ['7B', '7A', '6B', '8B', '9B', '6A', '2B', '10A'],
    '8A': ['8A', '8B', '7A', '9A', '10A', '7B', '3A', '11B'],
    '8B': ['8B', '8A', '7B', '9B', '10B', '7A', '3B', '11A'],
    '9A': ['9A', '9B', '8A', '10A', '11A', '8B', '4A', '12B'],
    '9B': ['9B', '9A', '8B', '10B', '11B', '8A', '4B', '12A'],
    '10A': ['10A', '10B', '9A', '11A', '12A', '9B', '5A', '1B'],
    '10B': ['10B', '10A', '9B', '11B', '12B', '9A', '5B', '1A'],
    '11A': ['11A', '11B', '10A', '12A', '1A', '10B', '6A', '2B'],
    '11B': ['11B', '11A', '10B', '12B', '1B', '10A', '6B', '2A'],
    '12A': ['12A', '12B', '11A', '1A', '2A', '11B', '7A', '3B'],
    '12B': ['12B', '12A', '11B', '1B', '2B', '11A', '7B', '3A'],
}

export const getCompatibleKeys = (key: string): string[] => {
    return camelotKeyCompatibilityMap[key] || []
}

const levelCompatibilityMap: { [level: string]: string[] } = {
    '1': ['2'],
    '2': ['3', '5'],
    '3': ['2', '4'],
    '4': ['3', '5'],
    '5': ['2', '3', '4'],
}

export const getSimilarLevels = (level: number): string[] => {
    return levelCompatibilityMap[level] || []
}

export const formatInBrackets = (text: string) =>
    `${chalk.whiteBright('[')}${chalk.white(text)}${chalk.whiteBright(']')}`

export const formatNowPlaying = (nowPlaying: NowPlayingSong) => {
    const { title, year, artists, albumInfo } = nowPlaying

    return `Now Playing: ${formatInBrackets(`${title} by ${artists?.join(', ')}`)} ${
        albumInfo?.name ? `[${albumInfo.name}]` : '(unknown album)'
    } ${year ? `[${year}]` : ''}`
}

export const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms))

export const lastPlayed = (date_played: Date | null): string => {
    if (!date_played) {
        return 'never played'
    }

    const lastPlayedDate = new Date(date_played)

    const now = new Date()
    const diffInTime = now.getTime() - lastPlayedDate.getTime()
    const diffInDays = Math.floor(diffInTime / (1000 * 60 * 60 * 24))

    return diffInDays === 0
        ? 'last played today'
        : `last played ${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
}

export const getFutureTime = (delayMs: number): string =>
    new Date(Date.now() + delayMs).toLocaleTimeString().split(' ')[0]

const levenshteinDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix = Array(b.length + 1)
        .fill(null)
        .map(() => Array(a.length + 1).fill(null))

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j

    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + substitutionCost, // substitution
            )
        }
    }

    return matrix[b.length][a.length]
}

export const handleDatabaseError = (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        logger.error(
            chalk.red(
                `Database error code: ${(error as { code?: string }).code}`,
            ),
        )
    } else {
        logger.error(chalk.red('Unknown database error'))
    }
    logger.debug(error)
}

export const flipACoin = (): boolean => Math.random() < 0.5
