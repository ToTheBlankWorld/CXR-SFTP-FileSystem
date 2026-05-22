'use client'

import React, { useEffect, useState } from 'react'

import Link from 'next/link'

import DOMPurify from 'dompurify'
import { LockIcon } from 'lucide-react'
import { useSession } from 'next-auth/react'

import { PasswordPrompt } from '@/components/auth/password-prompt'
import { Button } from '@/components/ui/button'


interface AuthGuardProps {
  children: React.ReactNode | ((verifiedPassword?: string) => React.ReactNode)
  file: {
    userId: string
    password: string | null
    visibility: 'PUBLIC' | 'PRIVATE' | 'USERS_AND_ADMINS' | 'USER_ONLY'
    urlPath: string
    path: string
  }
}

export function AuthGuard({ children, file }: AuthGuardProps) {
  const { data: session } = useSession()
  const [isVerified, setIsVerified] = useState(false)
  const [verifiedPassword, setVerifiedPassword] = useState<string>()

  const isOwner = session?.user?.id === file.userId
  const isPrivate = file.visibility === 'PRIVATE' && !isOwner

  useEffect(() => {
    if (file.password) {
      const searchParams = new URLSearchParams(window.location.search)
      const parentVerifiedPassword = searchParams.get('password')
      if (parentVerifiedPassword && !verifiedPassword) {
        const sanitizedPassword = DOMPurify.sanitize(parentVerifiedPassword)
        setVerifiedPassword(sanitizedPassword)
        setIsVerified(true)
      }
    }
  }, [file.password, verifiedPassword])

  if (isPrivate) {
    const showSignIn = !session?.user
    return (
      <div className="relative rounded-2xl bg-white/10 dark:bg-black/10 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-lg shadow-black/5 dark:shadow-black/20">
        {/* Glow effect */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/10 via-transparent to-black/5 dark:from-white/5 dark:via-transparent dark:to-black/10" />

        {/* Content */}
        <div className="relative flex flex-col items-center justify-center gap-4 p-8">
          <LockIcon className="h-12 w-12 text-muted-foreground" />
          <p className="text-center text-muted-foreground">
            {showSignIn
              ? 'This file is private. Please sign in to view it.'
              : 'This file is private.'}
          </p>
          <Button asChild>
            {showSignIn ? (
              <Link href={DOMPurify.sanitize('/auth/login')}>Sign In</Link>
            ) : (
              <Link href={DOMPurify.sanitize('/dashboard')}>Go to Dashboard</Link>
            )}
          </Button>
        </div>
      </div>
    )
  }

  if (file.password && !isVerified) {
    const verifyPassword = async (password: string) => {
      const sanitizedPassword = DOMPurify.sanitize(password)
      const response = await fetch(
        `/api/files/serve?path=${encodeURIComponent(file.path)}&password=${sanitizedPassword}&checkOnly=true`
      )
      if (response.ok) {
        setVerifiedPassword(sanitizedPassword)
      }
      return response.ok
    }

    return (
      <PasswordPrompt
        onSubmit={verifyPassword}
        onSuccess={() => setIsVerified(true)}
      />
    )
  }

  if (typeof children === 'function') {
    return <>{children(verifiedPassword)}</>
  }

  return (
    <>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, {
            verifiedPassword,
          } as React.Attributes)
        }
        return child
      })}
    </>
  )
}
