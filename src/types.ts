type SpotifyTrack = {
    preview_url: string | null
    available_markets: string[]
    explicit: boolean
    type: 'track'
    episode: boolean
    track: boolean
    album: {
        available_markets: string[]
        type: 'album'
        album_type: string
        href: string
        id: string
        images: { url: string; height: number | null; width: number | null }[]
        name: string
        release_date: string
        release_date_precision: string
        uri: string
        artists: { name: string; href: string; id: string; uri: string }[]
        external_urls: { spotify: string }
        total_tracks: number
    }
    artists: SpotifyArtist[]
    disc_number: number
    track_number: number
    duration_ms: number
    external_ids: { isrc: string }
    external_urls: { spotify: string }
    href: string
    id: string
    name: string
    popularity: number
    uri: string
    is_local: boolean
    added_at?: Date
}

export type SpotifyArtist = { name: string }
type SpotifyAlbum = { name: string }

export interface SpotifyError {
    response?: {
        data: {
            error: {
                status: number
                message: string
            }
        }
    }
    message: string
}

export enum NowPlayingStatus {
    noTrack = 'noTrack',
    tokenExpired = 'tokenExpired',
    playing = 'playing',
}

export interface NowPlayingSong {
    status: NowPlayingStatus
    trackId: string
    title: string
    artists: string[]
    durationMs?: number
    progressMs?: number
    albumInfo: SpotifyAlbum
    year?: number | null
}

export type SpotifyLikedSong = {
    spotifyId: string
    title: string
    artists: string[]
    album: string
    year: number
    imageUrls: string[]
    duration: number
    explicit: boolean
    dateLiked: Date
}

type SongRecordMetaData = {
    bpm: number
    level: number
    key: string
    instrumentalness: number | null
    danceability: number
    energy: number
    liveness: number
    loudness: number
    speechiness: number
    valence: number
    time_signature: number
    roboticness: number
}

export type SongRecord = SongRecordMetaData & {
    id: number
    spotify_id?: string
    sam_id?: string
    title: string
    artists: string[]
    album: string
    date_added: Date
    date_liked: Date
    date_played: Date | null
    date_artist_played: Date | null
    date_album_played: Date | null
    date_title_played: Date | null
    image_urls: string[]
    file_path: string | null
    hours_off: number
    year: number
    tags: string[]
    duration: number
    explicit: boolean
    count_played: number
}

export type MetaDataWithId = SongRecordMetaData & {
    spotify_id?: string
    id: number
}

export type SpotifyAddedTrack = {
    added_at: Date
    track: SpotifyTrack
}

export const SpotifyUrls = {
    tracks: 'https://api.spotify.com/v1/tracks',
    authorize: 'https://accounts.spotify.com/authorize',
    token: 'https://accounts.spotify.com/api/token',
    playlists: 'https://api.spotify.com/v1/playlists',
    nowPlaying: 'https://api.spotify.com/v1/me/player/currently-playing',
    likedSongs: 'https://api.spotify.com/v1/me/tracks',
    myPlaylists: 'https://api.spotify.com/v1/me/playlists',
} as const

export enum Settings {
    playlistId = 'PLAYLIST_ID',
    levelLock = 'LEVEL_LOCK',
    retryDelay = 'RETRY_DELAY',
    bufferDelay = 'BUFFER_DELAY',
    bpmMinMultiplier = 'BPM_MIN_MULTIPLIER',
    bpmMaxMultiplier = 'BPM_MAX_MULTIPLIER',
    promiscuity = 'PROMISCUITY',
    delayAlbum = 'DELAY_ALBUM',
    delayArtist = 'DELAY_ARTIST',
    delayTitle = 'DELAY_TITLE',
    genreLock = 'GENRE_LOCK',
    roboticnessLock = 'ROBOTICNESS_LOCK',
    yearMin = 'YEAR_MIN',
    yearMax = 'YEAR_MAX',
    lastBreakTime = 'LAST_BREAK_TIME',
}

export enum Defaults {
    retryDelay = 60_000,
    bufferDelay = 15_000,
    bpmMinMultiplier = 0.96,
    bpmMaxMultiplier = 1.09,
    promiscuity = 5,
}

interface ScheduleRule {
    days: number[] // 0-6 for days of week
    start_time: string // "HH:MM"
    end_time: string // "HH:MM"
}

export interface ShowSchedule {
    id: number
    show_name: string
    rules: ScheduleRule[]
    level_lock: number
    genre_lock: string
    roboticness_lock: number
    year_min: number
    year_max: number
}
