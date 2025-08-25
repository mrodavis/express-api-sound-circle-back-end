// controllers/soundBytes.js
const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verify-token');
const SoundByte = require('../models/soundByte');
const Track = require('../models/Track');

// ----------------- Helpers -----------------
const clean = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const computeTrackKey = ({ title = '', artist = '', soundClipUrl = '' }) =>
  `${clean(artist)}::${clean(title)}::${clean(soundClipUrl)}`;

async function findOrCreateTrack(t = {}) {
  const key = t.key || computeTrackKey(t);
  let track = await Track.findOne({ key });
  if (!track) track = await Track.create({ ...t, key });
  return track;
}

// ----------------- Routes -----------------

// GET /sBytes  (newest first, simple pagination)
router.get('/', verifyToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

    const [items, total] = await Promise.all([
      SoundByte.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('author'),
      SoundByte.countDocuments(),
    ]);

    res.json({ total, limit, skip, items });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// GET /sBytes/:sByteId
router.get('/:sByteId', verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId).populate('author');
    if (!sByte) return res.status(404).json({ err: 'SoundByte not found' });
    res.json(sByte);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// POST /sBytes  (create; author from token; optional track denormalization)
router.post('/', verifyToken, async (req, res) => {
  try {
    req.body.author = req.user._id;

    let denorm = {};
    if (req.body.track && typeof req.body.track === 'object') {
      const t = await findOrCreateTrack(req.body.track);
      denorm = {
        trackId: t._id,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        coverArtUrl: t.coverArtUrl,
        soundClipUrl: t.soundClipUrl,
      };
    }

    const sByte = await SoundByte.create({ ...req.body, ...denorm });
    await sByte.populate('author');
    res.status(201).json(sByte);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// PUT /sBytes/:sByteId  (update; only owner; optional re-link to track)
router.put('/:sByteId', verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);
    if (!sByte) return res.status(404).json({ err: 'SoundByte not found' });

    if (String(sByte.author) !== String(req.user._id)) {
      return res.status(403).send("You're not allowed to do that!");
    }

    let update = { ...req.body };

    if (req.body.track && typeof req.body.track === 'object') {
      const t = await findOrCreateTrack(req.body.track);
      Object.assign(update, {
        trackId: t._id,
        title: t.title,
        artist: t.artist,
        genre: t.genre,
        coverArtUrl: t.coverArtUrl,
        soundClipUrl: t.soundClipUrl,
      });
    }

    const updated = await SoundByte.findByIdAndUpdate(req.params.sByteId, update, {
      new: true,
    }).populate('author');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// DELETE /sBytes/:sByteId  (only owner)
router.delete('/:sByteId', verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);
    if (!sByte) return res.status(404).json({ err: 'SoundByte not found' });

    if (String(sByte.author) !== String(req.user._id)) {
      return res.status(403).send("You're not allowed to do that!");
    }

    await sByte.deleteOne();
    res.json({ ok: true, deletedId: sByte._id });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// POST /sBytes/:sByteId/like  (count-only MVP)
router.post('/:sByteId/like', verifyToken, async (req, res) => {
  try {
    const s = await SoundByte.findById(req.params.sByteId);
    if (!s) return res.status(404).json({ err: 'SoundByte not found' });

    s.likesCount = (s.likesCount || 0) + 1;
    await s.save();
    res.json({ _id: s._id, likesCount: s.likesCount });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// POST /sBytes/:sByteId/unlike  (clamped at 0)
router.post('/:sByteId/unlike', verifyToken, async (req, res) => {
  try {
    const s = await SoundByte.findById(req.params.sByteId);
    if (!s) return res.status(404).json({ err: 'SoundByte not found' });

    s.likesCount = Math.max((s.likesCount || 0) - 1, 0);
    await s.save();
    res.json({ _id: s._id, likesCount: s.likesCount });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// ----- Comments (simple subdoc CRUD) -----

// POST /sBytes/:sByteId/comments
router.post('/:sByteId/comments', verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);
    if (!sByte) return res.status(404).json({ err: 'SoundByte not found' });

    const comment = {
      author: req.user._id,
      text: req.body.text || '',
    };
    sByte.comments.push(comment);
    await sByte.save();
    await sByte.populate('author');
    res.status(201).json(sByte);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// PUT /sBytes/:sByteId/comments/:commentId
router.put('/:sByteId/comments/:commentId', verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);
    if (!sByte) return res.status(404).json({ err: 'SoundByte not found' });

    const sub = sByte.comments.id(req.params.commentId);
    if (!sub) return res.status(404).json({ err: 'Comment not found' });

    if (String(sub.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You are not authorized to edit this comment' });
    }

    sub.text = req.body.text ?? sub.text;
    await sByte.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// DELETE /sBytes/:sByteId/comments/:commentId
router.delete('/:sByteId/comments/:commentId', verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);
    if (!sByte) return res.status(404).json({ err: 'SoundByte not found' });

    const sub = sByte.comments.id(req.params.commentId);
    if (!sub) return res.status(404).json({ err: 'Comment not found' });

    if (String(sub.author) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You are not authorized to delete this comment' });
    }

    sub.deleteOne();
    await sByte.save();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

module.exports = router;
