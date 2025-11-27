let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let editor = null;
let projectId = null;
let projectData = null;
let socket = null;
let currentUser = null;
let remoteCursors = new Map(); // userId -> cursor widget
let isRemoteChange = false;
let cursorThrottle = null;
let allCollaborators = [];
let onlineUsers = [];
let isOwner = false;

let groupMessages = [];
let isGroupChatOpen = false;
let collaboratorColors = new Map(); // userId -> color
let unreadMessageCount = 0;

const userColors = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', 
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'
];

const defaultCode = {
    javascript: '// JavaScript Example\nfunction greet(name) {\n    console.log("Hello, " + name + "!");\n}\n\ngreet("World");',
    python: '# Python Example\ndef greet(name):\n    print(f"Hello, {name}!")\n\ngreet("World")',
    htmlmixed: '<!DOCTYPE html>\n<html>\n<head>\n    <title>My Project</title>\n    <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n    <h1>Hello World!</h1>\n    <button id="myBtn">Click Me</button>\n    <script src="app.js"></script>\n</body>\n</html>',
    css: '/* CSS Example */\nbody {\n    background-color: #f0f0f0;\n    font-family: Arial, sans-serif;\n}\n\nh1 {\n    color: #333;\n    text-align: center;\n}',
    'application/json': '{\n    "name": "John Doe",\n    "age": 30,\n    "email": "john@example.com",\n    "address": {\n        "street": "123 Main St",\n        "city": "New York",\n        "country": "USA"\n    },\n    "hobbies": ["reading", "coding", "gaming"]\n}',
    xml: '<?xml version="1.0" encoding="UTF-8"?>\n<note>\n    <to>User</to>\n    <from>Editor</from>\n    <message>Hello World!</message>\n</note>',
    php: '<?php\n// PHP Example\n$name = "World";\necho "Hello, " . $name . "!";\n?>',
    sql: '-- SQL Example\nSELECT * FROM users\nWHERE age > 18\nORDER BY name ASC;',
    markdown: '# Markdown Example\n\n## Features\n\n- **Bold text**\n- *Italic text*\n- [Links](https://example.com)\n\n```javascript\nconsole.log("Code blocks!");\n```'
};

const languageNames = {
    javascript: 'JavaScript',
    python: 'Python',
    htmlmixed: 'HTML',
    css: 'CSS',
    'application/json': 'JSON',
    xml: 'XML',
    php: 'PHP',
    sql: 'SQL',
    markdown: 'Markdown'
};

const extensions = {
    javascript: 'js',
    python: 'py',
    htmlmixed: 'html',
    css: 'css',
    'application/json': 'json',
    xml: 'xml',
    php: 'php',
    sql: 'sql',
    markdown: 'md'
};

function getProjectId() {
    const path = window.location.pathname;
    const match = path.match(/\/editor\/([a-f0-9]+)/);
    return match ? match[1] : null;
}

projectId = getProjectId();

