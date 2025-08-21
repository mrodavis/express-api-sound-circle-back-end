const express = require("express");
const verifyToken = require("../middleware/verify-token.js");
const SoundByte = require("../models/soundByte.js");
const router = express.Router();

router.post("/", verifyToken, async (req, res) => {
  try {
    req.body.author = req.user._id;
    const sByte = await SoundByte.create(req.body);
    sByte._doc.author = req.user;
    res.status(201).json(hoot);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.get("/", verifyToken, async (req, res) => {
    try {
    const sBytes = await SoundByte.find({})
      .populate("author")
      .sort({ createdAt: "desc" });
    res.status(200).json(sBytes);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.get("/:sByteId", verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.hootId).populate("author");
    res.status(200).json(hoot);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.put("/:sByteId", verifyToken, async (req, res) => {
  try {
    // Find the sByte:
    const sByte = await SoundByte.findById(req.params.sByteId);

    // Check permissions:
    if (!sByte.author.equals(req.user._id)) {
      return res.status(403).send("You're not allowed to do that!");
    }

    // Update sByte:
    const updatedSoundByte = await SoundByte.findByIdAndUpdate(
      req.params.sByteId,
      req.body,
      { new: true }
    );

    // Append req.user to the author property:
    updatedSoundByte._doc.author = req.user;

    // Issue JSON response:
    res.status(200).json(updatedSoundByte);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.delete("/:sByteId", verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);

    if (!sByte.author.equals(req.user._id)) {
      return res.status(403).send("You're not allowed to do that!");
    }

    const deletedSoundByte = await SoundByte.findByIdAndDelete(req.params.sByteId);
    res.status(200).json(deletedSoundByte);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.post("/:sByteId/comments", verifyToken, async (req, res) => {
  try {
    req.body.author = req.user._id;
    const sByte = await SoundByte.findById(req.params.sByteId);
    sByte.comments.push(req.body);
    await sByte.save();

    // Find the newly created comment:
    const newComment = sByte.comments[sByte.comments.length - 1];

    newComment._doc.author = req.user;

    // Respond with the newComment:
    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.put("/:sByteId/comments/:commentId", verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);
    const comment = sByte.comments.id(req.params.commentId);

    // ensures the current user is the author of the comment
    if (comment.author.toString() !== req.user._id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to edit this comment" });
    }

    comment.text = req.body.text;
    await sByte.save();
    res.status(200).json({ message: "Comment updated successfully" });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

router.delete("/:sByteId/comments/:commentId", verifyToken, async (req, res) => {
  try {
    const sByte = await SoundByte.findById(req.params.sByteId);
    const comment = sByte.comments.id(req.params.commentId);

    // ensures the current user is the author of the comment
    if (comment.author.toString() !== req.user._id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to edit this comment" });
    }

    sByte.comments.remove({ _id: req.params.commentId });
    await sByte.save();
    res.status(200).json({ message: "Comment deleted successfully" });
  } catch (err) {
    res.status(500).json({ err: err.message });
  }
});

module.exports = router;
