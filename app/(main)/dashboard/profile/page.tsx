import { redirect } from 'next/navigation'

import { getServerSession } from 'next-auth/next'

import { ProfileClient } from '@/components/profile'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/database/prisma'

import { LogoutButton } from './logout-button'

export default async function ProfilePage() {
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    redirect('/auth/login')
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
    },
  })

  if (!user) {
    redirect('/auth/login')
  }

  return (
    <div className="container space-y-6">
      <div className="relative rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/20">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/5 dark:from-white/5 dark:via-transparent dark:to-black/10" />
        <div className="relative p-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold">Profile</h1>
              <p className="text-muted-foreground mt-2">
                Manage your account settings and preferences
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/20">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/5 dark:from-white/5 dark:via-transparent dark:to-black/10" />
        <div className="relative p-8">
          <ProfileClient
            user={{
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              role: user.role,
              fileCount: 0,
              shortUrlCount: 0,
            }}
            isAdmin={user.role === 'ADMIN' || user.role === 'OWNER'}
          />
        </div>
      </div>
    </div>
  )
}
