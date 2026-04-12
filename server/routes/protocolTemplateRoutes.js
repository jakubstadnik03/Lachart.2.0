const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const User = require('../models/UserModel');
const ProtocolTemplate = require('../models/ProtocolTemplate');

// GET /api/protocol-templates
// Get templates for current user: own + shared with them + public
router.get('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const templates = await ProtocolTemplate.find({
      $or: [
        { createdBy: userId },
        { sharedWithAthletes: userId },
        { isPublic: true },
      ],
    }).sort({ createdAt: -1 });

    return res.status(200).json(templates);
  } catch (err) {
    console.error('GET /api/protocol-templates error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/protocol-templates
// Create a new template (auth required)
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { name, description, sport, isPublic, protocol, sharedWithAthletes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const user = await User.findById(userId).select('name surname');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const template = new ProtocolTemplate({
      name: name.trim(),
      description: description || undefined,
      createdBy: userId,
      createdByName: `${user.name} ${user.surname}`.trim(),
      sport: sport || 'all',
      isPublic: isPublic || false,
      protocol: protocol || {},
      sharedWithAthletes: sharedWithAthletes || [],
    });

    await template.save();
    return res.status(201).json(template);
  } catch (err) {
    console.error('POST /api/protocol-templates error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/protocol-templates/:id
// Update a template (only creator)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const template = await ProtocolTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (String(template.createdBy) !== String(userId)) {
      return res.status(403).json({ error: 'Access denied: only the creator can update this template' });
    }

    const { name, description, sport, isPublic, protocol, sharedWithAthletes } = req.body;

    if (name !== undefined) template.name = name.trim();
    if (description !== undefined) template.description = description;
    if (sport !== undefined) template.sport = sport;
    if (isPublic !== undefined) template.isPublic = isPublic;
    if (protocol !== undefined) template.protocol = { ...template.protocol, ...protocol };
    if (sharedWithAthletes !== undefined) template.sharedWithAthletes = sharedWithAthletes;

    await template.save();
    return res.status(200).json(template);
  } catch (err) {
    console.error('PUT /api/protocol-templates/:id error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/protocol-templates/:id
// Delete a template (only creator)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;

    const template = await ProtocolTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (String(template.createdBy) !== String(userId)) {
      return res.status(403).json({ error: 'Access denied: only the creator can delete this template' });
    }

    await ProtocolTemplate.findByIdAndDelete(id);
    return res.status(200).json({ message: 'Template deleted successfully' });
  } catch (err) {
    console.error('DELETE /api/protocol-templates/:id error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/protocol-templates/:id/share/:athleteId
// Coach shares a template with an athlete
router.post('/:id/share/:athleteId', verifyToken, async (req, res) => {
  try {
    const { id, athleteId } = req.params;
    const userId = req.user.userId;

    const template = await ProtocolTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    if (String(template.createdBy) !== String(userId)) {
      return res.status(403).json({ error: 'Access denied: only the creator can share this template' });
    }

    const athlete = await User.findById(athleteId).select('_id');
    if (!athlete) {
      return res.status(404).json({ error: 'Athlete not found' });
    }

    // Add athlete to sharedWithAthletes if not already present
    const alreadyShared = template.sharedWithAthletes.some(
      (aid) => String(aid) === String(athleteId)
    );

    if (!alreadyShared) {
      template.sharedWithAthletes.push(athleteId);
      await template.save();
    }

    return res.status(200).json(template);
  } catch (err) {
    console.error('POST /api/protocol-templates/:id/share/:athleteId error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
