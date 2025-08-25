// controllers/tracks.controller.js
const mongoose = require('mongoose');
const Track = require('../models/Track'); // match file name
const isId = (id) => mongoose.Types.ObjectId.isValid(id);

// Optional enrichment (safe if the file is missing)
let enrichTrack = async () => ({});
const ENRICH = String(process.env.ENABLE_ENRICHMENT).toLowerCase() === 'true';
try {
  ({ enrichTrack } = require('../services/music.service'));
} catch (_) { /* no-op */ }

// Local fallback key generator if model lacks keyOf
const clean = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
const keyOf = (artist, title, soundClipUrl = '') =>
  `${clean(artist)}::${clean(title)}::${clean(soundClipUrl)}`;

const buildFilter = (q) => {
  if (!q || !q.trim()) return {};
  const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return { $or: [{ title: rx }, { artist: rx }] };
};

async function create(req, res, next) {
  try {
    const { title, artist, coverArtUrl, soundClipUrl, sourceUrl, genre } = req.body || {};
    if (!title || !artist) return res.status(400).json({ error: 'title and artist are required' });

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
  } catch (e) { next(e); }
}

async function index(req, res, next) {
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
  } catch (e) { next(e); }
}

async function show(req, res, next) {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'invalid id' });
    const track = await Track.findById(id);
    if (!track) return res.status(404).json({ error: 'not found' });
    res.json(track);
  } catch (e) { next(e); }
}

async function update(req, res, next) {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'invalid id' });

    const allowed = ['title','artist','coverArtUrl','soundClipUrl','sourceUrl','genre'];
    const updates = {};
    for (const k of allowed) if (k in (req.body || {})) updates[k] = req.body[k];

    const track = await Track.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!track) return res.status(404).json({ error: 'not found' });
    res.json(track);
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'duplicate track (artist — title)' });
    next(e);
  }
}

async function destroy(req, res, next) {
  try {
    const { id } = req.params;
    if (!isId(id)) return res.status(400).json({ error: 'invalid id' });
    const deleted = await Track.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
}

module.exports = { create, index, show, update, destroy };
