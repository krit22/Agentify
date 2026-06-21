import { prisma } from '@repo/db'

export interface SyncTenantResult {
  isNew: boolean
  organization: any
}

/**
 * Authentication Sync Service
 * Manages organization syncing and lazy provisioning of tenant infrastructure database states.
 */
export class AuthService {
  public static async syncTenant(orgId: string, orgName: string): Promise<SyncTenantResult> {
    // 1. Check if organization exists
    const existingOrg = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        settings: true,
        widgetConfig: true,
        billingUsage: true,
      },
    })

    if (existingOrg) {
      return {
        isNew: false,
        organization: existingOrg,
      }
    }

    // 2. Organization doesn't exist, create it along with settings and configs in a transactional state
    console.log(`Provisioning new organization tenant: ${orgName} (${orgId})`)
    const cycleEnd = new Date()
    cycleEnd.setDate(cycleEnd.getDate() + 30) // Default 30-day billing cycle

    const newOrg = await prisma.$transaction(async (tx) => {
      // Create Organization
      const org = await tx.organization.create({
        data: {
          id: orgId,
          name: orgName,
        },
      })

      // Create OrgSettings
      await tx.orgSettings.create({
        data: {
          orgId,
          vectorScoreThreshold: 0.74,
          defaultTicketUrgency: 'med',
          escalationSLAHours: 24,
        },
      })

      // Create WidgetConfig
      await tx.widgetConfig.create({
        data: {
          orgId,
          brandColor: '#4F46E5', // Indigo Hex default
          widgetPosition: 'right',
          greetingMessage: 'Hello! How can we help you today?',
          allowedDomains: [],
        },
      })

      // Create OrgBillingUsage (storageBytes and tokensConsumed as BigInt)
      await tx.orgBillingUsage.create({
        data: {
          orgId,
          tier: 'FREE',
          docsCount: 0,
          storageBytes: BigInt(0),
          queriesThisMonth: 0,
          tokensConsumed: BigInt(0),
          billingCycleStart: new Date(),
          billingCycleEnd: cycleEnd,
        },
      })

      return tx.organization.findUnique({
        where: { id: orgId },
        include: {
          settings: true,
          widgetConfig: true,
          billingUsage: true,
        },
      })
    })

    return {
      isNew: true,
      organization: newOrg,
    }
  }
}
