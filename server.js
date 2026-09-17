/* eslint-env node */
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const { getStore } = require('@netlify/blobs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure Uploads Directory exists for local filesystem fallback
if (!fs.existsSync(UPLOADS_DIR)) {
    try {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    } catch {}
}

// In-memory cache of binary image blobs for instantaneous serving
const memoryBlobImageCache = new Map();

// Helper to safely get Netlify Blob Store if configured in environment
function getNetlifyBlobStore(storeName) {
    try {
        const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
        const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
        
        const options = { name: storeName, consistency: 'strong' };
        if (siteID && token) {
            options.siteID = siteID;
            options.token = token;
        }

        const store = getStore(options);
        return store;
    } catch (e) {
        return null;
    }
}

// ---------------------------------------------------------
// 1. SECURITY HEADERS & APPLICATION HARDENING
// ---------------------------------------------------------
// Disable X-Powered-By to prevent technology fingerprinting
app.disable('x-powered-by');

// Add HTTP security headers
app.use((req, res, next) => {
    // Netlify Functions URL rewrite support
    if (req.url.startsWith('/.netlify/functions/api')) {
        req.url = req.url.replace('/.netlify/functions/api', '/api');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Configure CORS
app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsers with size limit protection (prevents DoS via large payload injection)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Static asset serving
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR, {
    setHeaders: (res) => {
        // Force images to be rendered inline and prevent executing scripts inside uploaded files
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
}));

// ---------------------------------------------------------
// 2. INPUT SANITIZATION & VALIDATION (XSS & INJECTION PREVENTION)
// ---------------------------------------------------------
function sanitizeText(str, maxLength = 1000) {
    if (typeof str !== 'string') return '';
    // Strip HTML tags and dangerous javascript/data protocols
    let clean = str
        .replace(/<[^>]*>?/gm, '')
        .replace(/javascript:/gi, '')
        .replace(/data:/gi, '')
        .replace(/vbscript:/gi, '')
        .trim();
    return clean.slice(0, maxLength);
}

function isValidVehicleId(id) {
    return typeof id === 'string' && /^[a-zA-Z0-9_-]{3,64}$/.test(id);
}

// ---------------------------------------------------------
// 3. SECURE DATABASE INITIALIZATION & DYNAMIC JWT SECRET
// ---------------------------------------------------------
function normalizePhone(raw) {
    if (!raw) return { waNumber: '923238194402', display: '03238194402' };
    let clean = String(raw).replace(/[^0-9]/g, '');
    let display = raw;
    if (clean.startsWith('03') && clean.length === 11) {
        display = clean;
        clean = '92' + clean.slice(1);
    } else if (clean.startsWith('923') && clean.length === 12) {
        display = '0' + clean.slice(2);
    } else if (clean.startsWith('3') && clean.length === 10) {
        display = '0' + clean;
        clean = '92' + clean;
    }
    return { waNumber: clean || '923238194402', display: display || '03238194402' };
}

function initDatabase() {
    let data = {
        config: {
            showroomName: 'HUSSAIN Digital Showroom',
            whatsappNumber: '923238194402',
            adminPhoneDisplay: '03238194402',
            address: 'Hussain digital Showroom, Bwp.',
            description: 'Curated. Verified. Yours. Premier luxury automotive showroom with 24/7 services and instant deals.'
        },
        cars: []
    };

    if (fs.existsSync(DB_FILE)) {
        try {
            const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            data = { ...data, ...raw };
            delete data.admin;
            delete data.security;
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        } catch {
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        }
    } else {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    }
}
initDatabase();

function getDBPath() {
    const candidates = [
        path.join('/tmp', 'database.json'),
        path.join(process.cwd(), 'database.json'),
        path.join(__dirname, 'database.json'),
        path.join(__dirname, '..', '..', 'database.json'),
        DB_FILE
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return DB_FILE;
}

let inMemoryDBCache = null;
let lastDBFetchTime = 0;
const DB_CACHE_TTL_MS = 1000; // 1s cache for high concurrency

async function readDBAsync() {
    const now = Date.now();
    if (inMemoryDBCache && (now - lastDBFetchTime < DB_CACHE_TTL_MS)) {
        return inMemoryDBCache;
    }

    // 1. Try reading from Netlify Blobs persistent store
    const blobStore = getNetlifyBlobStore('showroom-data');
    if (blobStore) {
        try {
            const blobData = await blobStore.get('database.json', { type: 'json' });
            if (blobData && typeof blobData === 'object') {
                delete blobData.admin;
                delete blobData.security;
                inMemoryDBCache = blobData;
                lastDBFetchTime = now;
                return blobData;
            }
        } catch (err) {
            console.warn('Netlify Blobs read notice:', err.message);
        }
    }

    // 2. Fallback to local filesystem / bundled database.json
    const diskData = readDB();
    inMemoryDBCache = diskData;
    lastDBFetchTime = now;
    return diskData;
}

async function writeDBAsync(data) {
    delete data.admin;
    delete data.security;
    inMemoryDBCache = data;
    lastDBFetchTime = Date.now();

    // 1. Always attempt write to Netlify Blobs for global cloud persistence
    const blobStore = getNetlifyBlobStore('showroom-data');
    if (blobStore) {
        try {
            await blobStore.setJSON('database.json', data);
        } catch (err) {
            console.warn('Netlify Blobs write error:', err.message);
        }
    }

    // 2. Sync to disk or /tmp for local server & process continuity
    writeDB(data);
}

function readDB() {
    try {
        const filePath = getDBPath();
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        delete data.admin;
        delete data.security;
        return data;
    } catch {
        return {
            config: {
                showroomName: 'HUSSAIN Digital Showroom',
                whatsappNumber: '923238194402',
                adminPhoneDisplay: '03238194402',
                address: 'Hussain digital Showroom, Bwp.',
                description: 'Premier luxury automotive showroom.'
            },
            cars: []
        };
    }
}

function writeDB(data) {
    try {
        const primary = getDBPath();
        fs.writeFileSync(primary, JSON.stringify(data, null, 2));
    } catch (err) {
        // Fallback for serverless environments with read-only root filesystem
        try {
            const tmpFile = path.join('/tmp', 'database.json');
            fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Serverless database write error:', e);
        }
    }
}

// ---------------------------------------------------------
// 6. PUBLIC SHOWROOM APIS & CLOUD IMAGE SERVING
// ---------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// Image delivery endpoint: Serves uploaded vehicle photos from memory cache, Netlify Blobs, or disk
app.get('/api/images/:key', async (req, res) => {
    const rawKey = req.params.key;
    if (!rawKey || !/^[a-zA-Z0-9_.-]+$/.test(rawKey)) {
        return res.status(400).send('Invalid image key.');
    }

    // Set cache headers: 1 year immutable for high performance
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // 1. Check in-memory cache
    if (memoryBlobImageCache.has(rawKey)) {
        const item = memoryBlobImageCache.get(rawKey);
        res.setHeader('Content-Type', item.contentType || 'image/jpeg');
        return res.send(item.data);
    }

    // 2. Check local disk fallback
    const diskPath = path.join(UPLOADS_DIR, rawKey);
    if (fs.existsSync(diskPath)) {
        return res.sendFile(diskPath);
    }

    // 3. Fetch from Netlify Blobs
    const imageStore = getNetlifyBlobStore('showroom-images');
    if (imageStore) {
        try {
            const blobData = await imageStore.get(rawKey, { type: 'arrayBuffer' });
            if (blobData) {
                const buffer = Buffer.from(blobData);
                const ext = path.extname(rawKey).toLowerCase();
                let contentType = 'image/jpeg';
                if (ext === '.png') contentType = 'image/png';
                if (ext === '.webp') contentType = 'image/webp';
                
                memoryBlobImageCache.set(rawKey, { data: buffer, contentType });
                res.setHeader('Content-Type', contentType);
                return res.send(buffer);
            }
        } catch (err) {
            console.warn('Netlify Blobs image fetch error:', err.message);
        }
    }

    // Fallback: placeholder image redirect if not found
    res.redirect('https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80');
});

app.get('/api/public/data', async (req, res) => {
    const db = await readDBAsync();
    const phoneInfo = normalizePhone(db.config?.whatsappNumber || '923238194402');
    res.setHeader('Cache-Control', 'no-cache');
    // Strictly sanitize and exclude any internal security or password hash data
    res.json({
        config: {
            showroomName: db.config?.showroomName || 'HUSSAIN Digital Showroom',
            whatsappNumber: phoneInfo.waNumber,
            adminPhoneDisplay: db.config?.adminPhoneDisplay || phoneInfo.display,
            address: db.config?.address || '',
            description: db.config?.description || ''
        },
        cars: db.cars || []
    });
});

app.get('/share/car/:id', async (req, res) => {
    if (!isValidVehicleId(req.params.id)) {
        return res.status(400).send('Invalid vehicle identifier.');
    }
    const db = await readDBAsync();
    const car = (db.cars || []).find(c => c.id === req.params.id);
    const config = db.config || {};
    const title = car ? `${sanitizeText(car.name)} (${sanitizeText(car.year)}) - ${sanitizeText(config.showroomName)}` : sanitizeText(config.showroomName);
    const desc = car ? `Price: PKR ${Number(car.cashPrice).toLocaleString()} | Specs: ${sanitizeText(car.specs)}` : sanitizeText(config.description);
    const image = (car && car.images && car.images[0]) || 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80';
    const siteUrl = `/#vehicle-${encodeURIComponent(req.params.id)}`;

    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title>
<meta property="og:title" content="${title}"/><meta property="og:description" content="${desc}"/>
<meta property="og:image" content="${image}"/><meta property="og:url" content="${siteUrl}"/>
<script>window.location.href = "${siteUrl}";</script></head><body>Redirecting to verified vehicle...</body></html>`);
});

app.get('/api/cars', async (req, res) => {
    const db = await readDBAsync();
    res.setHeader('Cache-Control', 'no-cache');
    res.json(db.cars || []);
});

app.get('/api/cars/:id', async (req, res) => {
    if (!isValidVehicleId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid vehicle identifier format.' });
    }
    const db = await readDBAsync();
    const car = (db.cars || []).find(c => c.id === req.params.id);
    if (!car) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json(car);
});

// Centralized error handler
app.use((err, req, res, next) => {
    console.error('Handled server error:', err.message);
    res.status(400).json({ error: err.message || 'Request could not be processed.' });
});

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`HUSSAIN Showroom running securely at http://0.0.0.0:${PORT}`);
    });
}

module.exports = app;
