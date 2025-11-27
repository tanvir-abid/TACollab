const express = require('express');
const router = express.Router();
const GroupMessage = require('../models/GroupMessage');
const Project = require('../models/Projects');

// Get group messages for a project
router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user has access to project
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const hasAccess = project.collaborators.some(c => c.toString() === userId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const messages = await GroupMessage.find({ project: projectId })
      .populate('sender', 'username')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;