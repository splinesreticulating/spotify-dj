# Spotify DJ

Let your music take flight.

Spotify DJ turns your Spotify music library into a smart, automated radio station. It analyzes your collection and plays songs in a seamless, perfectly flowing order—just like a professional DJ.

---

## 🎵 Features

- **Automatic Playlist Flow:** Enjoy your Spotify songs in a DJ-style flow based on musical compatibility (key, BPM, energy, and more).
- **Personalized Radio:** Uses your liked songs and playlists to generate a unique listening experience.
- **Playback Monitoring:** Monitors your playback and adapts song selection in real-time.
- **Database Integration:** Supports PostgreSQL for robust music metadata and history.
- **Tagging & Audio Features:** Integrates with services like Last.fm and SoundStat for rich audio features and auto-tagging.

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- Yarn (or npm)
- PostgreSQL
- Spotify Developer Account ([register here](https://developer.spotify.com/dashboard/applications))

### Installation

```bash
# Clone the repository
$ git clone https://github.com/splinesreticulating/spotify-dj.git
$ cd spotify-dj

# Install dependencies
$ yarn install

# Copy environment variables template
$ cp .env.example .env
```

### Configuration
Edit the `.env` file to add your Spotify and database credentials. Example:

```env
CLIENT_ID=your_spotify_client_id
CLIENT_SECRET=your_spotify_client_secret
REDIRECT_URI=http://localhost:3000/callback
SERVER_PORT=3000
POSTGRES_HOST=localhost
POSTGRES_USER=your_db_user
POSTGRES_PASSWORD=your_db_password
POSTGRES_DB=jukebox_db
POSTGRES_PORT=5432
```

See `.env.example` for all available configuration options.

### Required Spotify Scopes

- `playlist-modify-private` – Append to private playlists
- `playlist-modify-public` – Append to public playlists
- `user-read-playback-state` – Get current playback state
- `user-library-read` – Access your liked songs
- `playlist-read-private` – Read private playlists

## 🛠 Usage

Start the main server:
```bash
yarn start # or: node --loader ts-node/esm src/butterfly.ts
```

Then, open [http://localhost:3000/login](http://localhost:3000/login) in your browser to authenticate with Spotify.

### Useful Scripts
- `yarn update-tags` – Update song tags from external sources
- `yarn populate-audio-features` – Populate audio features from SoundStat
- `yarn get-recent-likes` – Fetch your latest liked songs
- `yarn refresh-all-likes` – Refresh all liked songs in the database

See `package.json` for more scripts.

## 🤝 Contributing

Contributions are welcome! Please open issues or pull requests for bug fixes, features, or improvements.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/fooBar`)
3. Commit your changes (`git commit -am 'Add some fooBar'`)
4. Push to the branch (`git push origin feature/fooBar`)
5. Create a new Pull Request

---

## 📄 License

This project is licensed under the MIT License.

---
