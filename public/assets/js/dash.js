let currentUserId = null;
const createModal = new bootstrap.Modal(document.getElementById('createModal'));
const joinModal = new bootstrap.Modal(document.getElementById('joinModal'));
// Add Socket.IO
const socket = io();

// Online users tracking
let allOnlineUsers = new Set();
let allCollaborators = new Map(); // userId -> {username, projects}

// Chat management
const openChats = new Map(); // userId -> chat element
const unreadMessages = new Map(); // userId -> count
const onlineUsersModal = new bootstrap.Modal(document.getElementById('onlineUsersModal'));




// OTP Input Handler
const otpInputs = document.querySelectorAll('.otp-input');
otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
    const value = e.target.value.toUpperCase();
    e.target.value = value;
    
    if (value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
    }
    });

    input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !e.target.value && index > 0) {
        otpInputs[index - 1].focus();
    }
    });

    input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').toUpperCase().slice(0, 6);
    pasteData.split('').forEach((char, i) => {
        if (otpInputs[i]) otpInputs[i].value = char;
    });
    if (pasteData.length === 6) otpInputs[5].focus();
    });
});

fetch('/api/auth/me')
    .then(res => res.json())
    .then(data => {
    if (data.username) {
        document.getElementById('username').textContent = data.username;
        currentUserId = data._id;
    }
    })
    .catch(() => {
    window.location.href = '/';
    });

function updateStats(projects) {
    const totalFiles = projects.reduce((sum, p) => sum + p.files.length, 0);
    const totalCollabs = projects.reduce((sum, p) => sum + p.collaborators.length, 0);
    console.log(projects);
    document.getElementById('totalProjects').textContent = projects.length;
    document.getElementById('totalFiles').textContent = totalFiles;
    document.getElementById('totalCollabs').textContent = totalCollabs;
    document.getElementById('projectCount').textContent = `${projects.length} project${projects.length !== 1 ? 's' : ''}`;
    document.getElementById('linesOfCode').textContent = (totalFiles * 150).toLocaleString();
}

function loadProjects() {
    fetch('/api/projects/my-projects')
    .then(res => res.json())
    .then(projects => {
        updateStats(projects);
        loadAllCollaborators(projects);

        const list = document.getElementById('projectsList');
        if (projects.length === 0) {
        list.innerHTML = `
            <div class="text-center py-5">
            <i class="fas fa-folder fa-4x text-muted opacity-50 mb-3"></i>
            <p class="text-muted mb-2">No projects yet</p>
            <p class="text-muted-dark" style="font-size: 0.875rem;">Create a new project or join an existing one to get started</p>
            </div>
        `;
        return;
        }

        list.innerHTML = projects.map(p => `
        <div class="project-card mb-3">
            <div class="d-flex flex-column flex-lg-row align-items-start justify-content-between gap-3">
            <div class="flex-fill">
                <div class="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <h4 class="h6 fw-semibold mb-0">${p.name}</h4>
                ${p.owner._id === currentUserId ? '<span class="badge-owner">Owner</span>' : ''}
                </div>
                <div class="d-flex flex-wrap gap-3" style="font-size: 0.8rem;">
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-hashtag text-primary-custom"></i>
                    <span class="text-muted">Code: <span class="text-primary-custom fw-semibold">${p.code}</span></span>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-user text-blue"></i>
                    <span class="text-muted">${p.owner.username}</span>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-users text-green"></i>
                    <span class="text-muted">${p.collaborators.length} collaborator${p.collaborators.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="d-flex align-items-center gap-1">
                    <i class="fas fa-file text-pink"></i>
                    <span class="text-muted">${p.files.length} file${p.files.length !== 1 ? 's' : ''}</span>
                </div>
                </div>
            </div>
            <div class="d-flex gap-2">
                <button onclick="openProject('${p._id}')" class="btn neomorph-btn btn-sm px-3">Open</button>
                ${p.owner._id === currentUserId ? `
                <button onclick="deleteProject('${p._id}')" class="btn neomorph-btn btn-sm px-3 text-danger">
                    <i class="fas fa-trash"></i>
                </button>
                ` : `
                <button onclick="leaveProject('${p._id}')" class="btn neomorph-btn btn-sm px-3 text-muted">Leave</button>
                `}
            </div>
            </div>
        </div>
        `).join('');

        updateActivityFeed(projects);
    });
}

