import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import app from './app';
import { env } from './config/env';
import { prisma } from './config/db';

// Ensure uploads directory exists
const uploadsDir = path.resolve(env.uploadDir);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

async function main() {
  await prisma.$connect();
  console.log('✓ Database connected');

  app.listen(env.port, () => {
    console.log(`✓ Server running on http://localhost:${env.port} [${env.nodeEnv}]`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
