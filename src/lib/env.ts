/**
 * Runtime environment validation for critical variables.
 */
import { z } from 'zod';

const EnvSchema = z.object({
  ADMIN_PASSWORD: z.string().min(1, 'ADMIN_PASSWORD is required'),
});

// Lazy validation to avoid failing builds where envs are not present.
export function getEnv() {
  return EnvSchema.parse({
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  });
}