function updateActivityFeed(projects) {
    const activityFeed = document.getElementById('activityFeed');
    const activities = [];
    
    projects.forEach(p => {
    activities.push({
        icon: 'folder',
        color: 'primary',
        text: `Project "${p.name}" created`,
        time: 'Recently'
    });
    
    if (p.files.length > 0) {
        activities.push({
        icon: 'file',
        color: 'blue',
        text: `${p.files.length} files in "${p.name}"`,
        time: 'Active'
        });
    }
    });

    if (activities.length === 0) {
    activityFeed.innerHTML = '<div class="text-center py-5"><p class="text-muted" style="font-size: 0.875rem;">No recent activity</p></div>';
    return;
    }

    activityFeed.innerHTML = activities.slice(0, 6).map(a => `
    <div class="activity-item mb-2">
        <div class="d-flex align-items-start gap-2">
        <div class="activity-icon bg-${a.color}-subtle">
            <i class="fas fa-${a.icon} text-${a.color}" style="font-size: 0.75rem;"></i>
        </div>
        <div class="flex-fill">
            <p class="mb-1" style="font-size: 0.8rem;">${a.text}</p>
            <p class="text-muted-dark mb-0" style="font-size: 0.7rem;">${a.time}</p>
        </div>
        </div>
    </div>
    `).join('');
}

function updateLastActive() {
    document.getElementById('lastActive').textContent = 'Just now';
}
updateLastActive();
setInterval(updateLastActive, 60000);

loadProjects();

document.getElementById('createBtn').addEventListener('click', () => {
    createModal.show();
    setTimeout(() => document.getElementById('projectName').focus(), 300);
});

document.getElementById('joinBtn').addEventListener('click', () => {
    joinModal.show();
    setTimeout(() => otpInputs[0].focus(), 300);
});

document.getElementById('createForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('projectName').value;
    const objectives = document.getElementById('projectObjectives').value;

    try {
    const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, objectives })
    });

    const data = await res.json();
    if (res.ok) {
        window.location.href = `/editor/${data._id}`;
    }
    } catch (error) {
    console.error(error);
    }
});

document.getElementById('joinForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = Array.from(otpInputs).map(input => input.value).join('').toUpperCase();
    const errorDiv = document.getElementById('joinError');

    if (code.length !== 6) {
    errorDiv.textContent = 'Please enter all 6 characters';
    errorDiv.classList.remove('d-none');
    return;
    }

    try {
    const res = await fetch('/api/projects/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
    });

    const data = await res.json();
    if (res.ok) {
        window.location.href = `/editor/${data._id}`;
    } else {
        errorDiv.textContent = data.error;
        errorDiv.classList.remove('d-none');
    }
    } catch (error) {
    errorDiv.textContent = 'Connection error';
    errorDiv.classList.remove('d-none');
    }
});

function openProject(id) {
    window.location.href = `/editor/${id}`;
}

async function deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) return;
    
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    loadProjects();
}

async function leaveProject(id) {
    if (!confirm('Are you sure you want to leave this project?')) return;
    
    await fetch(`/api/projects/${id}/leave`, { method: 'POST' });
    loadProjects();
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    localStorage.removeItem('token');
    window.location.href = '/';
});




// Socket connection and online users tracking
socket.on('connect', () => {
  console.log('Connected to socket');
});

socket.on('global-users-update', (data) => {
  allOnlineUsers = new Set(data.onlineUserIds);
  updateOnlineUsersDisplay();
});

// Update online users count
function updateOnlineUsersDisplay() {
  document.getElementById('onlineUsers').textContent = allOnlineUsers.size;
}

// Load all unique collaborators from projects
function loadAllCollaborators(projects) {
  allCollaborators.clear();
  
  projects.forEach(project => {
    project.collaborators.forEach(collab => {
      if (collab._id !== currentUserId) {
        if (!allCollaborators.has(collab._id)) {
          allCollaborators.set(collab._id, {
            username: collab.username,
            projects: []
          });
        }
        allCollaborators.get(collab._id).projects.push(project.name);
      }
    });
  });
}

