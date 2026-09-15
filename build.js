const fs = require('fs');
const path = require('path');

console.log('--- Checking project for Netlify build ---');

// 1. Ensure public/data directory exists
const dataDir = path.join(__dirname, 'public', 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 2. Sync database.json to public/data/showroom.json for static fallback
const dbFile = path.join(__dirname, 'database.json');
const staticDataFile = path.join(dataDir, 'showroom.json');

if (fs.existsSync(dbFile)) {
    try {
        const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
        const publicData = {
            config: db.config || {},
            cars: db.cars || []
        };
        fs.writeFileSync(staticDataFile, JSON.stringify(publicData, null, 2), 'utf8');
        console.log('✓ Synchronized database to public/data/showroom.json');
    } catch (err) {
        console.error('Warning: Failed to sync database.json:', err.message);
    }
}

// 3. Verify core files
const requiredFiles = [
    'public/index.html',
    'public/styles.css',
    'public/app.js',
    'public/admin.html',
    'public/admin.js',
    'public/data/showroom.json',
    'server.js',
    'package.json'
];

let allOk = true;
requiredFiles.forEach(file => {
    const fullPath = path.join(__dirname, file);
    if (fs.existsSync(fullPath)) {
        console.log(`✓ Found ${file}`);
    } else {
        console.error(`✗ Missing required file: ${file}`);
        allOk = false;
    }
});

if (allOk) {
    console.log('=== Netlify build verification complete: All assets ready ===');
} else {
    console.error('=== Netlify build verification failed ===');
    process.exit(1);
}
