import { NextResponse } from 'next/server'

import { hash } from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'

import { updateConfig } from '@/lib/config'
import { prisma } from '@/lib/database/prisma'
import { loggers } from '@/lib/logger'

const logger = loggers.startup

class SetupAlreadyCompleteError extends Error {
  constructor() {
    super('Setup already completed')
  }
}

function generateUrlId() {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  return Array.from({ length: 5 }, () => {
    return alphabet.charAt(Math.floor(Math.random() * alphabet.length))
  }).join('')
}

const setupSchema = z.object({
  admin: z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
  }),
  registrations: z.object({
    enabled: z.boolean(),
    disabledMessage: z.string().optional(),
  }),
})

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const validatedData = setupSchema.parse(data)

    const hashedPassword = await hash(validatedData.admin.password, 10)

    const user = await prisma.$transaction(async (tx) => {
      const userCount = await tx.user.count()
      if (userCount > 0) {
        throw new SetupAlreadyCompleteError()
      }

      let urlId = generateUrlId()
      let isUnique = false
      while (!isUnique) {
        const existing = await tx.user.findUnique({
          where: { urlId },
        })
        if (!existing) {
          isUnique = true
        } else {
          urlId = generateUrlId()
        }
      }

      return tx.user.create({
        data: {
          name: validatedData.admin.name,
          email: validatedData.admin.email,
          password: hashedPassword,
          role: 'ADMIN',
          emailVerified: new Date(),
          urlId,
          uploadToken: uuidv4(),
        },
      })
    })

    await updateConfig({
      settings: {
        general: {
          setup: {
            completed: true,
            completedAt: new Date(),
          },
          registrations: {
            enabled: validatedData.registrations.enabled,
            disabledMessage: validatedData.registrations.disabledMessage || '',
          },
          sftp: {
            host: '192.168.0.200',
            port: 22,
            username: '',
            rootPath: '/',
          },
          maxUploadSize: 100 * 1024 * 1024,
          credits: {
            showFooter: true,
          },
        },
        appearance: {
          theme: 'dark',
          favicon: null,
          customColors: {},
        },
        advanced: {
          customCSS: '',
          customHead: '',
        },
      },
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    })
  } catch (error) {
    if (error instanceof SetupAlreadyCompleteError) {
      return NextResponse.json(
        { error: 'Setup already completed' },
        { status: 400 }
      )
    }
    logger.error('Setup error', error as Error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message || 'Validation failed' },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to complete setup' },
      { status: 500 }
    )
  }
}
