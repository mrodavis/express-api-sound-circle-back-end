// controllers/tracks.controller.js
const express = require('express');
const router = express.Router();

const verifyToken = require('../middleware/verify-token'); // use on write ops
const Track = require('../models/Track'); // match your file name (capital T)

// ---- Optional enrichment (safe if file not present) ----
let enrichTrack = async () => ({});
const ENRICH = String(process.env.ENABLE_ENRICHMENT).toLowerCase() === 'true';
try {
  ({ enrichTrack } = require('../services/music.service'));
} catch (_) { /* no-op */ }

// ---- Helpers ----
const clean = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const keyOf = (artist, title, soundClipUrl = '') =>
  `${clean(artist)}::${clean(title)}::${clean(soundClipUrl)}`;

const buildFilter = (q) => {
  if (!q || !q.trim()) return {};
  const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return { $or: [{ title: rx }, { artist: rx }] };
};

// -------------------- Routes --------------------

// GET /tracks  (public)
router.get('/', async (req, res) => {
  try {
    const { q, page = '1', limit = '10' } = req.query;
    const p = Math.max(parseInt(page, 10) || 1, 1);
    const l = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);

    const filter = buildFilter(q);
    const [items, total] = await Promise.all([
      Track.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
      Track.countDocuments(filter),
    ]);

    res.json({ items, page: p, limit: l, total, hasNext: p * l < total });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// GET /tracks/:id  (public)
router.get('/:id', async (req, res) => {
  try {
    const doc = await Track.findById(req.params.id);
    if (!doc) return res.status(404).json({ err: 'Track not found' });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

// POST /tracks  (protected)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { title, artist, coverArtUrl, soundClipUrl, sourceUrl, genre } = req.body || {};
    if (!title || !artist) return res.status(400).json({ err: 'title and artist are required' });

    const key = (Track.keyOf?.(artist, title, soundClipUrl) ?? keyOf(artist, title, soundClipUrl));
    let track = await Track.findOne({ key });

    if (!track) {
      let meta = {};
      if (ENRICH && (!coverArtUrl || !soundClipUrl)) {
        meta = await enrichTrack({ title, artist, coverArtUrl, soundClipUrl });
      }
      track = await Track.create({
        title,
        artist,
        key,
        coverArtUrl: coverArtUrl ?? meta.coverArtUrl ?? null,
        soundClipUrl: soundClipUrl ?? meta.soundClipUrl ?? null,
        sourceUrl: sourceUrl ?? null,
        genre: genre ?? meta.genre ?? null,
      });
    }

    res.status(201).json(track);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ err: 'duplicate track' });
    res.status(500).json({ err: err.message });
  }
});

// PUT /tracks/:id  (protected)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const allowed = ['title','artist','coverArtUrl','soundClipUrl','sourceUrl','genre'];
    const updates = {};
    for (const k of allowed) if (k in (req.body || {})) updates[k] = req.body[k];

    const doc = await Track.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!doc) return res.status(404).json({ err: 'Track not found' });
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ err: 'duplicate track' });
    res.status(500).json({ err: err.message });
  }
});

// DELETE /tracks/:id  (protected)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const deleted = await Track.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ err: 'Track not found' });
    res.json({ ok: true, deletedId: deleted._id });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

module.exports = router;
