const { execSync } = require('child_process');

console.log('🔍 Debug Build Process');
console.log('Working directory:', process.cwd());
console.log('Node version:', process.version);

try {
  console.log('\n📁 Checking files:');
  execSync('ls -la', { stdio: 'inherit' });
  
  console.log('\n📦 Checking package.json:');
  const pkg = require('./package.json');
  console.log('Dependencies:', Object.keys(pkg.dependencies || {}));
  
  console.log('\n🔧 Checking TypeScript:');
  execSync('npx tsc --version', { stdio: 'inherit' });
  
  console.log('\n📄 Checking tsconfig.json:');
  execSync('cat tsconfig.json', { stdio: 'inherit' });
  
  console.log('\n🏗️ Running TypeScript compilation with verbose output:');
  execSync('npx tsc --listFiles --pretty', { stdio: 'inherit' });
  
} catch (error) {
  console.error('❌ Error during debug build:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
} 