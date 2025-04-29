import logger from '../logger.js'
import type { SpotifyAddedTrack, SpotifyLikedSong } from '../types.js'

export const spotifytoCamelotKey = (key: number, mode: number): string => {
    const camelotMap: { [key: number]: { major: string; minor: string } } = {
        0: { major: '8B', minor: '8A' },
        1: { major: '3B', minor: '3A' },
        2: { major: '10B', minor: '10A' },
        3: { major: '5B', minor: '5A' },
        4: { major: '12B', minor: '12A' },
        5: { major: '7B', minor: '7A' },
        6: { major: '2B', minor: '2A' },
        7: { major: '9B', minor: '9A' },
        8: { major: '4B', minor: '4A' },
        9: { major: '11B', minor: '11A' },
        10: { major: '6B', minor: '6A' },
        11: { major: '1B', minor: '1A' },
    }

    // Check if key is in range and mode is either 0 or 1
    if (key < 0 || key > 11 || (mode !== 0 && mode !== 1)) {
        logger.error(
            'Invalid key component(s) -- returning default key',
            key,
            mode,
        )
        return '6A' // Invalid key or mode
    }

    // Select major or minor based on the mode
    return mode === 1 ? camelotMap[key].major : camelotMap[key].minor
}

export const likedSongToDbRecord = (
    items: SpotifyAddedTrack[],
): SpotifyLikedSong[] =>
    items.map((item) => {
        const track = item.track
        return {
            spotifyId: track.id,
            title: track.name,
            artists: track.artists.map((artist) => artist.name),
            album: track.album.name,
            year: new Date(track.album.release_date).getFullYear(),
            imageUrls: track.album.images.map((img) => img.url),
            duration: track.duration_ms,
            explicit: track.explicit,
            dateLiked: item.added_at,
        }
    })

export const audioFeaturesToLevel = (features: {
    energy: number
    tempo: number
    valence: number
    danceability: number
}): number => {
    const { energy, tempo, valence, danceability } = features

    const levels = [
        { level: 1, condition: energy <= 0.25 && danceability <= 0.25 },
        {
            level: 2,
            condition: energy <= 0.45 && valence <= 0.4 && danceability <= 0.5,
        },
        {
            level: 3,
            condition:
                energy > 0.25 &&
                energy <= 0.6 &&
                valence > 0.35 &&
                valence <= 0.65 &&
                danceability <= 0.75,
        },
        {
            level: 4,
            condition:
                energy > 0.6 &&
                valence <= 0.7 &&
                tempo > 100 &&
                danceability <= 0.85,
        },
        {
            level: 5,
            condition: energy > 0.6 && valence > 0.7 && danceability > 0.7,
        },
    ]

    for (const { level, condition } of levels) {
        if (condition) return level
    }

    return 3 // Default level
}

export const scaleAndRound = (feature: number): number =>
    Math.round(feature * 100)

export const saneBPM = (tempo: number): number => {
    const adjusted = Math.round(tempo)
    if (adjusted <= 0) return 30
    if (adjusted < 30) return adjusted * 2
    if (adjusted > 200) return Math.round(adjusted / 2)
    return adjusted
}
