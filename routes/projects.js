const express = require('express');
const Project = require('../models/Projects');

const router = express.Router();

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

router.post('/create', requireAuth, async (req, res) => {
  try {
    const { name, objectives } = req.body; // Extract objectives from request body
    const project = await Project.createProject(name, req.session.userId, objectives);
    res.status(201).json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/join', requireAuth, async (req, res) => {
  try {
    const { code } = req.body;
    const project = await Project.findOne({ code, isActive: true });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.collaborators.includes(req.session.userId)) {
      project.collaborators.push(req.session.userId);
      project.lastActivity = Date.now();
      await project.save();
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/my-projects', requireAuth, async (req, res) => {
  try {
    const projects = await Project.find({
      collaborators: req.session.userId,
      isActive: true
    })
    .populate('owner', 'username')
    .populate('collaborators', 'username')
    .sort({ lastActivity: -1 });

    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:projectId', requireAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId)
      .populate('owner', 'username')
      .populate('collaborators', 'username');

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.collaborators.some(c => c._id.toString() === req.session.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:projectId/files', requireAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!project.collaborators.includes(req.session.userId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    project.files = req.body.files;
    project.lastActivity = Date.now();
    await project.save();

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update project details (including objectives)
router.put('/:projectId', requireAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Only owner can update project details
    if (project.owner.toString() !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can update project details' });
    }

    // Update allowed fields
    if (req.body.name) project.name = req.body.name;
    if (req.body.objectives !== undefined) project.objectives = req.body.objectives;

    project.lastActivity = Date.now();
    await project.save();

    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:projectId', requireAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.owner.toString() !== req.session.userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    project.isActive = false;
    await project.save();

    res.json({ message: 'Project deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:projectId/leave', requireAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.collaborators = project.collaborators.filter(
      c => c.toString() !== req.session.userId
    );
    
    await project.save();

    res.json({ message: 'Left project' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove collaborator (owner only)
router.delete('/:projectId/collaborators/:userId', requireAuth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check if current user is the owner
    if (project.owner.toString() !== req.session.userId) {
      return res.status(403).json({ error: 'Only owner can remove collaborators' });
    }

    const userIdToRemove = req.params.userId;

    // Cannot remove owner
    if (project.owner.toString() === userIdToRemove) {
      return res.status(400).json({ error: 'Cannot remove project owner' });
    }

    // Remove collaborator
    project.collaborators = project.collaborators.filter(
      c => c.toString() !== userIdToRemove
    );
    
    await project.save();

    res.json({ 
      message: 'Collaborator removed',
      removedUserId: userIdToRemove 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;