// Open online users modal
function openOnlineUsersModal() {
  const list = document.getElementById('onlineUsersList');
  
  if (allCollaborators.size === 0) {
    list.innerHTML = `
      <div class="text-center py-4">
        <i class="fas fa-user-friends fa-2x text-muted opacity-50 mb-2"></i>
        <p class="text-muted mb-0" style="font-size: 0.875rem;">No collaborators yet</p>
      </div>
    `;
  } else {
    const collaboratorsArray = Array.from(allCollaborators.entries());
    
    list.innerHTML = collaboratorsArray.map(([userId, data]) => {
    const isOnline = allOnlineUsers.has(userId);
    const unreadCount = unreadMessages.get(userId) || 0;
    
    return `
        <div class="d-flex align-items-center justify-content-between p-3 border-bottom" style="border-color: rgba(107, 107, 143, 0.1) !important;">
        <div class="d-flex align-items-center gap-3">
            <div class="position-relative">
            <div class="rounded-circle d-flex align-items-center justify-content-center" 
                style="width: 40px; height: 40px; background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));">
                <i class="fas fa-user text-white"></i>
            </div>
            ${isOnline ? `
                <span class="position-absolute bottom-0 end-0 rounded-circle" 
                    style="width: 12px; height: 12px; background: #22c55e; border: 2px solid var(--bg-color);"></span>
            ` : ''}
            ${unreadCount > 0 ? `
                <span class="notification-badge">${unreadCount}</span>
            ` : ''}
            </div>
            <div>
            <p class="mb-0 fw-semibold">${data.username}</p>
            <p class="mb-0 text-muted" style="font-size: 0.75rem;">
                ${isOnline ? 'Online' : 'Offline'} • ${data.projects.length} project${data.projects.length !== 1 ? 's' : ''}
            </p>
            </div>
        </div>
        <button 
            onclick="openChat('${userId}', '${data.username}')" 
            class="btn neomorph-btn btn-sm position-relative"
            ${!isOnline ? 'disabled' : ''}>
            <i class="fas fa-comment"></i> Message
            ${unreadCount > 0 ? `
            <span class="notification-badge">${unreadCount}</span>
            ` : ''}
        </button>
        </div>
    `;
    }).join('');
  }
  
  onlineUsersModal.show();
}

// Open chat head
function openChat(userId, username) {
      // Clear unread messages for this user
  if (unreadMessages.has(userId)) {
    unreadMessages.delete(userId);
    updateOnlineUsersBadge();
  }

  // Close modal
  onlineUsersModal.hide();
  
  // Check if chat already open
  if (openChats.has(userId)) {
    const existingChat = openChats.get(userId);
    existingChat.classList.remove('minimized');
    existingChat.scrollIntoView({ behavior: 'smooth', block: 'end' });
    return;
  }
  
  // Create chat head
  const chatHead = document.createElement('div');
  chatHead.className = 'chat-head';
  chatHead.innerHTML = `
    <div class="chat-header">
      <span class="chat-username">${username}</span>
      <div class="chat-actions">
        <button onclick="minimizeChat('${userId}')" class="chat-action-btn">
          <i class="fas fa-minus"></i>
        </button>
        <button onclick="closeChat('${userId}')" class="chat-action-btn">
          <i class="fas fa-times"></i>
        </button>
      </div>
    </div>
    <div class="chat-body" id="chatBody-${userId}">
      <div class="text-center py-3">
        <div class="spinner-border spinner-border-sm" role="status"></div>
      </div>
    </div>
    <div class="chat-footer">
      <form onsubmit="sendMessage(event, '${userId}')" class="d-flex gap-2">
        <input 
          type="text" 
          id="chatInput-${userId}"
          class="form-control form-control-sm" 
          placeholder="Type a message..."
          required
          autocomplete="off">
        <button type="submit" class="btn btn-sm neomorph-btn">
          <i class="fas fa-paper-plane"></i>
        </button>
      </form>
    </div>
  `;
  
  document.getElementById('chatHeadsContainer').appendChild(chatHead);
  openChats.set(userId, chatHead);
  
  // Load conversation
  loadConversation(userId);
  
  // Focus input
  setTimeout(() => {
    document.getElementById(`chatInput-${userId}`).focus();
  }, 100);
}

