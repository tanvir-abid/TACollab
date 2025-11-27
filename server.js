require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const User = require('./models/User');
const Project = require('./models/Projects');
const Message = require('./models/Message');
const messageRoutes = require('./routes/messages');
const GroupMessage = require('./models/GroupMessage');
const groupMessageRoutes = require('./routes/groupMessages');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// ----------------------
// MONGO CONNECTION
// ----------------------
mongoose.set('strictQuery', false);

mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'collab'  // specify your database name here
})
.then(() => console.log('MongoDB connected to collab ✅'))
.catch(err => console.error('MongoDB connection error:', err));
// ----------------------
// MIDDLEWARE
// ----------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// EXPRESS-SESSION (FIXED)
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "fallbackSecretKey123!",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,  // set true only if using HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
});

app.use(sessionMiddleware);

// Share session with Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// STATIC PUBLIC FOLDER
app.use(express.static(path.join(__dirname, 'public')));

// API ROUTES
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/group-messages', groupMessageRoutes);

// ----------------------
// PAGE ROUTES
// ----------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/editor/:projectId', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'editor.html'));
});

// ----------------------
// SOCKET.IO CONNECTION HANDLER
// ----------------------
const projectRooms = new Map(); // projectId -> Set of {socketId, userId, username}
const onlineUsers = new Map(); // userId -> {username, socketIds: Set}


