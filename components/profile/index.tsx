'use client'

import { useCallback } from 'react'

import { ProfileClientProps } from '@/types/components/profile'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ProfileAccount } from './account'
import { ProfileSecurity } from './security'

import { ProfileTools } from './tools'

export function ProfileClient({
  user,
}: ProfileClientProps) {
  const handleRefresh = useCallback(() => {
    window.location.reload()
  }, [])

  return (
    <Tabs defaultValue="profile" className="space-y-6">
      <TabsList className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileAccount user={user} onUpdate={handleRefresh} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileTools />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="security" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Security Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileSecurity onUpdate={handleRefresh} />
          </CardContent>
        </Card>
      </TabsContent>

    </Tabs>
  )
}
