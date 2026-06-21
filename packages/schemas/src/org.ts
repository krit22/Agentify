import { z } from 'zod'

/**
 * --- ORGANIZATION & SETTINGS SCHEMAS ---
 * Purpose: Validates multi-tenant settings updates, dashboard configuration parameters, 
 * widget theme options, and custom brand settings.
 */

// Billing tiers
export const billingTierSchema = z.enum(['FREE', 'GROWTH', 'ENTERPRISE'])

// Validation schema for general organization setting updates
export const orgSettingsUpdateSchema = z.object({
  vectorScoreThreshold: z
    .number()
    .min(0, 'Similarity threshold must be at least 0.0')
    .max(1, 'Similarity threshold cannot exceed 1.0')
    .default(0.74),
  defaultTicketUrgency: z.enum(['low', 'med', 'high']).default('med'),
  escalationSLAHours: z.number().int().min(1, 'SLA must be at least 1 hour').default(24),
})
export type OrgSettingsUpdate = z.infer<typeof orgSettingsUpdateSchema>

// Validation schema for widget configuration settings (CORS domains, colors, branding)
export const widgetConfigUpdateSchema = z.object({
  brandColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Brand color must be a valid 6-character hex code (e.g. #4F46E5)'),
  logoUrl: z.string().url('Logo URL must be a valid URL string').nullable().optional(),
  widgetPosition: z.enum(['left', 'right']).default('right'),
  greetingMessage: z.string().min(1, 'Greeting message cannot be empty').max(300),
  allowedDomains: z.array(z.string().min(1)).default([]),
})
export type WidgetConfigUpdate = z.infer<typeof widgetConfigUpdateSchema>
