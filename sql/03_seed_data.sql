-- Insert initial data into `settings`
INSERT INTO settings (name, value, description) VALUES
    ('LEVEL_LOCK', '3', 'Only play this level'),
    ('RETRY_DELAY', '60000', 'Default retry time in milliseconds'),
    ('BUFFER_DELAY', '15000', 'Buffer time in milliseconds to wait longer than each song'),
    ('BPM_MAX_MULTIPLIER', '1.09', 'Maximum BPM multiplier (minimum: 1)'),
    ('BPM_MIN_MULTIPLIER', '0.96', 'Minimum BPM multiplier (recommended: 0.96)'),
    ('CURRENT_MODE', 'soft', 'Observed when MODE_OVERRIDE = true'),
    ('DELAY_ALBUM', '360', 'Minutes to wait before playing the same album'),
    ('DELAY_ARTIST', '360', 'Minutes to wait before playing the same artist'),
    ('DELAY_TITLE', '0', 'Minutes to wait before playing the same title'),
    ('GENRE_LOCK', '.*', 'Regex for allowed genres (.* = all)'),
    ('ROBOTICNESS_LOCK', '0', 'Only play this roboticness level (0 = all)'),
    ('HAPPINESS_MAX', '101', 'Maximum happiness (0-100)'),
    ('HAPPINESS_MIN', '-1', 'Minimum happiness (0-100)'),
    ('HIPNESS', '9', 'Likelihood that newer songs will play (1-10)'),
    ('MODE_OVERRIDE', 'false', 'Override the flow mode (true/false)'),
    ('POSITION', '6', 'Position in Flow Sequence'),
    ('PROMISCUITY', '5', 'Likelihood that unknown combos will play (0-10)'),
    ('YEAR_MAX', '3000', 'Latest year to play tracks from'),
    ('YEAR_MIN', '-1', 'Earliest year to play tracks from'),
    ('PLAYLIST_ID', '', 'Spotify playlist to append songs to'),
    ('LAST_BREAK_TIME', '2024-01-01T00:00:00Z', 'Timestamp of last station break or ID');

-- Base shows (using mostly defaults: genre_lock = '.*', year_min = 1800, year_max = 5000)
INSERT INTO show_schedule (show_name, rules, level_lock) VALUES
    -- Daily Shows
    ('Overnight', 
     '[{"days": [0,1,2,3,4,5,6], "start_time": "00:00", "end_time": "06:00"}]'::jsonb,
     1),
    
    -- Weekday Shows
    ('Weekday Wake-Up', 
     '[{"days": [1,2,3,4,5], "start_time": "06:00", "end_time": "08:00"}]'::jsonb,
     2),
    
    ('Variety Mix',
     '[{"days": [1,2,3,4,5], "start_time": "08:00", "end_time": "21:00"}]'::jsonb,
     3),
    
    ('Weekday Wind-Down',
     '[{"days": [1,2,3,4,5], "start_time": "21:00", "end_time": "23:59"}]'::jsonb,
     2),
    
    ('Saturday Wake-Up',
     '[{"days": [6], "start_time": "06:00", "end_time": "09:00"}]'::jsonb,
     2),

    ('Dance Mix',
     '[{"days": [5, 6], "start_time": "21:00", "end_time": "23:00"}]'::jsonb,
     5);
    
-- Roboticness-specific shows
INSERT INTO show_schedule (show_name, rules, level_lock, roboticness_lock) VALUES
    ('Organic cafe',
     '[{"days": [1], "start_time": "18:00", "end_time": "20:00"}]'::jsonb,
     3,
     1);

-- Genre-specific shows
INSERT INTO show_schedule (show_name, rules, level_lock, genre_lock) VALUES
    ('Britpop Mondays',
     '[{"days": [1], "start_time": "19:00", "end_time": "21:00"}]'::jsonb,
     3,
     'britpop'),
    
    ('Pepsi Power Hour',
     '[{"days": [2, 4], "start_time": "18:00", "end_time": "19:00"}]'::jsonb,
     4,
     '^rock$'),
    
    ('Hip Hop Diary',
     '[{"days": [3], "start_time": "18:00", "end_time": "19:00"}]'::jsonb,
     3,
     'hiphop'),
        
    ('Sunday Funnies',
     '[{"days": [0], "start_time": "22:00", "end_time": "23:00"}]'::jsonb,
     3,
     'comedy');

-- Decade-specific shows
INSERT INTO show_schedule (show_name, rules, level_lock, year_min, year_max) VALUES   
    ('The Eighties',
     '[{"days": [6], "start_time": "09:00", "end_time": "12:00"}]'::jsonb,
     3,
     1980,
     1989),
    
    ('The Nineties',
     '[{"days": [6], "start_time": "17:00", "end_time": "20:00"}]'::jsonb,
     3,
     1990,
     1999);
