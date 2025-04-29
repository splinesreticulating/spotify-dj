import type { Settings } from '../types.js'
import { refreshCache } from './settingsCache.js'
import { updateSettingInDb } from './settingsDb.js'

export const updateSetting = async (
    names: Settings | Settings[],
    values: string | string[],
): Promise<void> => {
    if (Array.isArray(names)) {
        if (!Array.isArray(values) || names.length !== values.length) {
            throw new Error('Names and values arrays must have the same length')
        }
        await Promise.all(
            names.map((name, i) => updateSettingInDb(name, values[i])),
        )
    } else {
        if (Array.isArray(values)) {
            throw new Error(
                'Cannot use array of values with single setting name',
            )
        }
        await updateSettingInDb(names, values)
    }
    await refreshCache()
}
