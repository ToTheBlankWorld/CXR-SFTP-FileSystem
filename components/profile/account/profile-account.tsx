'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'

import { ProfileAccountProps } from '@/types/components/profile'
import { useSession } from 'next-auth/react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { useToast } from '@/hooks/use-toast'

export function ProfileAccount({ user, onUpdate }: ProfileAccountProps) {
  const { update: updateSession } = useSession()
  const [isLoading, setIsLoading] = useState(false)
  const [vanityId, setVanityId] = useState(user.vanityId || '')
  const [vanityError, setVanityError] = useState<string | null>(null)
  const { toast } = useToast()
  const router = useRouter()

  const nameRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const triggerAvatarUpload = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return
    setIsLoading(true)
    try {
      const file = e.target.files[0]
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('Failed to upload avatar')
      }

      const { url } = await response.json()

      await updateSession({
        user: {
          ...user,
          image: url,
        },
      })

      router.refresh()
      onUpdate()

      toast({
        title: 'Success',
        description: 'Avatar updated successfully',
      })
    } catch (error) {
      console.error('Avatar upload error:', error)
      toast({
        title: 'Upload failed',
        description:
          error instanceof Error ? error.message : 'Failed to update avatar',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: nameRef.current?.value,
          email: emailRef.current?.value,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update profile')
      }

      const data = await response.json()

      await updateSession({
        user: {
          ...user,
          name: data.name,
          email: data.email,
        },
      })

      router.refresh()
      onUpdate()

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to update profile',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-6">
        <div className="flex flex-col items-center">
          <Avatar className="h-24 w-24">
            <AvatarImage
              src={user.image || undefined}
              alt={user.name || 'User avatar'}
              className="object-cover"
            />
            <AvatarFallback>
              {user.name?.[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={triggerAvatarUpload}
            disabled={isLoading}
            className="mt-4 w-full"
          >
            {isLoading ? 'Uploading...' : 'Change Avatar'}
          </Button>
          <Input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
        </div>

        <div className="flex-1">
          <form
            onSubmit={handleProfileUpdate}
            className="flex flex-col justify-center h-full space-y-4"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  ref={nameRef}
                  defaultValue={user.name || ''}
                  placeholder="Your username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  ref={emailRef}
                  defaultValue={user.email || ''}
                  placeholder="Your email"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="rounded-lg border p-4 mt-6">
        <div className="space-y-4">
          <div className="space-y-0.5">
            <Label htmlFor="vanity-url">Vanity URL</Label>
            <p className="text-sm text-muted-foreground">
              Set a custom URL path identifier instead of the default ID.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                id="vanity-url"
                value={vanityId}
                onChange={(e) => {
                  const value = e.target.value
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '')
                  setVanityId(value)
                  setVanityError(null)
                }}
                placeholder={`e.g. ${user.name?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'my-name'}`}
                maxLength={32}
                disabled={isLoading}
              />
              {vanityError && (
                <p className="text-sm text-destructive mt-1">{vanityError}</p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading || vanityId === (user.vanityId || '')}
              onClick={async () => {
                setIsLoading(true)
                setVanityError(null)
                try {
                  const newVanityId = vanityId.trim() || null
                  const response = await fetch('/api/profile', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ vanityId: newVanityId }),
                  })
                  if (!response.ok) {
                    const data = await response.json()
                    setVanityError(data.error || 'Failed to update vanity URL')
                    return
                  }
                  router.refresh()
                  onUpdate()
                  toast({
                    title: 'Success',
                    description: newVanityId
                      ? 'Vanity URL updated successfully'
                      : 'Vanity URL removed',
                  })
                } catch (error) {
                  setVanityError(
                    error instanceof Error
                      ? error.message
                      : 'Failed to update vanity URL'
                  )
                } finally {
                  setIsLoading(false)
                }
              }}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
            {user.vanityId && (
              <Button
                type="button"
                variant="ghost"
                disabled={isLoading}
                onClick={async () => {
                  setIsLoading(true)
                  setVanityError(null)
                  try {
                    const response = await fetch('/api/profile', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ vanityId: null }),
                    })
                    if (!response.ok) {
                      const data = await response.json()
                      setVanityError(
                        data.error || 'Failed to remove vanity URL'
                      )
                      return
                    }
                    setVanityId('')
                    router.refresh()
                    onUpdate()
                    toast({
                      title: 'Success',
                      description: 'Vanity URL removed',
                    })
                  } catch (error) {
                    setVanityError(
                      error instanceof Error
                        ? error.message
                        : 'Failed to remove vanity URL'
                    )
                  } finally {
                    setIsLoading(false)
                  }
                }}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
