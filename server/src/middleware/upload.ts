import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadDir);
  },
  // No extension yet: the real one is chosen in verifyImage() from the file's
  // actual bytes, never from the name or MIME type the browser sent.
  filename: (_req, _file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  },
});

const fileFilter = (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'), { statusCode: 400 }));
  }
};

const multerUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

/** Detect the image type from the file's first bytes ("magic numbers"). */
function detectImageExt(filePath: string): string | null {
  const fd = fs.openSync(filePath, 'r');
  const b = Buffer.alloc(12);
  try {
    fs.readSync(fd, b, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return '.jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png';
  if (b.toString('ascii', 0, 6) === 'GIF87a' || b.toString('ascii', 0, 6) === 'GIF89a') return '.gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

/**
 * Runs after multer: rejects files that are not really images (e.g. an HTML
 * file sent as image/png) and gives valid ones the extension of their real type.
 */
function verifyImage(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) return next();
  const ext = detectImageExt(req.file.path);
  if (!ext) {
    fs.unlink(req.file.path, () => {});
    res.status(400).json({ message: 'Only JPEG, PNG, WebP, and GIF images are allowed' });
    return;
  }
  const newPath = req.file.path + ext;
  fs.renameSync(req.file.path, newPath);
  req.file.path = newPath;
  req.file.filename = path.basename(newPath);
  next();
}

// `upload.single(field)` keeps the same call site in the routes but now
// returns [multer, verifyImage] — Express accepts an array of middleware.
export const upload = {
  single: (field: string) => [multerUpload.single(field), verifyImage],
};
