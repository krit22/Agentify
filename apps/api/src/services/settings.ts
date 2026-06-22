import { prisma } from '@repo/db'

export interface UpdateSettingsParams {
  settings?: {
    vectorScoreThreshold?: number
    defaultTicketUrgency?: 'low' | 'med' | 'high'
    escalationSLAHours?: number
  }
  widgetConfig?: {
    brandColor?: string
    logoUrl?: string | null
    widgetPosition?: 'left' | 'right'
    greetingMessage?: string
    allowedDomains?: string[]
  }
}

export class SettingsService {
  /**
   * Retrieves styling configuration and tenant SLA settings.
   */
  public static async getSettings(orgId: string) {
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        settings: true,
        widgetConfig: true,
      },
    })

    if (!organization) {
      throw new Error(`Organization tenant ${orgId} not found in database.`)
    }

    return {
      orgId,
      settings: organization.settings,
      widgetConfig: organization.widgetConfig,
    }
  }

  /**
   * Updates organization settings and widget configurations atomically in a transaction.
   */
  public static async updateSettings(orgId: string, params: UpdateSettingsParams) {
    const { settings, widgetConfig } = params

    // Confirm that the organization exists first
    const organization = await prisma.organization.findUnique({
      where: { id: orgId },
    })

    if (!organization) {
      throw new Error(`Organization tenant ${orgId} not found in database.`)
    }

    await prisma.$transaction(async (tx) => {
      if (settings && Object.keys(settings).length > 0) {
        await tx.orgSettings.update({
          where: { orgId },
          data: settings,
        })
      }

      if (widgetConfig && Object.keys(widgetConfig).length > 0) {
        await tx.widgetConfig.update({
          where: { orgId },
          data: widgetConfig,
        })
      }
    })

    return this.getSettings(orgId)
  }
}
