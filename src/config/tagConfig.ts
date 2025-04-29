// Genre aliases for standardization
const GENRE_ALIASES: { [key: string]: string[] } = {
    'hip hop': ['hiphop', 'hip-hop', 'rap', 'west coast rap'],
    rnb: ['r&b', 'rhythm and blues', 'randb'],
    electronic: ['electronica', 'electronic music', 'electro'],
    'drum and bass': ['dnb', 'd&b', 'drum n bass', 'drum & bass'],
    house: ['deep house', 'tech house', 'progressive house'],
    metal: ['heavy metal', 'metal music'],
    classical: ['classic', 'classical music'],
    'indie rock': [
        'indie music',
        'indie pop',
        'indie',
        'indierock',
        'independent',
    ],
    folk: ['folk music', 'traditional'],
    synthpop: ['synth pop', 'synth-pop'],
    'rock and roll': ['rock n roll', 'rock & roll', "rock'n'roll"],
    'post rock': ['post-rock'],
    ambient: ['atmospheric', 'ambience'],
    'female vocalist': ['female singers', 'female vocalists'],
    'male vocalist': ['male singers', 'male vocalists'],
    shoegaze: ['shoegazer', 'shoegazing'],
    british: ['uk', 'english'],
    jazz: ['latin jazz', 'jazz fusion', 'jazz funk', 'jazz rock'],
    happy: ['joy', 'perfect pop', 'happy pop', 'happy songs', 'happy music'],
    christmas: ['christmas songs', 'christmas music', 'christmas carols'],
    alternative: ['alternative rock', 'alternative music'],
}

export const TAG_CONFIG = {
    // Tags to preserve when updating from external sources
    whitelist: ['christmas', 'start', 'end', 'summer'],

    // Tags to exclude from Last.fm
    blacklist: [
        'pet shop boys',
        'art',
        'buzzcocks',
        'artist',
        'fabulous',
        'music',
        'soundtrack',
        'titles with parentheses',
        'place song',
        're-re-re-re-re-mixed songs',
        '2010s',
        '2016',
        'ladytron',
        'remix',
        'letterman',
        'fallon',
        'my melodies',
        'secretly canadian',
        'best of 2014',
        '80s',
        '90s',
        'itunes',
        'seen live',
        'favorites',
        'favourite',
        'favorite',
        'spotify',
        'under 2000 listeners',
        'albums i own',
        'beautiful',
        'awesome',
        'love at first listen',
        'best',
    ],

    // Minimum tag count on Last.fm to consider the tag valid
    minTagCount: 100,

    // Delay between Last.fm API calls (in milliseconds)
    apiDelay: 2000,

    // Maximum tags to store per song
    maxTagsPerSong: 10,
}

// Helper function to standardize a tag based on aliases
export const standardizeTag = (tag: string): string => {
    const lowercaseTag = tag.toLowerCase()

    // Check if this tag is an alias for any primary genre
    for (const [primaryGenre, aliases] of Object.entries(GENRE_ALIASES)) {
        if (aliases.includes(lowercaseTag) || lowercaseTag === primaryGenre) {
            return primaryGenre
        }
    }

    // If no alias found, return the lowercase version of the original tag
    return lowercaseTag
}
