#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Starting SPRESS Chess build...');

// Build backend (always required)
try {
  console.log('📦 Building backend...');
  execSync('npm run build:backend', { stdio: 'inherit' });
  console.log('✅ Backend build successful');
} catch (error) {
  console.error('❌ Backend build failed');
  process.exit(1);
}

// Try to build webapp
try {
  console.log('🎨 Building webapp...');
  execSync('npm run build:webapp', { stdio: 'inherit' });
  console.log('✅ Webapp build successful');
} catch (error) {
  console.warn('⚠️ Webapp build failed, creating fallback...');
  
  // Create fallback webapp
  const webappDist = path.join(__dirname, 'webapp', 'dist');
  const fallbackHtml = \`<!DOCTYPE html>
<html>
<head>
  <title>SPRESS Chess</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body style="background:#00102E;color:#FFD700;font-family:system-ui;text-align:center;padding:50px;margin:0;">
  <div style="max-width:400px;margin:0 auto;">
    <h1 style="color:#FFD700;margin-bottom:20px;">🏗️ SPRESS Chess</h1>
    <div style="background:#0053FF;padding:20px;border-radius:8px;margin:20px 0;">
      <p style="margin:0;font-weight:600;">Mini App is being updated...</p>
    </div>
    <p style="color:#E01313;font-weight:600;">Use bot commands for now:</p>
    <div style="background:#1a1a1a;padding:15px;border-radius:5px;font-family:monospace;">
      <div>/new @username</div>
      <div>/solo</div>
      <div>/resign</div>
    </div>
    <p style="margin-top:30px;font-size:14px;opacity:0.8;">
      Interactive board coming soon! 🎯
    </p>
  </div>
  <script>
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  </script>
</body>
</html>\`;

  try {
    if (!fs.existsSync(webappDist)) {
      fs.mkdirSync(webappDist, { recursive: true });
    }
    fs.writeFileSync(path.join(webappDist, 'index.html'), fallbackHtml);
    console.log('✅ Fallback webapp created');
  } catch (fallbackError) {
    console.warn('⚠️ Could not create fallback webapp');
  }
}

console.log('🚀 Build process complete!'); 