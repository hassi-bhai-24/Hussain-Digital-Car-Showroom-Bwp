/* eslint-env node */
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure Uploads Directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ---------------------------------------------------------
// 1. SECURITY HEADERS & APPLICATION HARDENING
// ---------------------------------------------------------
// Disable X-Powered-By to prevent technology fingerprinting
app.disable('x-powered-by');

// Add HTTP security headers
app.use((req, res, next) => {
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
function getOrInitJWTSecret(data) {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (data.security && data.security.jwtSecret) {
        return data.security.jwtSecret;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    data.security = data.security || {};
    data.security.jwtSecret = generated;
    return generated;
}

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
        admin: {
            username: 'admin',
            passwordHash: bcrypt.hashSync('AdminPass123!', 10),
            tokenVersion: 1,
            isDefaultPassword: true
        },
        security: {
            jwtSecret: crypto.randomBytes(32).toString('hex')
        },
        cars: []
    };

    if (fs.existsSync(DB_FILE)) {
        try {
            const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            data = { ...data, ...raw };
            if (!data.admin || !data.admin.passwordHash) {
                data.admin = {
                    username: 'admin',
                    passwordHash: bcrypt.hashSync('AdminPass123!', 10),
                    tokenVersion: 1,
                    isDefaultPassword: true
                };
            }
            if (!data.security || !data.security.jwtSecret) {
                data.security = { jwtSecret: crypto.randomBytes(32).toString('hex') };
            }
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        } catch {
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        }
    } else {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    }
}
initDatabase();

function readDB() {
    try {
        let filePath = DB_FILE;
        const tmpFile = path.join('/tmp', 'database.json');
        if (fs.existsSync(tmpFile)) {
            filePath = tmpFile;
        }
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (!data.admin) {
            data.admin = {
                username: 'admin',
                passwordHash: bcrypt.hashSync('AdminPass123!', 10),
                tokenVersion: 1,
                isDefaultPassword: true
            };
        }
        if (!data.admin.tokenVersion) data.admin.tokenVersion = 1;
        if (!data.security || !data.security.jwtSecret) {
            data.security = { jwtSecret: crypto.randomBytes(32).toString('hex') };
        }
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
            admin: {
                username: 'admin',
                passwordHash: bcrypt.hashSync('AdminPass123!', 10),
                tokenVersion: 1,
                isDefaultPassword: true
            },
            security: {
                jwtSecret: crypto.randomBytes(32).toString('hex')
            },
            cars: []
        };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
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

function getJWTSecret() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    const db = readDB();
    return db.security?.jwtSecret || 'fallback_secret_key_showroom_2026';
}

// ---------------------------------------------------------
// 4. RATE LIMITING & BRUTE FORCE PROTECTION
// ---------------------------------------------------------
// Tracks failed login attempts: IP -> { attempts: number, lockedUntil: number }
const loginAttemptsMap = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || req.ip || 'unknown';
}

function checkLoginRateLimit(req, res, next) {
    const ip = getClientIP(req);
    const now = Date.now();
    const record = loginAttemptsMap.get(ip);

    if (record && record.lockedUntil && record.lockedUntil > now) {
        const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
        res.setHeader('Retry-After', remainingMinutes * 60);
        return res.status(429).json({
            error: `Security Lockout: Too many failed login attempts from this IP address. Account access is temporarily suspended. Please try again in ${remainingMinutes} minute(s).`
        });
    }
    next();
}

function recordFailedLogin(ip) {
    const now = Date.now();
    const record = loginAttemptsMap.get(ip) || { attempts: 0, lockedUntil: 0 };
    record.attempts += 1;

    if (record.attempts >= MAX_LOGIN_ATTEMPTS) {
        record.lockedUntil = now + LOCKOUT_DURATION_MS;
    }
    loginAttemptsMap.set(ip, record);
    return record;
}

function recordSuccessfulLogin(ip) {
    loginAttemptsMap.delete(ip);
}