// Initialize Socket.IO
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        // Join project only if it's already loaded
        if (projectId && projectData) {
            socket.emit('join-project', projectId);
        }
    });

    socket.on('users-update', (data) => {
        onlineUsers = data.onlineUsers;
        allCollaborators = data.allCollaborators;
        
        // Check if current user is owner (only if currentUser is loaded)
        if (currentUser && currentUser._id && data.owner && data.owner._id) {
            isOwner = data.owner._id === currentUser._id;
        }
        updateCollaboratorsUI();
        
        // Remove cursors for users who went offline
        const onlineUserIds = new Set(onlineUsers.map(u => u.userId));
        remoteCursors.forEach((cursor, userId) => {
            if (!onlineUserIds.has(userId)) {
                removeCursor(userId);
            }
        });
    });

    socket.on('user-left', (data) => {
        onlineUsers = data.onlineUsers;
        updateCollaboratorsUI();
        removeCursor(data.user.id);
    });

    socket.on('remote-code-change', (data) => {
        if (data.fileId === activeTabId) {
            applyRemoteChange(data);
        }
        
        // Update the tab's code
        const tab = tabs.find(t => t.id === data.fileId);
        if (tab) {
            tab.code = data.code;
        }
    });

    socket.on('remote-cursor-move', (data) => {
        if (data.fileId === activeTabId) {
            updateRemoteCursor(data.user, data.line, data.ch);
        }
    });

    socket.on('remote-file-switch', (data) => {
        
        // Find the file name
        const file = tabs.find(t => t.id === data.fileId);
        const fileName = file ? file.name : 'a file';
        
        showToast(
            '📁 File Switch',
            `${data.user.username} switched to ${fileName}`,
            'info'
        );
    });

    socket.on('removed-from-project', (data) => {
        let countdown = 5;
        
        // Disable editor
        editor.setOption('readOnly', true);
        
        // Show initial toast
        showToast(
            '⚠️ Removed from Project',
            `You have been removed from this project. Redirecting in ${countdown} seconds...`,
            'danger'
        );
        
        // Update countdown every second
        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                showToast(
                    '⚠️ Removed from Project',
                    `You have been removed from this project. Redirecting in ${countdown} seconds...`,
                    'danger'
                );
            } else {
                clearInterval(countdownInterval);
                window.location.href = '/dashboard';
            }
        }, 1000);
    });

    // Socket event: receive group message
    socket.on('receive-group-message', (message) => {
        groupMessages.push(message);
        
        const body = document.getElementById('groupChatBody');
        const messageEl = createGroupMessageElement(message);
        body.appendChild(messageEl);
        body.scrollTop = body.scrollHeight;
        
        // Check if chat is closed or minimized
        // Check if chat is BOTH visible AND expanded (not minimized)
        const chatHead = document.getElementById('groupChatHead');
        const isChatOpen = chatHead.style.display !== 'none' && 
                        !chatHead.classList.contains('minimized');

        // Only increment unread count if message is from another user and chat is NOT fully open
        if (currentUser && message.sender._id !== currentUser._id && !isChatOpen) {
            unreadMessageCount++;
            updateUnreadBadge();
            playNotificationSound();
            showToast(
                '💬 New Message',
                `${message.sender.username}: ${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}`,
                'info'
            );
        }
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data);
        alert('Error: ' + data.message);
    });

    socket.on('disconnect', () => {
        showToast('⚠️ Disconnected', 'You have been disconnected from the server.', 'warning');
    });
}

async function getCurrentUser() {
    try {
        const res = await fetch('/api/auth/current-user');
        if (res.ok) {
            currentUser = await res.json();
        } else {
            console.error('Failed to get current user, status:', res.status);
            const errorText = await res.text();
        }
    } catch (error) {
        console.error('Failed to get current user:', error);
    }
}

