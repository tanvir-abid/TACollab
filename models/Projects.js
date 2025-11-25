const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  name: { type: String, required: true },
  language: { type: String, required: true },
  code: { type: String, default: '' }
});

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, required: true, unique: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  collaborators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  objectives: { type: String, default: '' }, // Changed from 'Objectives' to 'objectives' (lowercase) and made optional
  files: [fileSchema],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now }
});

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

projectSchema.statics.createProject = async function(name, userId, objectives = '') {
  let code = generateCode();
  let exists = await this.findOne({ code });
  
  while (exists) {
    code = generateCode();
    exists = await this.findOne({ code });
  }

  return this.create({
    name,
    code,
    owner: userId,
    collaborators: [userId],
    objectives, // Add objectives parameter
    files: []
  });
};

module.exports = mongoose.model('Project', projectSchema);