import type { InputJsonValue } from '@prisma/client/runtime/library'
import { z } from 'zod'

import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'

const logger = loggers.config

export const configSchema = z.object({
  version: z.string(),
  settings: z.object({
    general: z.object({
      setup: z.object({
        completed: z.boolean().default(false),
        completedAt: z
          .union([z.date(), z.string()])
          .nullable()
          .transform((val) =>
            val ? (val instanceof Date ? val : new Date(val)) : null
          )
          .default(null),
      }),
      registrations: z.object({
        enabled: z.boolean(),
        disabledMessage: z.string(),
      }),
      sftp: z.object({
        host: z.string().default('192.168.0.200'),
        port: z.number().default(22),
        username: z.string().default(''),
        rootPath: z.string().default('/'),
      }),
      maxUploadSize: z.number().default(500 * 1024 * 1024),
      credits: z.object({
        showFooter: z.boolean(),
      }),
    }),
    appearance: z.object({
      theme: z.string(),
      favicon: z.string().nullable(),
      customColors: z.record(z.string()),
    }),
    advanced: z.object({
      customCSS: z.string(),
      customHead: z.string(),
    }),
  }),
})

export type FlareConfig = z.infer<typeof configSchema>

export const DEFAULT_CONFIG: FlareConfig = {
  version: '1.0.0',
  settings: {
    general: {
      setup: {
        completed: false,
        completedAt: null,
      },
      registrations: {
        enabled: true,
        disabledMessage: '',
      },
      sftp: {
        host: '192.168.0.200',
        port: 22,
        username: '',
        rootPath: '/',
      },
      maxUploadSize: 500 * 1024 * 1024,
      credits: {
        showFooter: true,
      },
    },
    appearance: {
      theme: 'dark',
      favicon: null,
      customColors: {
        background: '222.2 84% 4.9%',
        foreground: '210 40% 98%',
        card: '222.2 84% 4.9%',
        cardForeground: '210 40% 98%',
        popover: '222.2 84% 4.9%',
        popoverForeground: '210 40% 98%',
        primary: '210 40% 98%',
        primaryForeground: '222.2 47.4% 11.2%',
        secondary: '217.2 32.6% 17.5%',
        secondaryForeground: '210 40% 98%',
        muted: '217.2 32.6% 17.5%',
        mutedForeground: '215 20.2% 65.1%',
        accent: '217.2 32.6% 17.5%',
        accentForeground: '210 40% 98%',
        destructive: '0 62.8% 30.6%',
        destructiveForeground: '210 40% 98%',
        border: '217.2 32.6% 17.5%',
        input: '217.2 32.6% 17.5%',
        ring: '212.7 26.8% 83.9%',
      },
    },
    advanced: {
      customCSS: '',
      customHead: '',
    },
  },
}

export async function initConfig(): Promise<FlareConfig> {
  try {
    const config = await prisma.config.findFirst({
      where: { key: 'flare_config' },
    })

    if (!config) {
      await prisma.config.create({
        data: {
          key: 'flare_config',
          value: DEFAULT_CONFIG as InputJsonValue,
        },
      })
      return DEFAULT_CONFIG
    }

    return configSchema.parse(config.value)
  } catch (error) {
    logger.warn('Could not access database for config, using default', {
      error,
    })
    return DEFAULT_CONFIG
  }
}

export async function getConfig(): Promise<FlareConfig> {
  try {
    const config = await prisma.config.findUnique({
      where: { key: 'flare_config' },
    })

    if (!config) {
      return initConfig()
    }

    return configSchema.parse(config.value)
  } catch (error) {
    logger.warn('Could not access database for config, using default', {
      error,
    })
    return DEFAULT_CONFIG
  }
}

export async function updateConfig(
  newConfig: Partial<FlareConfig>
): Promise<FlareConfig> {
  try {
    const currentConfig = await getConfig()
    const mergedConfig = {
      ...currentConfig,
      ...newConfig,
      settings: {
        ...currentConfig.settings,
        ...(newConfig.settings || {}),
        general: {
          ...currentConfig.settings.general,
          ...(newConfig.settings?.general || {}),
          setup: {
            ...currentConfig.settings.general.setup,
            ...(newConfig.settings?.general?.setup || {}),
          },
          registrations: {
            ...currentConfig.settings.general.registrations,
            ...(newConfig.settings?.general?.registrations || {}),
          },
          credits: {
            ...currentConfig.settings.general.credits,
            ...(newConfig.settings?.general?.credits || {}),
          },
        },
        appearance: {
          ...currentConfig.settings.appearance,
          ...(newConfig.settings?.appearance || {}),
          customColors: {
            ...currentConfig.settings.appearance.customColors,
            ...(newConfig.settings?.appearance?.customColors || {}),
          },
        },
        advanced: {
          ...currentConfig.settings.advanced,
          ...(newConfig.settings?.advanced || {}),
        },
      },
    }

    const validatedConfig = configSchema.parse(mergedConfig)

    await prisma.config.upsert({
      where: { key: 'flare_config' },
      create: {
        key: 'flare_config',
        value: validatedConfig as InputJsonValue,
      },
      update: {
        value: validatedConfig as InputJsonValue,
      },
    })

    logger.info('Configuration updated successfully')
    return validatedConfig
  } catch (error) {
    logger.warn('Could not save config to database', { error })
    return newConfig as FlareConfig
  }
}

export async function updateConfigSection<
  T extends keyof FlareConfig['settings'],
>(section: T, data: Partial<FlareConfig['settings'][T]>): Promise<void> {
  try {
    const config = await getConfig()
    const updatedConfig = {
      ...config,
      settings: {
        ...config.settings,
        [section]: {
          ...config.settings[section],
          ...data,
        },
      },
    }
    await updateConfig(updatedConfig)
    logger.debug('Config section updated', { section })
  } catch (error) {
    logger.warn('Could not update config section', { section, error })
  }
}