async function loadProject() {
    
    if (!projectId) {
        console.error('ERROR: No project ID found in URL');
        alert('Invalid project URL');
        window.location.href = '/dashboard';
        return;
    }
    
    const apiUrl = `/api/projects/${projectId}`;
    console.log('API URL:', apiUrl);
    
    try {
        const res = await fetch(apiUrl);
        console.log('Response received:', {
            status: res.status,
            statusText: res.statusText,
            ok: res.ok
        });
        
        const responseText = await res.text();
        
        if (responseText.trim().startsWith('<')) {
            console.error('ERROR: Received HTML instead of JSON');
            alert('Server returned an error page. Check console for details.');
            return;
        }
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            showToast('⚠️ Error', parseError, 'danger');
            return;
        }
        
        if (res.ok) {
            projectData = data;
            
            document.getElementById('projectName').textContent = data.name;
            document.getElementById('projectCode').textContent = data.code;
            document.title = `${data.name} - TACollab Editor | Real-time Collaborative Code Editor`;
            
            // Check if current user is owner (only if currentUser is loaded)
            if (currentUser && currentUser._id) {
                isOwner = data.owner._id === currentUser._id;
            }
            allCollaborators = data.collaborators;
            
            tabs = [];
            tabCounter = 0;
            
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                data.files.forEach((file, index) => {
                    const id = ++tabCounter;
                    // console.log(`File ${index + 1}:`, {
                    //     id,
                    //     name: file.name,
                    //     language: file.language,
                    //     codeLength: file.code?.length || 0
                    // });
                    
                    tabs.push({
                        id: id,
                        name: file.name,
                        language: file.language,
                        code: file.code || ''
                    });
                });
                
                renderTabs();
                switchToTab(tabs[0].id);
                // Inside loadProject(), after successfully loading project data, add:
                assignCollaboratorColors();
                initGroupChat();
            } else {
                createTab('javascript', 'untitled.js', '');
            }
            
            // IMPORTANT: Join the project room after loading project data
            if (socket && socket.connected) {
                socket.emit('join-project', projectId);
            } else {
                showToast('⚠️ Error', 'Socket not connected, cannot join project', 'danger');
            }
            
        } else {
            showToast('⚠️ Error', 'Failed to load project: ' + (data.error || 'Unknown error'), 'danger');

            setTimeout(() => {
                window.location.href = '/dashboard';
            }, 3000);
        }
    } catch (error) {
        showToast('⚠️ Error', 'Failed to load project: ' + error.message, 'danger');
    }
}

function initEditor() {
    editor = CodeMirror.fromTextArea(document.getElementById('codeEditor'), {
        mode: 'javascript',
        theme: 'monokai',
        lineNumbers: true,
        autoCloseBrackets: true,
        matchBrackets: true,
        indentUnit: 4,
        tabSize: 4,
        lineWrapping: true,
        extraKeys: {
            "Ctrl-Space": "autocomplete",
            "Ctrl-/": "toggleComment"
        },
        hintOptions: {
            completeSingle: false,
            closeOnUnfocus: true,
            alignWithWord: true
        }
    });

    editor.on("inputRead", function(cm, change) {
        const mode = cm.getMode().name;
        if (change.text[0] && /[a-zA-Z<\.]/.test(change.text[0])) {
            if (mode === "javascript" || mode === "css" || mode === "htmlmixed" || mode === "xml") {
                cm.showHint({completeSingle: false});
            }
        }
    });

    // Handle local code changes
    editor.on("change", function(cm, change) {
        if (activeTabId !== null) {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) {
                tab.code = editor.getValue();
            }
            
            // Broadcast change to other users (if not a remote change)
            if (!isRemoteChange && socket && change.origin !== 'setValue') {
                socket.emit('code-change', {
                    projectId: projectId,
                    fileId: activeTabId,
                    code: editor.getValue(),
                    from: change.from,
                    to: change.to,
                    text: change.text
                });
            }
        }
    });

    // Handle cursor movement (throttled)
    editor.on("cursorActivity", function(cm) {
        if (socket && activeTabId !== null && !isRemoteChange) {
            clearTimeout(cursorThrottle);
            cursorThrottle = setTimeout(() => {
                const cursor = cm.getCursor();
                socket.emit('cursor-move', {
                    projectId: projectId,
                    fileId: activeTabId,
                    line: cursor.line,
                    ch: cursor.ch
                });
            }, 100);
        }
    });
}

function applyRemoteChange(data) {
    isRemoteChange = true;
    
    // Simple approach: replace entire document
    const currentCursor = editor.getCursor();
    editor.setValue(data.code);
    
    // Try to maintain cursor position if possible
    try {
        editor.setCursor(currentCursor);
    } catch (e) {
        // Cursor position might be invalid after change
    }
    
    isRemoteChange = false;
}

