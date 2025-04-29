import { handleDatabaseError } from '../utils.js'
import { dbClient } from './init.js'

export const withTransaction = async <T>(
    callback: () => Promise<T>,
): Promise<T> => {
    try {
        await dbClient.query('BEGIN')
        const result = await callback()
        await dbClient.query('COMMIT')
        return result
    } catch (error) {
        await dbClient.query('ROLLBACK')
        handleDatabaseError(error)
        throw error
    }
}
