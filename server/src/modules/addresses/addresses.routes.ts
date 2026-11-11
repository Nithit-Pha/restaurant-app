import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import * as ctrl from './addresses.controller';

const router = Router();

// The signed-in customer's own saved delivery addresses.
const addressSchema = z.object({
  label: z.string().trim().min(1, 'Give the address a name, e.g. Home').max(40),
  text: z.string().trim().min(1, 'Enter the address').max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  note: z.string().trim().max(200).optional().nullable(),
});

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', validate(addressSchema), ctrl.create);
router.put('/:id', validate(addressSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