function updateRemoteCursor(user, line, ch) {
    const userId = user.id;
    let cursor = remoteCursors.get(userId);
    
    if (!cursor) {
        // Create new cursor
        const color = getUserColor(userId);
        const cursorEl = document.createElement('div');
        cursorEl.className = 'remote-cursor';
        cursorEl.style.backgroundColor = color;
        
        const labelEl = document.createElement('div');
        labelEl.className = 'remote-cursor-label';
        labelEl.textContent = user.username;
        labelEl.style.backgroundColor = color;
        cursorEl.appendChild(labelEl);
        
        cursor = {
            element: cursorEl,
            widget: null
        };
        remoteCursors.set(userId, cursor);
    }
    
    // Remove old widget if exists
    if (cursor.widget) {
        cursor.widget.clear();
    }
    
    // Add new widget at new position
    try {
        cursor.widget = editor.addWidget(
            { line: line, ch: ch },
            cursor.element,
            false
        );
    } catch (e) {
        console.error('Error positioning cursor:', e);
    }
}

function removeCursor(userId) {
    const cursor = remoteCursors.get(userId);
    if (cursor && cursor.widget) {
        cursor.widget.clear();
        remoteCursors.delete(userId);
    }
}

function getUserColor(userId) {
    // Generate consistent color for user
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return userColors[Math.abs(hash) % userColors.length];
}

function createTab(language = 'javascript', name = null, code = null) {
    const id = ++tabCounter;
    const tabName = name || `${languageNames[language]}-${id}.${extensions[language]}`;
    
    const tab = {
        id: id,
        name: tabName,
        language: language,
        code: code || defaultCode[language] || ''
    };
    
    tabs.push(tab);
    renderTabs();
    switchToTab(id);
}

function renderTabs() {
    const container = document.getElementById('tabsContainer');
    container.innerHTML = '';

    tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
        tabEl.innerHTML = `
            <span class="tab-name" title="${tab.name}">${tab.name}</span>
            <span class="tab-close">×</span>
        `;
        
        tabEl.querySelector('.tab-name').addEventListener('click', () => switchToTab(tab.id));
        tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });
        
        container.appendChild(tabEl);
    });

    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'new-tab-btn';
    newTabBtn.innerHTML = '<i class="fa-regular fa-square-plus"></i>';
    newTabBtn.addEventListener('click', () => {
        const language = document.getElementById('languageSelect').value;
        createTab(language);
    });
    container.appendChild(newTabBtn);
}

function switchToTab(id) {
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    activeTabId = id;
    isRemoteChange = true;
    editor.setValue(tab.code);
    isRemoteChange = false;
    
    editor.setOption('mode', tab.language);
    document.getElementById('languageSelect').value = tab.language;
    
    const formatBtn = document.getElementById('formatBtn');
    formatBtn.style.display = tab.language === 'application/json' ? 'inline-block' : 'none';
    
    // Clear remote cursors when switching files
    remoteCursors.forEach((cursor, userId) => {
        if (cursor.widget) {
            cursor.widget.clear();
        }
    });
    remoteCursors.clear();
    
    // Notify other users about file switch
    if (socket) {
        socket.emit('file-switch', {
            projectId: projectId,
            fileId: id
        });
    }
    
    renderTabs();
}

function closeTab(id) {
    const index = tabs.findIndex(t => t.id === id);
    if (index === -1) return;

    tabs.splice(index, 1);

    if (tabs.length === 0) {
        createTab('javascript');
    } else if (activeTabId === id) {
        const newActiveIndex = Math.min(index, tabs.length - 1);
        switchToTab(tabs[newActiveIndex].id);
    } else {
        renderTabs();
    }
}

async function saveProject() {
    const files = tabs.map(tab => ({
        name: tab.name,
        language: tab.language,
        code: tab.code
    }));

    try {
        const res = await fetch(`/api/projects/${projectId}/files`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files })
        });

        if (res.ok) {
            showToast("Success", "Project saved successfully!", "success");
            const btn = document.getElementById('saveBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
            setTimeout(() => btn.innerHTML = originalText, 2000);
        } else {
            const errorData = await res.text();
            showToast('Error', 'Failed to save project: '+ errorData, 'danger');
        }
    } catch (error) {
        showToast('Error', 'Failed to save project: ' + error, 'danger');
    }
}

