// models/soundByte.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const isUrl = (v) => !v || /^https?:\/\//i.test(v);

// --- Comments subdoc ---
const commentSchema = new Schema(
  {
    body:   { type: String, required: true, trim: true },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, _id: true }
);

// Back-compat alias: allow existing code that uses `comment.text`
commentSchema.virtual('text')
  .get(function () { return this.body; })
  .set(function (v) { this.body = v; });

// --- SoundByte (Post) ---
const soundByteSchema = new Schema(
  {
    // Link to canonical Track (global) for dedupe & matching
    trackId: { type: Schema.Types.ObjectId, ref: 'Track', index: true },

    // Denormalized track fields for fast feed rendering (no populate required)
    title:        { type: String, trim: true },  // optional (required if no sourceUrl/audioUrl)
    artist:       { type: String, trim: true },
    genre:        { type: String, trim: true, index: true },
    coverArtUrl:  { type: String, trim: true, validate: { validator: isUrl, message: 'coverArtUrl must be http(s)' } },
    soundClipUrl: { type: String, trim: true, validate: { validator: isUrl, message: 'soundClipUrl must be http(s)' } },

    // If user provides a link (YouTube/Spotify/etc.) or direct audio
    sourceUrl: { type: String, trim: true, validate: { validator: isUrl, message: 'sourceUrl must be http(s)' } },
    audioUrl:  { type: String, trim: true, validate: { validator: isUrl, message: 'audioUrl must be http(s)' } },

    // The post text
    caption:   { type: String, required: true, trim: true },

    // Tagging & visibility
    tags:        [{ type: String, trim: true, lowercase: true }],
    visibility:  { type: String, enum: ['public', 'friends', 'private'], default: 'public' },

    // Ownership
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Social counters
    likesCount:    { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },

    // Embedded comments for v1
    comments: [commentSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Back-compat alias: keep supporting `soundByte.text`
soundByteSchema.virtual('text')
  .get(function () { return this.caption; })
  .set(function (v) { this.caption = v; });

// Helpful indexes
soundByteSchema.index({ createdAt: -1 });
soundByteSchema.index({
  caption: 'text',
  title: 'text',
  artist: 'text',
  tags: 'text',
});

// Optional safety: never let likesCount/commentsCount drop below 0
soundByteSchema.pre('save', function (next) {
  if (this.likesCount < 0) this.likesCount = 0;
  if (this.commentsCount < 0) this.commentsCount = 0;
  next();
});

module.exports = mongoose.model('SoundByte', soundByteSchema);