// ---------------------------------------------------------
// 5. HARDENED FILE UPLOAD SECURITY (MULTER)
// ---------------------------------------------------------
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        // Cryptographically random unique filename to prevent path traversal or collision
        const safeName = `${Date.now()}-${crypto.randomBytes(12).toString('hex')}${ext}`;
        cb(null, safeName);
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 5 // Maximum 5 files per request
    },
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        
        // Block dangerous file types explicitly (SVG can embed XSS scripts)
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return cb(new Error('Invalid image extension. Only JPG, JPEG, PNG, and WEBP formats are allowed.'));
        }
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            return cb(new Error('Invalid image MIME type. File must be a valid JPG, PNG, or WEBP image.'));
        }
        cb(null, true);
    }
});

const uploadMiddleware = (req, res, next) => {
    if (req.is('multipart/form-data')) {
        upload.array('images', 5)(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Image upload rejected by security validation.' });
            }
            next();
        });
    } else {
        next();
    }
};

function parseImages(files = [], external, existingImages = []) {
    const uploaded = (files || []).map(f => `/uploads/${path.basename(f.filename)}`);
    let externals = [];
    if (Array.isArray(external)) {
        externals = external.map(s => String(s).trim()).filter(Boolean);
    } else if (typeof external === 'string') {
        externals = external.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    }
    
    // Only allow HTTP/HTTPS URLs for external images (block javascript: or file: schemes)
    const safeExternals = externals.filter(url => {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    });

    const combined = [...uploaded, ...safeExternals];
    return combined.length ? combined : (existingImages.length ? existingImages : ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80']);
}

// ---------------------------------------------------------
// 6. SECURE AUTHENTICATION & SESSION REVOCATION (JWT)
// ---------------------------------------------------------
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied. Authentication token required.' });

    const secret = getJWTSecret();
    jwt.verify(token, secret, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Session expired or invalid. Please sign in again.' });
        
        // Check Token Version (ensures immediate session revocation upon password change)
        const db = readDB();
        const currentVersion = db.admin?.tokenVersion || 1;
        if (decoded.tokenVersion && decoded.tokenVersion !== currentVersion) {
            return res.status(401).json({ error: 'Session revoked due to password or credential update. Please sign in again.' });
        }

        req.user = decoded;
        next();
    });
}

// ---------------------------------------------------------
// 7. PUBLIC SHOWROOM APIS
// ---------------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.get('/api/public/data', (req, res) => {
    const db = readDB();
    const phoneInfo = normalizePhone(db.config?.whatsappNumber || '923238194402');
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