// Collaborators UI
function updateCollaboratorsUI() {
    const dropdown = document.getElementById('collaboratorsDropdown');
    const countEl = document.getElementById('collaboratorCount');
    
    if (!dropdown) {
        console.error('ERROR: collaboratorsDropdown element not found!');
        return;
    }
    
    if (!countEl) {
        console.error('ERROR: collaboratorCount element not found!');
        return;
    }
    
    countEl.textContent = allCollaborators.length;
    dropdown.innerHTML = '';
    
    
    allCollaborators.forEach((collaborator, index) => {
        
        const isOnline = onlineUsers.some(u => u.userId === collaborator._id);
        const isCollaboratorOwner = projectData && projectData.owner && projectData.owner._id === collaborator._id;
        const canRemove = isOwner && !isCollaboratorOwner && currentUser && currentUser._id !== collaborator._id;
        
        //console.log(`  - Online: ${isOnline}, Is owner: ${isCollaboratorOwner}, Can remove: ${canRemove}`);
        
        const item = document.createElement('div');
        item.className = 'collaborator-item';
        
        item.innerHTML = `
            <div class="status-indicator ${isOnline ? 'online' : 'offline'}"></div>
            <div class="collaborator-name">${collaborator.username}</div>
            ${isCollaboratorOwner ? '<span class="collaborator-badge">Owner</span>' : ''}
            ${canRemove ? `<button class="remove-btn" data-user-id="${collaborator._id}">Remove</button>` : ''}
        `;
        
        dropdown.appendChild(item);
    });
    
    // Add event listeners to remove buttons
    dropdown.querySelectorAll('.remove-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const userId = e.target.getAttribute('data-user-id');
            await removeCollaborator(userId);
        });
    });
}

async function removeCollaborator(userId) {
    if (!confirm('Are you sure you want to remove this collaborator?')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/projects/${projectId}/collaborators/${userId}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            const data = await res.json();
            
            // Notify socket to disconnect the user
            socket.emit('collaborator-removed', {
                projectId: projectId,
                removedUserId: userId
            });
            
            // Reload project to update collaborators list
            await loadProject();
        } else {
            const error = await res.json();
            alert('Failed to remove collaborator: ' + error.error);
        }
    } catch (error) {
        console.error('Error removing collaborator:', error);
        alert('Failed to remove collaborator');
    }
}

// Toggle collaborators dropdown
document.getElementById('collaboratorsBtn').addEventListener('click', () => {
    const dropdown = document.getElementById('collaboratorsDropdown');
    dropdown.classList.toggle('show');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const container = document.querySelector('.collaborators-container');
    const dropdown = document.getElementById('collaboratorsDropdown');
    
    if (container && !container.contains(e.target)) {
        dropdown.classList.remove('show');
    }
});

document.getElementById('saveBtn').addEventListener('click', saveProject);

document.getElementById('languageSelect').addEventListener('change', function() {
    if (activeTabId === null) return;
    
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    
    const mode = this.value;
    const oldExtension = extensions[tab.language];
    const newExtension = extensions[mode];
    
    // Update file name
    if (tab.name.endsWith('.' + oldExtension)) {
        tab.name = tab.name.slice(0, -oldExtension.length) + newExtension;
    } else {
        tab.name = tab.name.replace(/\.[^.]+$/, '') + '.' + newExtension;
    }
    
    // Update language
    tab.language = mode;
    
    // Set default code for the new language
    const newCode = defaultCode[mode] || '';
    tab.code = newCode;
    isRemoteChange = true;
    editor.setValue(newCode);
    isRemoteChange = false;
    
    editor.setOption('mode', mode);
    
    const formatBtn = document.getElementById('formatBtn');
    formatBtn.style.display = mode === 'application/json' ? 'inline-block' : 'none';
    
    renderTabs();
});

