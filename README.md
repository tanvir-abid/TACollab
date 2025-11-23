# TACollab

> Real-time collaborative code editor built for teams

TACollab is a powerful web-based code editor that enables multiple developers to write, edit, and manage code files together in real-time. Share a unique project code and start collaborating instantly.

## ✨ Features

- 🚀 **Real-time Collaboration** - Multiple users can work on the same project simultaneously
- 📁 **Multi-file Support** - Create and manage multiple files with tabs
- 🎨 **9 Language Modes** - JavaScript, Python, HTML, CSS, JSON, XML, PHP, SQL, Markdown
- 🌙 **4 Editor Themes** - Monokai, Dracula, Material, Nord
- ⚡ **Live Code Execution** - Run JavaScript and HTML directly in the browser
- 💾 **Auto-save** - Save your work with one click
- 🔐 **Secure Authentication** - User registration and login system
- 🎯 **Unique Project Codes** - Easy project sharing with 6-character codes
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🎭 **Dark Neumorphic UI** - Modern, eye-friendly interface

## 🚀 Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (running locally or MongoDB Atlas)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/tacollab.git
cd tacollab

# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your settings
# MONGODB_URI=mongodb://localhost:27017/tacollab
# JWT_SECRET=your_secret_key
# SESSION_SECRET=your_session_key
# PORT=3000

# Start the server
npm start

# For development with auto-reload
npm run dev
```

Visit `http://localhost:3000` to start using TACollab!

## 📖 Usage

1. **Register** - Create your account
2. **Create Project** - Start a new collaborative project
3. **Share Code** - Give the 6-character project code to collaborators
4. **Code Together** - Edit files, create tabs, and save your work
5. **Run Code** - Execute JavaScript/HTML directly in the browser

## 🛠️ Tech Stack

**Frontend:**
- HTML5, CSS3, JavaScript
- TailwindCSS for styling
- CodeMirror for code editing
- Font Awesome icons

**Backend:**
- Node.js with Express
- MongoDB with Mongoose
- JWT authentication
- Express sessions

## 📂 Project Structure

```
tacollab/
├── models/
│   ├── User.js          # User schema
│   └── Project.js       # Project schema with files
├── routes/
│   ├── auth.js          # Authentication routes
│   └── projects.js      # Project CRUD routes
├── public/
│   ├── login.html       # Login page
│   ├── register.html    # Registration page
│   ├── dashboard.html   # User dashboard
│   ├── editor.html      # Code editor
│   └── editor.js        # Editor functionality
├── .env                 # Environment variables
├── server.js            # Express server
└── package.json         # Dependencies
```

## 🔑 Key Features Explained

### Multi-file Projects
Each project can contain multiple files with different languages. Files are stored with their name, language mode, and code content.

### Real-time Collaboration
Share your project code with team members. All collaborators can access, edit, and save files to the same project.

### Code Execution
- **JavaScript**: Runs in sandbox with console output
- **HTML**: Renders with linked CSS/JS file injection
- **JSON**: Validates and formats JSON data

### File Management
- Create new files/tabs
- Rename files
- Delete tabs
- Download individual files
- Copy code to clipboard

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📝 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🐛 Known Issues

- Real-time sync requires manual save (WebSocket support coming soon)
- Code execution limited to JavaScript and HTML

## 🚧 Roadmap

- [ ] WebSocket for real-time synchronization
- [ ] Code execution for Python and other languages
- [ ] File upload/import functionality
- [ ] Git integration
- [ ] Chat feature for collaborators
- [ ] Code version history
- [ ] Syntax error highlighting
- [ ] Code sharing via URL

## 👨‍💻 Author

Tanvir Abid - [@tanvirabid](https://github.com/tanvir-abid)

## 🙏 Acknowledgments

- CodeMirror for the excellent code editor
- MongoDB for database solutions
- Express.js community

---

**TACollab** - Code together, build together 🚀