app.get('/share/car/:id', (req, res) => {
    if (!isValidVehicleId(req.params.id)) {
        return res.status(400).send('Invalid vehicle identifier.');
    }
    const db = readDB();
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

app.get('/api/cars', (req, res) => {
    const db = readDB();
    res.json(db.cars || []);
});

app.get('/api/cars/:id', (req, res) => {
    if (!isValidVehicleId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid vehicle identifier format.' });
    }
    const db = readDB();
    const car = (db.cars || []).find(c => c.id === req.params.id);
    if (!car) return res.status(404).json({ error: 'Vehicle not found.' });
    res.json(car);
});

// ---------------------------------------------------------
// 8. SECURE ADMIN MANAGEMENT ENDPOINTS
// ---------------------------------------------------------
app.post('/api/admin/login', checkLoginRateLimit, (req, res) => {
    const ip = getClientIP(req);
    const { username, password } = req.body || {};
    const db = readDB();

    const cleanInputUser = (username || '').trim().toLowerCase();
    const storedUser = (db.admin?.username || 'admin').trim().toLowerCase();

    // If a username is provided, verify it against stored account
    if (cleanInputUser && cleanInputUser !== storedUser) {
        const record = recordFailedLogin(ip);
        const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - record.attempts);
        return res.status(401).json({
            error: `Invalid credentials. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lockout)`
        });
    }

    const inputPass = (password || '').trim();
    if (!inputPass) {
        return res.status(400).json({ error: 'Password is required to access admin panel.' });
    }

    const isPassValid = db.admin?.passwordHash && bcrypt.compareSync(inputPass, db.admin.passwordHash);

    if (!isPassValid) {
        const record = recordFailedLogin(ip);
        const remaining = Math.max(0, MAX_LOGIN_ATTEMPTS - record.attempts);
        return res.status(401).json({
            error: `Invalid password. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining before temporary lockout)`
        });
    }

    // Successful login: clear brute-force tracker for this IP
    recordSuccessfulLogin(ip);

    const secret = getJWTSecret();
    const tokenVersion = db.admin?.tokenVersion || 1;
    const token = jwt.sign(
        { username: db.admin?.username || 'admin', tokenVersion },
        secret,
        { expiresIn: '12h' }
    );

    res.json({
        token,
        username: db.admin?.username || 'admin',
        isDefaultPassword: !!db.admin?.isDefaultPassword,
        message: 'Authenticated securely.'
    });
});

app.get('/api/admin/verify', authenticateToken, (req, res) => {
    const db = readDB();
    res.json({
        valid: true,
        username: db.admin?.username || req.user.username,
        isDefaultPassword: !!db.admin?.isDefaultPassword,
        securityChecklist: {
            rateLimiterActive: true,
            bruteForceProtection: 'Active (5-attempt lockout)',
            xssSanitizerActive: true,
            fileMimeVerification: 'Strict JPG/PNG/WEBP',
            tokenVersion: db.admin?.tokenVersion || 1
        }
    });
});

app.put('/api/admin/change-password', authenticateToken, (req, res) => {
    const { currentPassword, newPassword, newUsername } = req.body || {};
    const db = readDB();

    if (!currentPassword) {
        return res.status(400).json({ error: 'Current password is required to verify identity.' });
    }

    const isCurrentValid = db.admin?.passwordHash && bcrypt.compareSync(currentPassword.trim(), db.admin.passwordHash);
    if (!isCurrentValid) {
        return res.status(401).json({ error: 'Current password verification failed. Please check your credentials.' });
    }

    let passwordChanged = false;
    if (newPassword) {
        const trimmedNew = newPassword.trim();
        // Password strength requirement: min 8 chars, must have letter and number
        if (trimmedNew.length < 8) {
            return res.status(400).json({ error: 'Security requirement: New password must be at least 8 characters long.' });
        }
        if (!/[A-Za-z]/.test(trimmedNew) || !/[0-9]/.test(trimmedNew)) {
            return res.status(400).json({ error: 'Security requirement: New password must contain both letters and numbers.' });
        }
        db.admin.passwordHash = bcrypt.hashSync(trimmedNew, 12);
        db.admin.isDefaultPassword = false;
        passwordChanged = true;
    }

    if (newUsername) {
        const cleanUser = sanitizeText(newUsername, 32);
        if (cleanUser.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
        }
        db.admin.username = cleanUser;
    }

    if (passwordChanged) {
        // Increment tokenVersion: immediately invalidates all active tokens on other devices!
        db.admin.tokenVersion = (db.admin.tokenVersion || 1) + 1;
    }

    writeDB(db);

    // Issue refreshed token with the updated tokenVersion
    const secret = getJWTSecret();
    const refreshedToken = jwt.sign(
        { username: db.admin.username, tokenVersion: db.admin.tokenVersion },
        secret,
        { expiresIn: '12h' }
    );

    res.json({
        message: 'Security credentials updated successfully. Other active sessions have been revoked.',
        username: db.admin.username,
        isDefaultPassword: false,
        refreshedToken
    });
});

app.post('/api/admin/cars', authenticateToken, uploadMiddleware, (req, res) => {
    const db = readDB();
    const body = req.body || {};
    const externalImages = body.externalImages || body.images;
    const images = parseImages(req.files, externalImages);

    const price = parseFloat(body.cashPrice);
    const validPrice = !isNaN(price) && price >= 0 ? price : 0;

    const newCar = {
        id: `car-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
        name: sanitizeText(body.name, 120) || 'Untitled Vehicle',
        year: sanitizeText(body.year, 10) || new Date().getFullYear().toString(),
        mileage: sanitizeText(body.mileage, 50) || '0 km',
        specs: sanitizeText(body.specs, 500) || 'Standard Specs',
        cashPrice: validPrice,
        installmentAvailable: body.installmentAvailable === 'true' || body.installmentAvailable === true,
        installmentPlan: sanitizeText(body.installmentPlan, 300),
        status: ['available', 'pending', 'sold'].includes(body.status) ? body.status : 'available',
        images,
        createdAt: new Date().toISOString()
    };

    db.cars = db.cars || [];
    db.cars.unshift(newCar);
    writeDB(db);
    res.status(201).json({ message: 'Vehicle added to showroom inventory securely.', car: newCar });
});

app.put('/api/admin/cars/:id', authenticateToken, uploadMiddleware, (req, res) => {
    if (!isValidVehicleId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid vehicle ID format.' });
    }
    const db = readDB();
    const index = (db.cars || []).findIndex(c => c.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Vehicle not found.' });

    const existing = db.cars[index];
    const body = req.body || {};
    const keepExisting = body.keepExistingImages === 'true' || body.keepExistingImages === true;
    let baseImages = keepExisting ? [...(existing.images || [])] : [];
    
    const externalImages = body.externalImages || body.images;
    const newImages = parseImages(req.files, externalImages, baseImages);
    const finalImages = keepExisting && (req.files?.length || externalImages) ? [...baseImages, ...newImages] : newImages;

    let updatedPrice = existing.cashPrice;
    if (body.cashPrice !== undefined && body.cashPrice !== '') {
        const parsed = parseFloat(body.cashPrice);
        if (!isNaN(parsed) && parsed >= 0) updatedPrice = parsed;
    }

    db.cars[index] = {
        ...existing,
        name: body.name !== undefined ? sanitizeText(body.name, 120) : existing.name,
        year: body.year !== undefined ? sanitizeText(body.year, 10) : existing.year,
        mileage: body.mileage !== undefined ? sanitizeText(body.mileage, 50) : existing.mileage,
        specs: body.specs !== undefined ? sanitizeText(body.specs, 500) : existing.specs,
        cashPrice: updatedPrice,
        installmentAvailable: body.installmentAvailable !== undefined ? (body.installmentAvailable === 'true' || body.installmentAvailable === true) : existing.installmentAvailable,
        installmentPlan: body.installmentPlan !== undefined ? sanitizeText(body.installmentPlan, 300) : existing.installmentPlan,
        status: body.status && ['available', 'pending', 'sold'].includes(body.status) ? body.status : existing.status,
        images: finalImages.length ? finalImages : existing.images,
        updatedAt: new Date().toISOString()
    };

    writeDB(db);
    res.json({ message: 'Vehicle updated successfully.', car: db.cars[index] });
});

app.patch('/api/admin/cars/:id/status', authenticateToken, (req, res) => {
    if (!isValidVehicleId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid vehicle ID format.' });
    }
    const { status } = req.body || {};
    if (!['available', 'pending', 'sold'].includes(status)) {
        return res.status(400).json({ error: 'Invalid vehicle status. Must be available, pending, or sold.' });
    }
    const db = readDB();
    const car = (db.cars || []).find(c => c.id === req.params.id);
    if (!car) return res.status(404).json({ error: 'Vehicle not found.' });
    
    car.status = status;
    car.updatedAt = new Date().toISOString();
    writeDB(db);
    res.json({ message: `Vehicle status changed to ${status}.`, car });
});

app.delete('/api/admin/cars/:id', authenticateToken, (req, res) => {
    if (!isValidVehicleId(req.params.id)) {
        return res.status(400).json({ error: 'Invalid vehicle ID format.' });
    }
    const db = readDB();
    const beforeCount = (db.cars || []).length;
    db.cars = (db.cars || []).filter(c => c.id !== req.params.id);
    if (db.cars.length === beforeCount) {
        return res.status(404).json({ error: 'Vehicle not found.' });
    }
    writeDB(db);
    res.json({ message: 'Vehicle removed from inventory successfully.' });
});

app.put('/api/admin/config', authenticateToken, (req, res) => {
    const db = readDB();
    const { showroomName, whatsappNumber, address, description } = req.body || {};
    
    const phoneInfo = normalizePhone(whatsappNumber || db.config.whatsappNumber);

    db.config = {
        showroomName: showroomName ? sanitizeText(showroomName, 100) : db.config.showroomName,
        whatsappNumber: phoneInfo.waNumber,
        adminPhoneDisplay: phoneInfo.display,
        address: address ? sanitizeText(address, 200) : db.config.address,
        description: description ? sanitizeText(description, 500) : db.config.description
    };
    writeDB(db);
    res.json({ message: 'Showroom configuration updated securely.', config: db.config });
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
