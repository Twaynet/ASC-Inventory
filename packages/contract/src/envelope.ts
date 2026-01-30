/**
 * Standard API envelope helpers.
 *
 * All API responses use:
 *   Success: { data: <payload> }
 *   Error:   { error: { code, message, details? } }
 */

import { z } from 'zod';

/** Wrap a payload schema in the standard `{ data: T }` envelope. */
export function DataEnvelope<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema });
}

/** Standard error envelope: `{ error: { code, message, details? } }` */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/** Simple success envelope: `{ success: boolean }` */
export const SuccessEnvelope = z.object({ success: z.boolean() });
export type SuccessEnvelope = z.infer<typeof SuccessEnvelope>;
