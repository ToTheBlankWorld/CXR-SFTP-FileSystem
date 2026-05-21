import { LoginForm } from '@/components/auth/login-form'
import { DynamicBackground } from '@/components/layout/dynamic-background'
import { Icons } from '@/components/shared/icons'

import { getConfig } from '@/lib/config'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const config = await getConfig()
  const registrationsEnabled = config.settings.general.registrations.enabled

  return (
    <main className="relative min-h-[calc(100vh-57px)] overflow-hidden">
      <DynamicBackground />

      <div className="relative z-10 flex min-h-[calc(100vh-57px)] flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-[400px] space-y-8">
          {}
          <div className="flex flex-col items-center justify-center">
            <div className="relative rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/20">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/5 dark:from-white/5 dark:via-transparent dark:to-black/10" />
              <div className="relative flex flex-col items-center justify-center p-6 space-y-2">
                <Icons.logo className="h-16 w-16 text-primary filter drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-all duration-300 hover:scale-105" width={64} height={64} />
                <span className="flare-text text-3xl font-bold text-primary tracking-wide">
                  CXR-Lab
                </span>
              </div>
            </div>
          </div>

          {}
          <div className="relative rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/20">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/5 dark:from-white/5 dark:via-transparent dark:to-black/10" />
            <div className="relative p-8">
              <LoginForm
                registrationsEnabled={registrationsEnabled}
                disabledMessage={
                  config.settings.general.registrations.disabledMessage
                }
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