document.getElementById('renameBtn').addEventListener('click', function() {
    if (activeTabId === null) return;
    
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    
    // Set current file name in the input
    document.getElementById('newFileName').value = tab.name;
    
    // Show the modal
    const renameModal = new bootstrap.Modal(document.getElementById('renameModal'));
    renameModal.show();
    
    // Focus on input after modal is shown
    document.getElementById('renameModal').addEventListener('shown.bs.modal', function() {
        const input = document.getElementById('newFileName');
        input.focus();
        // Select filename without extension
        const dotIndex = tab.name.lastIndexOf('.');
        if (dotIndex > 0) {
            input.setSelectionRange(0, dotIndex);
        } else {
            input.select();
        }
    }, { once: true });
});

// Handle rename confirmation
document.getElementById('confirmRename').addEventListener('click', function() {
    if (activeTabId === null) return;
    
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    
    const newName = document.getElementById('newFileName').value.trim();
    
    if (!newName) {
        alert('Please enter a valid file name');
        return;
    }
    
    // Update tab name
    tab.name = newName;
    renderTabs();
    
    // Close the modal
    const renameModal = bootstrap.Modal.getInstance(document.getElementById('renameModal'));
    renameModal.hide();
    
    // Optional: Show success feedback
    const btn = document.getElementById('renameBtn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-check"></i>';
    setTimeout(() => btn.innerHTML = originalHTML, 1500);
});

// Handle Enter key in rename form
document.getElementById('renameForm').addEventListener('submit', function(e) {
    e.preventDefault();
    document.getElementById('confirmRename').click();
});

document.getElementById('themeSelect').addEventListener('change', function() {
    editor.setOption('theme', this.value);
});

document.getElementById('formatBtn').addEventListener('click', function() {
    const code = editor.getValue();
    const output = document.getElementById('output');
    
    try {
        const parsed = JSON.parse(code);
        const formatted = JSON.stringify(parsed, null, 4);
        editor.setValue(formatted);
        
        if (activeTabId !== null) {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) tab.code = formatted;
        }
        
        output.innerHTML = '<span style="color: #10b981;">✓ JSON formatted successfully!</span>';
        
        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Done!';
        setTimeout(() => btn.innerHTML = originalText, 2000);
    } catch (error) {
        output.innerHTML = '<span style="color: #ef4444;">✗ Invalid JSON: ' + error.message + '</span>';
    }
});

function extractLinkedFiles(htmlCode) {
    const linkedFiles = { css: [], js: [] };
    
    const cssLinkRegex = /<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi;
    let match;
    while ((match = cssLinkRegex.exec(htmlCode)) !== null) {
        linkedFiles.css.push(match[1]);
    }
    
    const jsScriptRegex = /<script[^>]*src=["']([^"']+\.js)["'][^>]*>/gi;
    while ((match = jsScriptRegex.exec(htmlCode)) !== null) {
        linkedFiles.js.push(match[1]);
    }
    
    return linkedFiles;
}

function injectFilesIntoHTML(htmlCode, linkedFiles) {
    let modifiedHTML = htmlCode;
    
    if (linkedFiles.css.length > 0) {
        let cssInjection = '\n';
        linkedFiles.css.forEach(cssFile => {
            const cssTab = tabs.find(t => t.name === cssFile || t.name.endsWith('/' + cssFile));
            if (cssTab && cssTab.language === 'css') {
                cssInjection += `<style>\n/* Injected from ${cssFile} */\n${cssTab.code}\n</style>\n`;
            }
        });
        
        if (modifiedHTML.match(/<\/head>/i)) {
            modifiedHTML = modifiedHTML.replace(/<\/head>/i, cssInjection + '</head>');
        } else if (modifiedHTML.match(/<head[^>]*>/i)) {
            modifiedHTML = modifiedHTML.replace(/<head[^>]*>/i, (match) => match + cssInjection);
        } else {
            modifiedHTML = cssInjection + modifiedHTML;
        }
    }
    
    if (linkedFiles.js.length > 0) {
        let jsInjection = '\n';
        linkedFiles.js.forEach(jsFile => {
            const jsTab = tabs.find(t => t.name === jsFile || t.name.endsWith('/' + jsFile));
            if (jsTab && jsTab.language === 'javascript') {
                jsInjection += `<script>\n// Injected from ${jsFile}\n${jsTab.code}\n</script>\n`;
            }
        });
        
        if (modifiedHTML.match(/<\/body>/i)) {
            modifiedHTML = modifiedHTML.replace(/<\/body>/i, jsInjection + '</body>');
        } else {
            modifiedHTML = modifiedHTML + jsInjection;
        }
    }
    
    return modifiedHTML;
}

