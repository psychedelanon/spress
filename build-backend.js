const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to find all .ts files recursively
function findTsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'dist') {
      findTsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

try {
  console.log('🔍 Finding TypeScript files...');
  const tsFiles = findTsFiles('src');
  
  if (tsFiles.length === 0) {
    console.error('❌ No TypeScript files found in src directory');
    process.exit(1);
  }
  
  console.log(`📁 Found ${tsFiles.length} TypeScript files:`, tsFiles);
  
  // Build the TypeScript command
  const tscCommand = [
    'npx tsc',
    '--skipLibCheck',
    '--target ES2022',
    '--module commonjs',
    '--esModuleInterop',
    '--resolveJsonModule',
    '--outDir dist',
    ...tsFiles
  ].join(' ');
  
  console.log('🔨 Compiling TypeScript...');
  console.log('Command:', tscCommand);
  
  execSync(tscCommand, { stdio: 'inherit' });
  
  console.log('✅ TypeScript compilation successful!');
} catch (error) {
  console.error('❌ TypeScript compilation failed:', error.message);
  process.exit(1);
} 