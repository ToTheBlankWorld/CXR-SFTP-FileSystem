'use client'

import { FileActions } from '@/components/file/file-actions'
import { AuthGuard } from '@/components/file/protected/auth-guard'
import { FileViewer } from '@/components/file/viewer'

import { sanitizeUrl } from '@/lib/utils/url'

interface ProtectedFileProps {
  file: {
    id: string
    name: string
    urlPath: string
    visibility: 'PUBLIC' | 'PRIVATE' | 'USERS_AND_ADMINS' | 'USER_ONLY'
    password: string | null
    userId: string
    mimeType: string
    path: string
  }
  verifiedPassword?: string
}

export function ProtectedFile({
  file,
  verifiedPassword: initialVerifiedPassword,
}: ProtectedFileProps) {
  return (
    <AuthGuard file={file}>
      {(authGuardVerifiedPassword) => {
        const currentVerifiedPassword =
          authGuardVerifiedPassword || initialVerifiedPassword
        return (
          <div className="space-y-4">
            {/* View the file */}
            <FileViewer
              file={file}
              verifiedPassword={currentVerifiedPassword}
            />

            {/* Actions */}
            <div className="flex items-center justify-center px-6 pb-4">
              <FileActions
                urlPath={sanitizeUrl(file.urlPath)}
                name={file.name}
                mimeType={file.mimeType}
                verifiedPassword={currentVerifiedPassword}
                fileId={file.id}
              />
            </div>
          </div>
        )
      }}
    </AuthGuard>
  )
}
