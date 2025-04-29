import { dbClient } from './init.js'

export const fetchSettingsFromDb = async (): Promise<
    Record<string, string>
> => {
    const res = await dbClient.query('SELECT name, value FROM settings')
    type SettingsRow = { name: string; value: string }
    return res.rows.reduce((acc: Record<string, string>, row: SettingsRow) => {
        acc[row.name] = row.value
        return acc
    }, {})
}

export const updateSettingInDb = async (
    name: string,
    value: string,
): Promise<void> => {
    await dbClient.query(
        'UPDATE settings SET value = $1, updated_at = NOW() WHERE name = $2',
        [value, name],
    )
}
