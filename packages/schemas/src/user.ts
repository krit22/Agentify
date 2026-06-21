import { z } from 'zod'

/**
 * --- USER & AUTHENTICATION SCHEMAS ---
 * Purpose: Validates Clerk user payload structures, organization roles, and profile schemas.
 */

// Example: Valid user roles matching platform access levels
export const userRoleSchema = z.enum(['ADMIN', 'SUPPORT_REPRESENTATIVE'])
export type UserRole = z.infer<typeof userRoleSchema>

// Example: Basic user login or authentication validation placeholder
export const userSessionSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  email: z.string().email('Invalid email address'),
  role: userRoleSchema,
  orgId: z.string().optional(),
})
export type UserSession = z.infer<typeof userSessionSchema>

// Payload schema to synchronize a newly logged-in tenant
export const syncTenantRequestSchema = z.object({
  orgName: z.string().min(1, 'Organization name is required').max(100),
})
export type SyncTenantRequestInput = z.infer<typeof syncTenantRequestSchema>

