import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { requireAdmin } from '@/lib/auth/api-auth'
import { HTTP_STATUS, apiError } from '@/lib/api/response'
import { loggers } from '@/lib/logger'

const logger = loggers.api

function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // 3 minute timeout for longer tasks like building
    exec(command, { timeout: 180000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Command "${command}" failed: ${error.message}\nStderr: ${stderr}`))
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

export async function POST() {
  try {
    const { response } = await requireAdmin()
    if (response) return response

    logger.info('Applying auto-update: Starting git pull')
    const gitResult = await runCommand('git pull')
    logger.info('Auto-update: Git pull completed')

    logger.info('Applying auto-update: Starting npm install')
    const npmInstallResult = await runCommand('npm install')
    logger.info('Auto-update: Npm install completed')

    logger.info('Applying auto-update: Starting npm run build')
    const buildResult = await runCommand('npm run build')
    logger.info('Auto-update: Rebuild completed')

    return NextResponse.json({
      success: true,
      gitOutput: gitResult.stdout,
      npmOutput: npmInstallResult.stdout,
      buildOutput: buildResult.stdout,
      message: 'Successfully updated codebase, updated packages, and rebuilt the application! Please restart the server process to apply changes.',
    })
  } catch (error) {
    logger.error('Error applying update', error as Error)
    return apiError(
      error instanceof Error ? error.message : 'Failed to apply update',
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    )
  }
}
