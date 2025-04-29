CREATE TABLE nuts (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    spotify_id CHAR(22) UNIQUE,
    sam_id INTEGER UNIQUE,
    youtube_id VARCHAR(11),
    title VARCHAR(150),
    artists TEXT[],
    album VARCHAR(150),
    bpm INTEGER CHECK (bpm BETWEEN 30 AND 200),
    level INTEGER CHECK (level BETWEEN 1 AND 5),
    key VARCHAR(3),
    date_added TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_liked TIMESTAMP,
    date_played TIMESTAMP,
    date_artist_played TIMESTAMP,
    date_album_played TIMESTAMP,
    date_title_played TIMESTAMP,
    image_urls TEXT[],
    file_path TEXT,
    hours_off INTEGER DEFAULT 24 CHECK (hours_off BETWEEN 0 AND 43800),
    year INTEGER,
    tags TEXT[],
    instrumentalness INTEGER CHECK (instrumentalness BETWEEN 0 AND 100),
    duration INTEGER,
    explicit BOOLEAN,
    danceability INTEGER CHECK (danceability BETWEEN 0 AND 100),
    energy INTEGER CHECK (energy BETWEEN 0 AND 100),
    liveness INTEGER CHECK (liveness BETWEEN 0 AND 100),
    loudness INTEGER CHECK (loudness BETWEEN 0 AND 100),
    speechiness INTEGER CHECK (speechiness BETWEEN 0 AND 100),
    valence INTEGER CHECK (valence BETWEEN 0 AND 100),
    time_signature INTEGER CHECK (time_signature BETWEEN 0 AND 7),
    roboticness INTEGER DEFAULT 2 CHECK (roboticness BETWEEN 1 AND 3),
    count_played INTEGER DEFAULT 0
);

CREATE TABLE compatibility_tree (
    id SERIAL PRIMARY KEY,
    root_id INTEGER NOT NULL REFERENCES nuts(id) ON DELETE CASCADE,
    branch_id INTEGER NOT NULL REFERENCES nuts(id) ON DELETE CASCADE,
    branch_level INTEGER CHECK (branch_level BETWEEN 1 AND 5),
    UNIQUE (root_id, branch_id)
);

CREATE TABLE history (
    id SERIAL PRIMARY KEY,
    nut_id INTEGER NOT NULL,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE settings (
    name TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
    id VARCHAR(100) NOT NULL PRIMARY KEY,
    email VARCHAR(256) UNIQUE NOT NULL,
    password VARCHAR(100) NOT NULL,
    name VARCHAR(100)
);

CREATE TABLE queue (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nut_id INTEGER NOT NULL REFERENCES nuts(id) ON DELETE CASCADE,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE show_schedule (
    id SERIAL PRIMARY KEY,
    show_name TEXT NOT NULL,
    rules JSONB NOT NULL,
    level_lock INTEGER,
    genre_lock TEXT NOT NULL DEFAULT '.*',
    roboticness_lock INTEGER NOT NULL DEFAULT 0,
    year_min INTEGER NOT NULL DEFAULT 1800,
    year_max INTEGER NOT NULL DEFAULT 5000
);

CREATE TABLE breaks (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type VARCHAR(5) NOT NULL CHECK (type IN ('break', 'id')),
    title VARCHAR(150) NOT NULL,
    level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
    hours_off INTEGER NOT NULL DEFAULT 24,
    file_path TEXT NOT NULL,
    date_added TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_played TIMESTAMP,
    sam_id INTEGER
);
