const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Path to the built React app
const webappIndex = path.join(__dirname, 'webapp', 'dist', 'index.html');

// Ensure persistent data directory exists before server imports DB module
const dataDir = '/data';
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// If the webapp isn't built, build it now so Express can serve it
if (!fs.existsSync(webappIndex)) {
  console.log('🔧 webapp build not found - running "npm run build:webapp"...');
  execSync('npm run build:webapp', { stdio: 'inherit' });
}

// Start the precompiled server
require('./dist/server.js');
