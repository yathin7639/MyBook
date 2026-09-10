const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories and data files
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const PHOTOS_FILE = path.join(__dirname, 'photos.json');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Ensure photos.json exists and contains valid JSON array
if (!fs.existsSync(PHOTOS_FILE)) {
  fs.writeFileSync(PHOTOS_FILE, JSON.stringify([], null, 2), 'utf8');
} else {
  try {
    const raw = fs.readFileSync(PHOTOS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      fs.writeFileSync(PHOTOS_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('Notice: Resetting invalid photos.json to empty array.');
    fs.writeFileSync(PHOTOS_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

// Helpers for safe atomic metadata reads/writes
function readPhotos() {
  try {
    if (!fs.existsSync(PHOTOS_FILE)) return [];
    const raw = fs.readFileSync(PHOTOS_FILE, 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Error reading photos.json:', err.message);
    return [];
  }
}

function writePhotos(photos) {
  try {
    fs.writeFileSync(PHOTOS_FILE, JSON.stringify(photos, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing photos.json:', err.message);
    return false;
  }
}

function sanitizeDisplayName(name) {
  if (typeof name !== 'string') return 'unnamed-photo';
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'unnamed-photo';
}

// =========================================================================
// CORS Configuration
// Allows GitHub Pages origin + local development origins
// =========================================================================
const allowedOrigins = [
  'https://yathin7639.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin or file:// protocol (e.g. mobile apps, curl, server-to-server, local file viewer)
    if (!origin || origin === 'null') return callback(null, true);
    
    // Check whitelist or localhost or localtunnel/ngrok if user tests through tunnels
    const isAllowed = allowedOrigins.includes(origin) || 
                      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
                      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
                      origin.endsWith('.github.io') ||
                      origin.endsWith('.loca.lt');

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Bypass-Tunnel-Reminder'],
  credentials: false
}));

app.use(express.json());

// Expose /uploads statically for physical image retrieval
app.use('/uploads', express.static(UPLOADS_DIR, {
  maxAge: '1h',
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    // Ensure image loads smoothly cross-origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Serve local root statically for convenient localhost testing
app.use(express.static(__dirname));

// =========================================================================
// Multer Storage Configuration
// =========================================================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uuid = crypto.randomUUID();
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z0-9]+$/i.test(ext) ? ext : '.jpg';
    const serverFilename = `doubt_${Date.now()}_${uuid}${safeExt}`;
    cb(null, serverFilename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/gif', 'image/bmp', 'image/svg+xml', 'image/tiff'
  ];
  if (file.mimetype.startsWith('image/') || allowed.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    const err = new Error(`Rejected "${file.originalname}": only image files are allowed.`);
    err.code = 'INVALID_FILE_TYPE';
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per image
    files: 30
  }
});

// =========================================================================
// API Routes
// =========================================================================

// 1. Health Check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    app: 'Book Doubt Viewer',
    version: '1.0.0',
    timestamp: Date.now()
  });
});

// 2. GET /api/photos - Retrieve all photos
app.get('/api/photos', (req, res) => {
  const photos = readPhotos();
  const sorted = [...photos].sort((a, b) => (b.created || 0) - (a.created || 0));
  res.json(sorted);
});

// 3. POST /api/photos - Upload multiple images
app.post('/api/photos', (req, res) => {
  const uploadMiddleware = upload.any();

  uploadMiddleware(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ ok: false, error: 'One or more files exceed the 50MB size limit.' });
      }
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({ ok: false, error: err.message });
      }
      return res.status(400).json({ ok: false, error: err.message || 'File upload error.' });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, error: 'No image files provided for upload.' });
    }

    const currentPhotos = readPhotos();
    const newRecords = [];

    for (const file of req.files) {
      const record = {
        id: crypto.randomUUID(),
        filename: file.filename,
        name: sanitizeDisplayName(file.originalname),
        size: file.size,
        type: file.mimetype,
        created: Date.now()
      };
      newRecords.push(record);
      currentPhotos.unshift(record);
    }

    const saved = writePhotos(currentPhotos);
    if (!saved) {
      return res.status(500).json({ ok: false, error: 'Failed to record metadata to disk.' });
    }

    res.status(201).json({
      ok: true,
      count: newRecords.length,
      photos: newRecords
    });
  });
});

// 4. DELETE /api/photos/:id - Delete single photo
app.delete('/api/photos/:id', (req, res) => {
  const photoId = req.params.id;
  if (!photoId) {
    return res.status(400).json({ ok: false, error: 'Photo ID is required.' });
  }

  const photos = readPhotos();
  const index = photos.findIndex(p => p.id === photoId);
  if (index === -1) {
    return res.status(404).json({ ok: false, error: 'Photo not found in registry.' });
  }

  const [targetPhoto] = photos.splice(index, 1);
  const safeFilename = path.basename(targetPhoto.filename);
  const filePath = path.join(UPLOADS_DIR, safeFilename);

  // Delete physical file safely
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (fsErr) {
    console.error(`Warning: Could not remove physical file ${filePath}:`, fsErr.message);
  }

  writePhotos(photos);

  res.json({
    ok: true,
    deletedId: photoId,
    message: 'Photo deleted successfully.'
  });
});

// 5. DELETE /api/photos - Clear all photos
app.delete('/api/photos', (req, res) => {
  let count = 0;
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    for (const file of files) {
      const fullPath = path.join(UPLOADS_DIR, file);
      if (fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
        count++;
      }
    }
  } catch (err) {
    console.error('Error cleaning uploads folder:', err.message);
  }

  writePhotos([]);

  res.json({
    ok: true,
    message: `All photos cleared. Removed ${count} physical file(s).`,
    count
  });
});

// Listen on all network interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log('==========================================');
  console.log('📖 Book Doubt Viewer Backend is RUNNING!');
  console.log(`🔗 Local URL:         http://localhost:${PORT}`);
  console.log(`🌐 Allowed Frontend:  https://yathin7639.github.io/MyBook/`);
  console.log(`📁 Uploads Directory: ${UPLOADS_DIR}`);
  console.log(`📄 Metadata File:     ${PHOTOS_FILE}`);
  console.log('==========================================');
});
