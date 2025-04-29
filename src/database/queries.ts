import { platformId } from './init.js'

export const hoursOffCheck =
    '(EXTRACT(EPOCH FROM (NOW() - date_played)) / 3600 > hours_off OR date_played IS NULL)'

export const updatePlayCount = `
    UPDATE nuts
    SET date_played = NOW(),
        count_played = count_played + 1
    WHERE ${platformId} = $1
    RETURNING id
`

// Updates artist date with match in ANY array
export const updateArtistDate = `
UPDATE nuts
SET date_artist_played = NOW()
WHERE EXISTS (
    SELECT 1
    FROM UNNEST(artists) AS unnested_artist
    WHERE LOWER(unnested_artist) = LOWER($1)
)

`

// Updates title date
export const updateTitleDate = `
    UPDATE nuts
    SET date_title_played = NOW()
    WHERE LOWER(title) = LOWER($1)
`

// Updates album date with album and artist matches
export const updateAlbumDate = `
    UPDATE nuts
    SET date_album_played = NOW()
    WHERE LOWER(album) = LOWER($1)
    AND EXISTS (
        SELECT 1
        FROM UNNEST(artists) AS nut_artist
        WHERE LOWER(nut_artist) = ANY(
            SELECT LOWER(artist) FROM UNNEST($2::TEXT[]) AS artist
        )
    )
`

// Append to history table
export const insertHistory = `
    INSERT INTO history (nut_id)
    VALUES ($1)
`

// Compatibilty check wrapper
export const compatibilityCheck = (conditions: string[]) => `
    SELECT n.* FROM nuts n
    WHERE ${conditions.map((c) => c.replace(/nuts\./g, 'n.')).join(' AND ')} 
    AND n.${platformId} IS NOT NULL
    ORDER BY n.count_played ASC
    LIMIT 1
`

// Get song details
export const selectFromNuts = `
    SELECT *
    FROM nuts
    WHERE ${platformId} = $1
`

// Select unprocessed spotify songs
export const unprocessedSongs = `SELECT spotify_id
    FROM nuts
    WHERE valence IS NULL
    AND spotify_id IS NOT NULL
    LIMIT 100
`

// Delete songs with Spotify ID array
export const deleteSongs =
    'DELETE FROM nuts WHERE spotify_id IS NOT NULL AND spotify_id = ANY($1)'

// Find liked song additions
export const likedSongAdditions = `
    SELECT UNNEST($1::text[]) AS spotify_id
    EXCEPT
    SELECT spotify_id 
    FROM nuts 
    WHERE spotify_id IS NOT NULL
    AND date_liked IS NOT NULL
`

// Find liked song deletions
export const likedSongDeletions = `
    SELECT *
    FROM nuts
    WHERE spotify_id IS NOT NULL
    AND date_liked IS NOT NULL
    AND spotify_id NOT IN (SELECT UNNEST($1::text[]))
`

// Save liked songs
export const saveLikedSongs = `
    WITH insert_result AS (
        INSERT INTO nuts (
            spotify_id,
            title,
            artists,
            album,
            year,
            image_urls,
            duration,
            explicit,
            date_liked,
            level
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
        ON CONFLICT (spotify_id) 
        WHERE spotify_id IS NOT NULL
        DO NOTHING
        RETURNING spotify_id, title, artists
    )
    SELECT spotify_id, title, artists FROM insert_result
`
export const queueInternally = 'INSERT INTO queue (nut_id) VALUES ($1)'
export const getInternalQueueQuery = `SELECT q.id, q.nut_id, n.${platformId}, n.title
         FROM queue q
         JOIN nuts n ON q.nut_id = n.id
         ORDER BY q.added_at ASC`

export const dequeueInternal = `DELETE FROM queue
             WHERE id = (
                 SELECT id FROM queue
                 ORDER BY added_at ASC
                 LIMIT 1
             )
             RETURNING nut_id`

export const selectPlatformId = `SELECT ${platformId}, title FROM nuts WHERE id = $1`

export const genreLock = `
    CASE 
        WHEN :genreLock = '.*' THEN true  -- Match everything when no genre lock
        WHEN tags IS NULL OR tags = '{}' THEN false  -- Don't match null/empty tags when there's a specific lock
        ELSE EXISTS (
            SELECT 1 FROM UNNEST(tags) tag 
            WHERE tag ~* :genreLock
        )
    END
`

