// models/Track.js
const { Schema, model } = require('mongoose');

const isHttpUrl = (v) => !v || /^https?:\/\//i.test(v);

const TrackSchema = new Schema(
  {
    // Required core identity
    title:  { type: String, required: true, trim: true },
    artist: { type: String, required: true, trim: true },

    // Stable dedupe key (lowercased "artist — title"). Unique index.
    key:    { type: String, required: true, unique: true, index: true },

    // Optional enrichment (filled by music.service when available)
    album:        { type: String, trim: true },
    releaseYear:  { type: Number, min: 1800, max: 9999 },
    durationMs:   { type: Number, min: 0 },

    coverArtUrl:  { type: String, trim: true, validate: { validator: isHttpUrl, message: 'coverArtUrl must be http(s)' } },
    soundClipUrl: { type: String, trim: true, validate: { validator: isHttpUrl, message: 'soundClipUrl must be http(s)' } },
    sourceUrl:    { type: String, trim: true, validate: { validator: isHttpUrl, message: 'sourceUrl must be http(s)' } },

    // External provider IDs (handy for idempotent enrichment)
    itunesId: { type: String, index: true, sparse: true },
    deezerId: { type: String, index: true, sparse: true },

    // Matching signals
    primaryGenre: { type: String, trim: true },
    genres:       [{ type: String, trim: true }], // allow multiple tags

    // Lightweight popularity counters (optional; can be derived later)
    likesCount:     { type: Number, default: 0, min: 0 },
    soundBytesCount:{ type: Number, default: 0, min: 0 }, // how many posts reference this track
  },
  { timestamps: true }
);

// --------- Helpers & indexes ----------

// Build the canonical dedupe key (lowercase, trimmed)
TrackSchema.statics.keyOf = (artist, title) =>
  [artist || '', title || '']
    .map((s) => String(s).trim().toLowerCase())
    .join(' — ');

// Ensure `key` is set/updated automatically from title/artist
TrackSchema.pre('validate', function setKeyFromParts(next) {
  if (this.isModified('artist') || this.isModified('title') || !this.key) {
    const a = this.artist ?? '';
    const t = this.title ?? '';
    this.key = this.constructor.keyOf(a, t);
  }
  next();
});

// Normalize genres: de-dupe + trim + lowercase for consistent matching
TrackSchema.pre('save', function normalizeGenres(next) {
  if (Array.isArray(this.genres)) {
    const seen = new Set();
    this.genres = this.genres
      .map((g) => String(g || '').trim().toLowerCase())
      .filter((g) => g.length)
      .filter((g) => (seen.has(g) ? false : (seen.add(g), true)));
  }
  if (this.primaryGenre) this.primaryGenre = String(this.primaryGenre).trim();
  next();
});

// Text index to support search in feed/jukebox (caption search lives on SoundByte)
TrackSchema.index({ title: 'text', artist: 'text', album: 'text' });

// Nice JSON output
TrackSchema.set('toJSON', {
  virtuals: true,
  versionKey: false,
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
  },
});

module.exports = model('Track', TrackSchema);