io.on('connection', async (socket) => {
  console.log('New socket connection:', socket.id);
  
  const userId = socket.request.session.userId;
  
  if (!userId) {
    console.log('Unauthorized socket connection');
    socket.disconnect();
    return;
  }

  // Get user info
  const user = await User.findById(userId).select('username');
  if (!user) {
    socket.disconnect();
    return;
  }

    // Track online user
  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, {
      username: user.username,
      socketIds: new Set()
    });
  }
  onlineUsers.get(userId).socketIds.add(socket.id);

  // Broadcast online users update to all connected clients
  io.emit('global-users-update', {
    onlineCount: onlineUsers.size,
    onlineUserIds: Array.from(onlineUsers.keys())
  });

  console.log(`User ${user.username} connected with socket ${socket.id}`);

  // Join project room
  socket.on('join-project', async (projectId) => {
    try {
      console.log(`User ${user.username} joining project ${projectId}`);
      
      // Verify user has access to project
      const project = await Project.findById(projectId)
        .populate('owner', 'username')
        .populate('collaborators', 'username');
      
      if (!project) {
        socket.emit('error', { message: 'Project not found' });
        return;
      }

      const hasAccess = project.collaborators.some(c => c._id.toString() === userId);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Join the room
      socket.join(projectId);
      socket.currentProject = projectId;
      socket.currentUser = {
        id: userId,
        username: user.username
      };

      // Initialize room if it doesn't exist
      if (!projectRooms.has(projectId)) {
        projectRooms.set(projectId, new Set());
      }

      // Add user to room
      const room = projectRooms.get(projectId);
      room.add({
        socketId: socket.id,
        userId: userId,
        username: user.username
      });

      // Get online users
      const onlineUsers = Array.from(room).map(u => ({
        userId: u.userId,
        username: u.username
      }));

      // Notify all users in room about online users
      io.to(projectId).emit('users-update', {
        onlineUsers,
        allCollaborators: project.collaborators.map(c => ({
          _id: c._id,
          username: c.username
        })),
        owner: project.owner
      });

      console.log(`Room ${projectId} now has ${room.size} users online`);
    } catch (error) {
      console.error('Error joining project:', error);
      socket.emit('error', { message: error.message });
    }
  });

  // Code change event
  socket.on('code-change', (data) => {
    const { projectId, fileId, code, from, to, text } = data;
    
    // Broadcast to all other users in the room
    socket.to(projectId).emit('remote-code-change', {
      fileId,
      code,
      from,
      to,
      text,
      user: socket.currentUser
    });
  });

  // Cursor movement event
  socket.on('cursor-move', (data) => {
    const { projectId, fileId, line, ch } = data;
    
    // Broadcast to all other users in the room
    socket.to(projectId).emit('remote-cursor-move', {
      fileId,
      line,
      ch,
      user: socket.currentUser
    });
  });

  // File switch event
  socket.on('file-switch', (data) => {
    const { projectId, fileId } = data;
    
    // Broadcast to all other users in the room
    socket.to(projectId).emit('remote-file-switch', {
      fileId,
      user: socket.currentUser
    });
  });

  // Disconnect event
  socket.on('disconnect', () => {
    console.log(`Socket ${socket.id} disconnected`);

      // Remove from online users
  if (userId && onlineUsers.has(userId)) {
    const userSockets = onlineUsers.get(userId).socketIds;
    userSockets.delete(socket.id);
    
    if (userSockets.size === 0) {
      onlineUsers.delete(userId);
    }
    
    // Broadcast updated online users
    io.emit('global-users-update', {
      onlineCount: onlineUsers.size,
      onlineUserIds: Array.from(onlineUsers.keys())
    });
  }
    
    if (socket.currentProject && socket.currentUser) {
      const projectId = socket.currentProject;
      const room = projectRooms.get(projectId);
      
      if (room) {
        // Remove user from room
        room.forEach(u => {
          if (u.socketId === socket.id) {
            room.delete(u);
          }
        });

        // Get remaining online users
        const onlineUsers = Array.from(room).map(u => ({
          userId: u.userId,
          username: u.username
        }));

        // Notify remaining users
        io.to(projectId).emit('user-left', {
          user: socket.currentUser,
          onlineUsers
        });

        console.log(`User ${socket.currentUser.username} left project ${projectId}`);
        
        // Clean up empty rooms
        if (room.size === 0) {
          projectRooms.delete(projectId);
        }
      }
    }
  });

  // Handle collaborator removal
  socket.on('collaborator-removed', (data) => {
    const { projectId, removedUserId } = data;
    
    // Find and disconnect the removed user's socket
    const room = projectRooms.get(projectId);
    if (room) {
      room.forEach(u => {
        if (u.userId === removedUserId) {
          const removedSocket = io.sockets.sockets.get(u.socketId);
          if (removedSocket) {
            removedSocket.emit('removed-from-project', { projectId });
            removedSocket.leave(projectId);
          }
          room.delete(u);
        }
      });
    }
  });

  // Send message
  socket.on('send-message', async (data) => {
    const { receiverId, content } = data;
    
    try {
      const message = new Message({
        sender: userId,
        receiver: receiverId,
        content: content.trim()
      });
      
      await message.save();
      await message.populate('sender', 'username');
      
      // Send to receiver if online
      const receiverSockets = onlineUsers.get(receiverId);
      if (receiverSockets) {
        receiverSockets.socketIds.forEach(socketId => {
          io.to(socketId).emit('receive-message', {
            _id: message._id,
            sender: message.sender,
            content: message.content,
            createdAt: message.createdAt
          });
        });
      }
      
      // Confirm to sender
      socket.emit('message-sent', {
        _id: message._id,
        receiver: receiverId,
        content: message.content,
        createdAt: message.createdAt
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Mark messages as read
  socket.on('mark-read', async (data) => {
    const { senderId } = data;
    
    try {
      await Message.updateMany(
        { sender: senderId, receiver: userId, read: false },
        { read: true }
      );
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  });

  socket.on('send-group-message', async (data) => {
    const { projectId, content } = data;
    
    try {
      // Verify user has access
      const project = await Project.findById(projectId);
      if (!project) {
        socket.emit('error', { message: 'Project not found' });
        return;
      }

      const hasAccess = project.collaborators.some(c => c._id.toString() === userId);
      if (!hasAccess) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }

      // Save message
      const message = new GroupMessage({
        project: projectId,
        sender: userId,
        content: content.trim()
      });
      
      await message.save();
      await message.populate('sender', 'username');
      
      // Broadcast to all users in the project room
      io.to(projectId).emit('receive-group-message', {
        _id: message._id,
        sender: {
          _id: message.sender._id,
          username: message.sender.username
        },
        content: message.content,
        createdAt: message.createdAt
      });
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
});

// ----------------------
// SERVER START
// ----------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));