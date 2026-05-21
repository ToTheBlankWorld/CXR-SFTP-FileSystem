import { NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { requireAdmin } from '@/lib/auth/api-auth'
import { HTTP_STATUS, apiError } from '@/lib/api/response'
import { loggers } from '@/lib/logger'

const logger = loggers.api

export async function GET() {
  try {
    const { response } = await requireAdmin()
    if (response) return response

    let localSha = ''
    try {
      localSha = execSync('git rev-parse HEAD').toString().trim()
    } catch (err) {
      logger.error('Failed to get local git commit SHA', err as Error)
      return apiError('Local git repository error', HTTP_STATUS.INTERNAL_SERVER_ERROR)
    }

    const repo = 'ToTheBlankWorld/CXR-SFTP-FileSystem'
    const url = `https://api.github.com/repos/${repo}/commits/main`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'CXR-Updater-Check',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      throw new Error(`GitHub API returned status ${res.status}: ${res.statusText}`)
    }

    const data = await res.json()
    const remoteSha = data.sha
    const commitMessage = data.commit.message
    const commitDate = data.commit.author.date

    const hasUpdate = localSha !== remoteSha
    const latestVersion = remoteSha.substring(0, 7)

    return NextResponse.json({
      hasUpdate,
      currentSha: localSha,
      latestSha: remoteSha,
      latestVersion,
      latestMessage: commitMessage,
      latestDate: commitDate,
      releaseUrl: `https://github.com/ToTheBlankWorld/CXR-SFTP-FileSystem/commit/${remoteSha}`,
      message: hasUpdate 
        ? `Update available: ${commitMessage.split('\n')[0]} (${latestVersion})` 
        : 'Instance is up to date',
    })
  } catch (error) {
    logger.error('Error checking for updates', error as Error)
    return apiError('Failed to check for updates', HTTP_STATUS.INTERNAL_SERVER_ERROR)
  }
}
