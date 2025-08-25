// services/music.service.js
// Minimal enrichment utility for tracks (no external deps).
// Looks up a track on iTunes Search API and returns missing fields.
//
// Usage:
//   const { enrichTrack } = require('../services/music.service');
//   const meta = await enrichTrack({ title, artist, coverArtUrl, soundClipUrl });
//
// Returns an object with any of the following keys if found (else {}):
//   { coverArtUrl, soundClipUrl, genre, sourceUrl }

const https = require('https');

// Small helper to fetch JSON with a timeout (no extra libraries)
function fetchJson(url, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null); // silent fail (MVP friendly)
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function toQuery({ title = '', artist = '' }) {
  const term = encodeURIComponent(`${artist} ${title}`.trim());
  // media=music ensures we don’t pull podcasts, etc.
  return `https://itunes.apple.com/search?media=music&limit=1&term=${term}`;
}

// iTunes gives artwork at 60/100 px; swap to 600x600 for nicer cards
function upsizeArtwork(url) {
  if (!url) return null;
  // common pattern: .../100x100bb.jpg -> .../600x600bb.jpg
  return url.replace(/\/(\d+)x\1bb\./, '/600x600bb.');
}

async function enrichTrack({ title, artist, coverArtUrl, soundClipUrl }) {
  const needCover = !coverArtUrl;
  const needClip = !soundClipUrl;

  if (!needCover && !needClip) return {}; // nothing to do
  if (!title || !artist) return {}; // need both to search

  const url = toQuery({ title, artist });
  const json = await fetchJson(url);
  const r = json?.results?.[0];
  if (!r) return {};

  const art600 = upsizeArtwork(r.artworkUrl100 || r.artworkUrl60);

  return {
    coverArtUrl: needCover ? (art600 || r.artworkUrl100 || r.artworkUrl60 || null) : undefined,
    soundClipUrl: needClip ? (r.previewUrl || null) : undefined,
    genre: r.primaryGenreName || undefined,
    sourceUrl: r.trackViewUrl || r.collectionViewUrl || undefined,
  };
}

module.exports = { enrichTrack };
