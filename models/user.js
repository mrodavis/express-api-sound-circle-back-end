// models/user.js
const { Schema, model } = require('mongoose');

const isUrl = v => !v || /^https?:\/\//i.test(v);
const usernameRx = /^[a-z0-9_\.]{3,30}$/i;

const userSchema = new Schema(
  {
    // Auth
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: v => usernameRx.test(v),
        message: 'Username must be 3–30 chars (letters, numbers, underscore, dot).'
      }
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    hashedPassword: {
      type: String,
      required: true,
      select: false // prevents accidental leakage in queries
    },

    // Profile
    displayName: { type: String, trim: true },
    avatarUrl:   { type: String, trim: true, validate: { validator: isUrl, message: 'avatarUrl must be http(s)' } },
    bio:         { type: String, trim: true, maxlength: 280 },

    // Preferences / matching (seeded from Jukebox + SoundBytes)
    genres:      { type: [String], default: [], index: true },

    // Social graph
    followers:   [{ type: Schema.Types.ObjectId, ref: 'User' }],
    following:   [{ type: Schema.Types.ObjectId, ref: 'User' }],

    // Engagement
    likedSoundBytes: [{ type: Schema.Types.ObjectId, ref: 'SoundByte' }],

    // Jukebox (global Track refs; simple for MVP)
    jukebox: [{ type: Schema.Types.ObjectId, ref: 'Track' }],
    jukeboxStats: {
      plays:      { type: Number, default: 0 },
      topGenres:  [{ type: String }],
      topArtists: [{ type: String }]
    },

    // Privacy/settings
    settings: {
      visibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
      allowDMs:   { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

// Indexes

userSchema.index({ displayName: 'text', bio: 'text' }); // simple search

// Normalize a couple of fields just in case
userSchema.pre('save', function normalize(next) {
  if (this.isModified('email')) this.email = this.email.trim().toLowerCase();
  if (this.isModified('username')) this.username = this.username.trim().toLowerCase();
  next();
});

// Helper: safe public profile (use in controllers)
userSchema.methods.toPublicProfile = function () {
  return {
    id: this._id,
    username: this.username,
    displayName: this.displayName || this.username,
    avatarUrl: this.avatarUrl,
    bio: this.bio,
    genres: this.genres,
    followersCount: this.followers?.length || 0,
    followingCount: this.following?.length || 0,
    settings: this.settings
  };
};

// Hide sensitive fields by default
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    delete ret.hashedPassword;
    return ret;
  }
});

module.exports = model('User', userSchema);