// Load conversation
async function loadConversation(userId) {
  try {
    const res = await fetch(`/api/messages/conversation/${userId}`);
    const messages = await res.json();
    
    const chatBody = document.getElementById(`chatBody-${userId}`);
    
    if (messages.length === 0) {
      chatBody.innerHTML = `
        <div class="text-center py-3">
          <p class="text-muted mb-0" style="font-size: 0.75rem;">No messages yet</p>
        </div>
      `;
    } else {
      chatBody.innerHTML = messages.map(msg => {
        const isSent = msg.sender._id === currentUserId;
        return `
          <div class="message ${isSent ? 'sent' : 'received'}">
            <div class="message-content">${escapeHtml(msg.content)}</div>
            <div class="message-time">${formatTime(msg.createdAt)}</div>
          </div>
        `;
      }).join('');
      
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    
    // Mark as read
    socket.emit('mark-read', { senderId: userId });

    // Clear unread count
    if (unreadMessages.has(userId)) {
        unreadMessages.delete(userId);
        updateOnlineUsersBadge();
    }
  } catch (error) {
    console.error('Error loading conversation:', error);
  }
}

// Send message
function sendMessage(event, receiverId) {
  event.preventDefault();
  
  const input = document.getElementById(`chatInput-${receiverId}`);
  const content = input.value.trim();
  
  if (!content) return;
  
  socket.emit('send-message', {
    receiverId,
    content
  });
  
  input.value = '';
}

// Minimize chat
function minimizeChat(userId) {
  const chat = openChats.get(userId);
  if (chat) {
    chat.classList.toggle('minimized');
  }
}

// Close chat
function closeChat(userId) {
  const chat = openChats.get(userId);
  if (chat) {
    chat.remove();
    openChats.delete(userId);
  }
}

// Socket listeners for messages
socket.on('message-sent', (data) => {
  const chatBody = document.getElementById(`chatBody-${data.receiver}`);
  if (chatBody) {
    appendMessage(chatBody, data.content, data.createdAt, true);
  }
});

socket.on('receive-message', (data) => {
  const senderId = data.sender._id;
  const senderUsername = data.sender.username;
  const chatBody = document.getElementById(`chatBody-${senderId}`);
  
  // If chat is open, append message
  if (chatBody) {
    appendMessage(chatBody, data.content, data.createdAt, false);
    socket.emit('mark-read', { senderId });
  } else {
    // Increment unread count
    const currentUnread = unreadMessages.get(senderId) || 0;
    unreadMessages.set(senderId, currentUnread + 1);
    
    // Update online users count badge
    updateOnlineUsersBadge();
    
    // Show toast notification
    showMessageToast(senderId, senderUsername, data.content);
  }
});

// Update online users badge
function updateOnlineUsersBadge() {
  const totalUnread = Array.from(unreadMessages.values()).reduce((sum, count) => sum + count, 0);
  
  const onlineUsersDiv = document.querySelector('#onlineUsers').parentElement;
  
  // Remove existing badge
  const existingBadge = onlineUsersDiv.querySelector('.notification-badge');
  if (existingBadge) {
    existingBadge.remove();
  }
  
  // Add new badge if there are unread messages
  if (totalUnread > 0) {
    const badge = document.createElement('span');
    badge.className = 'notification-badge';
    badge.textContent = totalUnread > 99 ? '99+' : totalUnread;
    badge.style.position = 'relative';
    badge.style.top = '-5px';
    badge.style.marginLeft = '5px';
    onlineUsersDiv.appendChild(badge);
  }
}

// Show toast notification
function showMessageToast(senderId, senderUsername, content) {
  // Create toast
  const toast = document.createElement('div');
  toast.className = 'message-toast';
  toast.innerHTML = `
    <div class="message-toast-header">
      <div class="message-toast-avatar">
        <i class="fas fa-user"></i>
      </div>
      <div class="flex-fill">
        <div class="fw-semibold">${senderUsername}</div>
        <div class="message-toast-time">Just now</div>
      </div>
    </div>
    <div class="message-toast-content">
      ${escapeHtml(content).substring(0, 60)}${content.length > 60 ? '...' : ''}
    </div>
  `;
  
  // Click to open chat
  toast.onclick = () => {
    openChat(senderId, senderUsername);
    toast.remove();
  };
  
  document.body.appendChild(toast);
  
  // Auto remove after 5 seconds
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
  
  // Play notification sound (optional)
  playNotificationSound();
}

// Optional: Play notification sound
function playNotificationSound() {
  // Create a subtle beep sound using Web Audio API
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (e) {
    // Silently fail if audio not supported
  }
}

// Helper to append message
function appendMessage(chatBody, content, timestamp, isSent) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
  messageDiv.innerHTML = `
    <div class="message-content">${escapeHtml(content)}</div>
    <div class="message-time">${formatTime(timestamp)}</div>
  `;
  
  chatBody.appendChild(messageDiv);
  chatBody.scrollTop = chatBody.scrollHeight;
}

// Utility functions
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString();
}