document.getElementById('runBtn').addEventListener('click', function() {
    const code = editor.getValue();
    const output = document.getElementById('output');
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    
    const language = tab.language;

    if (language === 'javascript') {
        const logs = [];
        const originalLog = console.log;
        console.log = function(...args) {
            logs.push(args.join(' '));
            originalLog.apply(console, args);
        };

        try {
            eval(code);
            output.innerHTML = logs.length > 0 ? logs.join('\n') : '<span style="color: #10b981;">✓ Code executed successfully (no output)</span>';
        } catch (error) {
            output.innerHTML = '<span style="color: #ef4444;">✗ Error: ' + error.message + '</span>';
        } finally {
            console.log = originalLog;
        }
    } else if (language === 'htmlmixed') {
        const linkedFiles = extractLinkedFiles(code);
        const modifiedHTML = injectFilesIntoHTML(code, linkedFiles);
        
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'width:100%; height:100%; min-height:50vh; background:white; border:none; border-radius:8px; margin-top:10px;';
        iframe.srcdoc = modifiedHTML;
        
        output.innerHTML = '';
        output.appendChild(iframe);
    } else if (language === 'application/json') {
        try {
            const parsed = JSON.parse(code);
            output.innerHTML = '<span style="color: #10b981;">✓ Valid JSON</span>\n\n' + JSON.stringify(parsed, null, 2);
        } catch (error) {
            output.innerHTML = '<span style="color: #ef4444;">✗ Invalid JSON: ' + error.message + '</span>';
        }
    } else {
        output.innerHTML = '<span style="color: #f59e0b;">⚠ Run feature supports JavaScript, HTML, and JSON validation</span>';
    }
});

document.getElementById('clearBtn').addEventListener('click', function() {
    editor.setValue('');
    if (activeTabId !== null) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) tab.code = '';
    }
    document.getElementById('output').innerHTML = '<span style="color: #888;">Code cleared. Ready for new code...</span>';
});

document.getElementById('copyBtn').addEventListener('click', function() {
    const code = editor.getValue();
    navigator.clipboard.writeText(code).then(() => {
        const btn = this;
        const originalText = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        setTimeout(() => btn.innerHTML = originalText, 2000);
    });
});

document.getElementById('downloadBtn').addEventListener('click', function() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    
    const code = tab.code;
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tab.name;
    a.click();
    URL.revokeObjectURL(url);
    
    const btn = this;
    const originalText = btn.innerHTML;
    btn.innerHTML = '✓ Saved!';
    setTimeout(() => btn.innerHTML = originalText, 2000);
});

// Initialize everything
initEditor();

// Properly wait for current user before loading project
getCurrentUser().then(() => {
    initSocket();
    return loadProject();
}).catch(error => {
    showToast('Failed to initialize editor: ' + error.message);
});

// Assign colors to collaborators
function assignCollaboratorColors() {
    collaboratorColors.clear();
    allCollaborators.forEach((collab, index) => {
        collaboratorColors.set(collab._id, userColors[index % userColors.length]);
    });
}

