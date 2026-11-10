import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      // Lead with the first field's message so the UI can show something useful.
      const fieldErrors = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      const first = Object.values(fieldErrors).flat().find(Boolean) ?? result.error.issues[0]?.message;
      res.status(400).json({ message: first || 'Validation error', errors: fieldErrors });
      return;
    }
    req.body = result.data;
    next();
  };
}
