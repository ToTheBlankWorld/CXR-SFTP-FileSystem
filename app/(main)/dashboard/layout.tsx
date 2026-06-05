import { DashboardWrapper } from '@/components/dashboard/dashboard-wrapper'

import { getConfig } from '@/lib/config'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const config = await getConfig()
  const maxFileSize = config.settings.general.maxFileSize
  const maxFolderSize = config.settings.general.maxFolderSize

  return (
    <DashboardWrapper
      showFooter={config.settings.general.credits.showFooter}
      maxFileSize={maxFileSize}
      maxFolderSize={maxFolderSize}
    >
      {children}
    </DashboardWrapper>
  )
}