// Initialize group chat
function initGroupChat() {
    const chatHead = document.getElementById('groupChatHead');
    chatHead.style.display = 'flex';
    
    // Load previous messages
    loadGroupMessages();
    
    // Close chat
    document.getElementById('closeGroupChat').addEventListener('click', (e) => {
        e.stopPropagation();
        isGroupChatOpen = false;
        chatHead.style.display = 'none';
    });
    
    // Click header to toggle minimize
    document.getElementById('groupChatHeader').addEventListener('click', () => {
        // chatHead.classList.toggle('minimized');
                const chatHead = document.getElementById('groupChatHead');
        const wasMinimized = chatHead.classList.contains('minimized');
        chatHead.classList.toggle('minimized');
        
        // Clear badge when expanding
        if (wasMinimized) {
            clearUnreadMessages();
        }
    });
    
    // Send message
    document.getElementById('groupChatForm').addEventListener('submit', (e) => {
        e.preventDefault();
        sendGroupMessage();
    });
}

// Load previous messages
async function loadGroupMessages() {
    try {
        const res = await fetch(`/api/group-messages/${projectId}`);
        if (res.ok) {
            groupMessages = await res.json();
            renderGroupMessages();
        }
    } catch (error) {
        console.error('Failed to load group messages:', error);
    }
}

// Send group message
function sendGroupMessage() {
    const input = document.getElementById('groupChatInput');
    const content = input.value.trim();
    
    if (!content || !socket) return;
    
    socket.emit('send-group-message', {
        projectId: projectId,
        content: content
    });
    
    input.value = '';
}

// Render group messages
function renderGroupMessages() {
    const body = document.getElementById('groupChatBody');
    body.innerHTML = '';
    
    groupMessages.forEach(message => {
        const messageEl = createGroupMessageElement(message);
        body.appendChild(messageEl);
    });
    
    // Scroll to bottom
    body.scrollTop = body.scrollHeight;
}

// Create message element
function createGroupMessageElement(message) {
    const isOwn = currentUser && message.sender._id === currentUser._id;
    const senderColor = collaboratorColors.get(message.sender._id) || '#888';
    
    const messageEl = document.createElement('div');
    messageEl.className = 'group-message' + (isOwn ? ' own' : '');
    
    const time = new Date(message.createdAt).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    
    messageEl.innerHTML = `
        ${!isOwn ? `
            <div class="group-message-sender" style="color: ${senderColor}">
                <span class="sender-dot" style="background: ${senderColor}"></span>
                ${message.sender.username}
            </div>
        ` : ''}
        <div class="group-message-content" style="border-left-color: ${senderColor}">
            ${escapeHtml(message.content)}
        </div>
        <div class="group-message-time">${time}</div>
    `;
    
    return messageEl;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.getElementById('toggleGroupChat').addEventListener('click', () => {
    const chatHead = document.getElementById('groupChatHead');
    isGroupChatOpen = !isGroupChatOpen;
    
    if (isGroupChatOpen) {
        chatHead.style.display = 'flex';
        chatHead.classList.remove('minimized');
        clearUnreadMessages();
    } else {
        chatHead.style.display = 'none';
    }
});

// Show Bootstrap Toast
function showToast(title, message, type = 'info') {
    const toastEl = document.getElementById('notificationToast');
    const toastTitle = document.getElementById('toastTitle');
    const toastBody = document.getElementById('toastBody');
    const toastHeader = toastEl.querySelector('.toast-header');
    
    // Set colors based on type
    const colors = {
        'info': 'bg-primary text-white',
        'success': 'bg-success text-white',
        'warning': 'bg-warning text-dark',
        'danger': 'bg-danger text-white'
    };
    
    toastHeader.className = 'toast-header ' + (colors[type] || colors.info);
    toastTitle.textContent = title;
    toastBody.textContent = message;
    
    const toast = new bootstrap.Toast(toastEl, { autohide: true, delay: 4000 });
    toast.show();
}

// Play notification sound
function playNotificationSound() {
    const audio = document.getElementById('notificationSound');
    audio.play().catch(err => console.log('Audio play failed:', err));
}

// Update unread badge
function updateUnreadBadge() {
    const badge = document.getElementById('unreadBadge');
    if (unreadMessageCount > 0) {
        badge.textContent = unreadMessageCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

// Clear unread count when chat is opened
function clearUnreadMessages() {
    unreadMessageCount = 0;
    updateUnreadBadge();
}