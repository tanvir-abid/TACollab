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
    console.log('Initializing Socket.IO connection...');
    socket = io();

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        // Join project only if it's already loaded
        if (projectId && projectData) {
            console.log('Socket reconnected, rejoining project:', projectId);
            socket.emit('join-project', projectId);
        }
    });

    socket.on('users-update', (data) => {
        console.log('Users update received:', data);
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
        console.log('User left:', data.user);
        onlineUsers = data.onlineUsers;
        updateCollaboratorsUI();
        removeCursor(data.user.id);
    });

    socket.on('remote-code-change', (data) => {
        console.log('Remote code change:', data);
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
        console.log('Remote user switched file:', data.user.username, 'to file', data.fileId);
        // You could show a notification here if desired
    });

    socket.on('removed-from-project', (data) => {
        alert('You have been removed from this project');
        window.location.href = '/dashboard';
    });

    socket.on('error', (data) => {
        console.error('Socket error:', data);
        alert('Error: ' + data.message);
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected');
    });
}

async function getCurrentUser() {
    try {
        const res = await fetch('/api/auth/current-user');
        if (res.ok) {
            currentUser = await res.json();
            console.log('Current user:', currentUser);
        } else {
            console.error('Failed to get current user, status:', res.status);
            const errorText = await res.text();
            console.error('Error response:', errorText);
        }
    } catch (error) {
        console.error('Failed to get current user:', error);
    }
}

async function loadProject() {
    console.log('=== STARTING PROJECT LOAD ===');
    console.log('Project ID:', projectId);
    
    if (!projectId) {
        console.error('ERROR: No project ID found in URL');
        alert('Invalid project URL');
        window.location.href = '/dashboard';
        return;
    }
    
    const apiUrl = `/api/projects/${projectId}`;
    console.log('API URL:', apiUrl);
    
    try {
        console.log('Fetching project data...');
        const res = await fetch(apiUrl);
        console.log('Response received:', {
            status: res.status,
            statusText: res.statusText,
            ok: res.ok
        });
        
        const responseText = await res.text();
        console.log('Raw response (first 500 chars):', responseText.substring(0, 500));
        
        if (responseText.trim().startsWith('<')) {
            console.error('ERROR: Received HTML instead of JSON');
            alert('Server returned an error page. Check console for details.');
            return;
        }
        
        let data;
        try {
            data = JSON.parse(responseText);
            console.log('Successfully parsed JSON:', data);
        } catch (parseError) {
            console.error('ERROR: Failed to parse response as JSON:', parseError);
            alert('Invalid response from server.');
            return;
        }
        
        if (res.ok) {
            console.log('=== PROJECT DATA SUCCESSFULLY LOADED ===');
            projectData = data;
            
            document.getElementById('projectName').textContent = data.name;
            document.getElementById('projectCode').textContent = data.code;
            
            // Check if current user is owner (only if currentUser is loaded)
            if (currentUser && currentUser._id) {
                isOwner = data.owner._id === currentUser._id;
                console.log('Is owner:', isOwner);
            }
            allCollaborators = data.collaborators;
            console.log('All collaborators:', allCollaborators);
            
            tabs = [];
            tabCounter = 0;
            
            if (data.files && Array.isArray(data.files) && data.files.length > 0) {
                console.log(`Loading ${data.files.length} files from project...`);
                data.files.forEach((file, index) => {
                    const id = ++tabCounter;
                    console.log(`File ${index + 1}:`, {
                        id,
                        name: file.name,
                        language: file.language,
                        codeLength: file.code?.length || 0
                    });
                    
                    tabs.push({
                        id: id,
                        name: file.name,
                        language: file.language,
                        code: file.code || ''
                    });
                });
                
                renderTabs();
                switchToTab(tabs[0].id);
                console.log('=== PROJECT LOAD COMPLETE ===');
            } else {
                console.log('No files found, creating default tab');
                createTab('javascript', 'untitled.js', '');
            }
            
            // IMPORTANT: Join the project room after loading project data
            if (socket && socket.connected) {
                console.log('Emitting join-project event for project:', projectId);
                socket.emit('join-project', projectId);
            } else {
                console.error('Socket not connected, cannot join project');
            }
            
        } else {
            console.error('=== API ERROR ===');
            console.error('Error data:', data);
            alert('Failed to load project: ' + (data.error || 'Unknown error'));
            window.location.href = '/dashboard';
        }
    } catch (error) {
        console.error('=== EXCEPTION DURING PROJECT LOAD ===');
        console.error('Error:', error);
        alert('Failed to load project: ' + error.message);
    }
}

function initEditor() {
    console.log('Initializing CodeMirror editor...');
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

    console.log('CodeMirror editor initialized');
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
    console.log('=== SAVING PROJECT ===');
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
            console.log('Project saved successfully');
            const btn = document.getElementById('saveBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Saved!';
            setTimeout(() => btn.innerHTML = originalText, 2000);
        } else {
            const errorData = await res.text();
            console.error('Save failed:', errorData);
            alert('Failed to save project');
        }
    } catch (error) {
        console.error('Exception during save:', error);
        alert('Failed to save project');
    }
}

// Collaborators UI
function updateCollaboratorsUI() {
    console.log('=== UPDATING COLLABORATORS UI ===');
    console.log('All collaborators:', allCollaborators);
    console.log('Online users:', onlineUsers);
    console.log('Is owner:', isOwner);
    console.log('Current user:', currentUser);
    
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
    
    console.log(`Creating UI for ${allCollaborators.length} collaborators...`);
    
    allCollaborators.forEach((collaborator, index) => {
        console.log(`Collaborator ${index + 1}:`, collaborator);
        
        const isOnline = onlineUsers.some(u => u.userId === collaborator._id);
        const isCollaboratorOwner = projectData && projectData.owner && projectData.owner._id === collaborator._id;
        const canRemove = isOwner && !isCollaboratorOwner && currentUser && currentUser._id !== collaborator._id;
        
        console.log(`  - Online: ${isOnline}, Is owner: ${isCollaboratorOwner}, Can remove: ${canRemove}`);
        
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
    
    console.log('Collaborators UI updated successfully');
    
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
            console.log('Collaborator removed:', data);
            
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
console.log('=== SCRIPT LOADED ===');
console.log('Initializing editor...');
initEditor();

// Properly wait for current user before loading project
console.log('Getting current user...');
getCurrentUser().then(() => {
    console.log('Current user loaded:', currentUser);
    console.log('Initializing socket...');
    initSocket();
    console.log('Loading project...');
    return loadProject();
}).catch(error => {
    console.error('Initialization error:', error);
    alert('Failed to initialize editor: ' + error.message);
});