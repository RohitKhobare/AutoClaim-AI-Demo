'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');

fs.mkdirSync(config.uploadRoot, { recursive: true });

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
const DOC_TYPES = [...IMAGE_TYPES, 'application/pdf'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.uploadRoot),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 8) || '.bin';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

function fileFilter(req, file, cb) {
  const allowed = file.fieldname === 'images' ? IMAGE_TYPES : DOC_TYPES;
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error(`Unsupported file type: ${file.mimetype || 'unknown'}`));
  }
  return cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.maxUploadBytes, files: 20 },
});

const claimUpload = upload.fields([
  { name: 'images', maxCount: 8 },
  { name: 'documents', maxCount: 8 },
]);

module.exports = { upload, claimUpload, IMAGE_TYPES, DOC_TYPES };
