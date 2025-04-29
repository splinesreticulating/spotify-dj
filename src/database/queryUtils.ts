/**
 * Converts a SQL query with named parameters into a query with positional placeholders.
 * PostgreSQL's native client (`pg`) does not support named parameters, but using named parameters
 * in the codebase improves readability and reduces error-prone positional mapping.
 *
 * @param sql - The SQL query string with named parameters (e.g., ":paramName").
 * @param params - An object where keys are parameter names, and values are the parameter values.
 * @returns An object with the processed SQL query (using positional placeholders) and an array of values.
 */
export const processNamedParameters = (
    sql: string,
    params: Record<string, unknown>,
): { sql: string; values: unknown[] } => {
    const values: unknown[] = [] // Collect values in the correct order
    // Replace named parameters (e.g., ":level") with positional placeholders (e.g., "$1")
    const processedSql = sql.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
        if (!(key in params)) {
            throw new Error(`Missing parameter: ${key}`) // Ensure all parameters are provided
        }
        values.push(params[key]) // Add the parameter value to the array
        return `$${values.length}` // Replace ":paramName" with "$index"
    })
    return { sql: processedSql, values } // Return processed SQL and parameter array
}