// Level queries
export const exactLevel = 'level = :level'
export const similarLevels = 'level = ANY(:levels)'

// BPM
export const bpmRange = 'bpm BETWEEN :bpmMin AND :bpmMax'

// Delays
export const albumDelay = `
    (date_album_played IS NULL OR 
     EXTRACT(EPOCH FROM (NOW() - date_album_played)) / 60 >= :delayAlbum)
`

export const artistDelay = `
    (date_artist_played IS NULL OR 
     EXTRACT(EPOCH FROM (NOW() - date_artist_played)) / 60 >= :delayArtist)
`

export const titleDelay = `
    (date_title_played IS NULL OR 
     EXTRACT(EPOCH FROM (NOW() - date_title_played)) / 60 >= :delayTitle)
`

// Roboticness
export const exactRoboticness = 'roboticness = :roboticness'
export const relaxedRoboticness = 'ABS(roboticness - :roboticness) <= 1'
export const roboticnessLock = `
    CASE 
        WHEN :roboticnessLock = 0 THEN true  -- Skip check when lock is 0
        ELSE roboticness = :roboticnessLock  -- Otherwise lock it down
    END
`

// Key
export const key = 'key = ANY(:compatibleKeys)'

export const compatibilityTreeQuery = `
    SELECT n.* 
    FROM nuts n
    JOIN compatibility_tree ct ON n.id = ct.branch_id
    WHERE ct.root_id = $1
    AND n.level = $2
    AND n.${platformId} IS NOT NULL
    AND (EXTRACT(EPOCH FROM (NOW() - n.date_played)) / 3600 > n.hours_off OR n.date_played IS NULL)
    AND (
        n.date_album_played IS NULL OR 
        EXTRACT(EPOCH FROM (NOW() - n.date_album_played))/60 >= $3
    )
    AND (
        n.date_artist_played IS NULL OR 
        EXTRACT(EPOCH FROM (NOW() - n.date_artist_played))/60 >= $4
    )
    AND (
        n.date_title_played IS NULL OR 
        EXTRACT(EPOCH FROM (NOW() - n.date_title_played))/60 >= $5
    )
    AND (
        CASE 
            WHEN $6 = '.*' THEN true
            WHEN tags IS NULL OR tags = '{}' THEN false
            ELSE EXISTS (
                SELECT 1 FROM UNNEST(tags) tag 
                WHERE tag ~* $6
            )
        END
    )
    AND (n.year >= $7 AND n.year <= $8)
    ORDER BY n.count_played ASC
    LIMIT 1
`

export const checkSchedule = `
    WITH matching_shows AS (
        SELECT 
            show_schedule.*,
            (rule->>'start_time')::time as start_time,
            (rule->>'end_time')::time as end_time
        FROM show_schedule, jsonb_array_elements(rules) as rule
        WHERE $1::integer = ANY(ARRAY(SELECT jsonb_array_elements_text(rule->'days')::integer))
        AND $2::time BETWEEN (rule->>'start_time')::time 
                         AND (rule->>'end_time')::time
    )
    SELECT * FROM matching_shows 
    WHERE start_time = (
        SELECT MAX(start_time)
        FROM matching_shows
    )
    LIMIT 1
`

export const hoursIntoShow = `
    WITH time_diff AS (
        SELECT 
            ROUND(
                EXTRACT(EPOCH FROM ($1::time - (rule->>'start_time')::time)) / 3600.0
            , 1)::numeric as hours_since_start
        FROM show_schedule, jsonb_array_elements(rules) as rule
        WHERE $2::integer = ANY(ARRAY(SELECT jsonb_array_elements_text(rule->'days')::integer))
        AND $1::time BETWEEN (rule->>'start_time')::time 
                     AND (rule->>'end_time')::time
        LIMIT 1
    )
    SELECT COALESCE(hours_since_start, 999::numeric) as hours_since_start 
    FROM time_diff
    UNION ALL
    SELECT 999::numeric WHERE NOT EXISTS (SELECT 1 FROM time_diff)
    LIMIT 1
`
