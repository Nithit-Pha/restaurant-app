import { z } from 'zod';

// Sign-in name shared by register and staff creation. Stored lowercase.
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3-32 characters: letters, numbers, dot, underscore or dash');
