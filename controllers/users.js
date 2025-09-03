const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verify-token');

const User = require('../models/user');
const Track = require('../models/Track'); // <-- match filename (capital T)

// ---------- helpers for Track find-or-create ----------
const clean = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const keyOf = (artist, title, soundClipUrl = '') =>
  `${clean(artist)}::${clean(title)}::${clean(soundClipUrl)}`;

// optional enrichment (safe if file not present)
let enrichTrack = async () => ({});
const ENRICH = String(process.env.ENABLE_ENRICHMENT || '').toLowerCase() === 'true';
try { ({ enrichTrack } = require('../services/music.service')); } catch (_) { /* no-op */ }

// ---------- existing routes ----------
router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await User.find({}, 'username');
    res.json(users);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.get('/:userId', verifyToken, async (req, res) => {
  try {
    if (String(req.user._id) !== String(req.params.userId)) {
      return res.status(403).json({ err: 'Unauthorized' });
    }
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ err: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// ---------- Playlist / Jukebox ----------

// GET /users/:id/jukebox  (public read so your current frontend works)
router.get('/:id/jukebox', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).populate('jukebox');
    if (!user) return res.status(404).json({ err: 'User not found' });
    res.json(user.jukebox || []);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

/**
 * POST /users/:id/jukebox   (owner only)
 * Body: { trackId }  OR  { track: { title, artist, coverArtUrl?, soundClipUrl?, sourceUrl?, genre? } }
 * If "track" provided, we find-or-create by key (artist+title+soundClipUrl).
 */
router.post('/:id/jukebox', verifyToken, async (req, res) => {
  try {
    if (String(req.user._id) !== String(req.params.id)) {
      return res.status(403).json({ err: "You're not allowed to modify this playlist" });
    }

    let track;

    if (req.body?.trackId) {
      track = await Track.findById(req.body.trackId);
      if (!track) return res.status(404).json({ err: 'Track not found' });
    } else {
      const t = req.body?.track || {};
      if (!t.title || !t.artist) {
        return res.status(400).json({ err: 'title and artist are required' });
      }

      const key =
        (Track.keyOf?.(t.artist, t.title, t.soundClipUrl)) ||
        keyOf(t.artist, t.title, t.soundClipUrl);

      track = await Track.findOne({ key });
      if (!track) {
        let meta = {};
        if (ENRICH && (!t.coverArtUrl || !t.soundClipUrl)) {
          meta = await enrichTrack(t);
        }
        track = await Track.create({
          title: t.title,
          artist: t.artist,
          key,
          coverArtUrl: t.coverArtUrl ?? meta.coverArtUrl ?? null,
          soundClipUrl: t.soundClipUrl ?? meta.soundClipUrl ?? null,
          sourceUrl: t.sourceUrl ?? null,
          genre: t.genre ?? meta.genre ?? null,
        });
      }
    }

    await User.updateOne(
      { _id: req.user._id },
      { $addToSet: { jukebox: track._id } }
    );

    const updated = await User.findById(req.user._id).populate('jukebox');
    res.status(201).json(updated.jukebox || []);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

// DELETE /users/:id/jukebox/:trackId  (owner only)
router.delete('/:id/jukebox/:trackId', verifyToken, async (req, res) => {
  try {
    if (String(req.user._id) !== String(req.params.id)) {
      return res.status(403).json({ err: "You're not allowed to modify this playlist" });
    }

    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { $pull: { jukebox: req.params.trackId } },
      { new: true }
    ).populate('jukebox');

    if (!updated) return res.status(404).json({ err: 'User not found' });
    res.json(updated.jukebox || []);
  } catch (e) {
    res.status(500).json({ err: e.message });
  }
});

module.exports = router;
