'use client'

import Link from 'next/link'

import { RefreshCcw } from 'lucide-react'

import { Icons } from '@/components/shared/icons'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  console.error('[ErrorBoundary]', error.message, error.digest, error.stack)

  return (
    <div className="flex-1 relative min-h-screen flex flex-col">
      <div className="absolute top-6 left-6">
        <Link href="/dashboard" className="flex items-center space-x-2.5">
          <Icons.logo className="h-6 w-6" />
          <span className="flare-text text-lg">CXR-Lab</span>
        </Link>
      </div>

      <main className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-7xl font-bold">500</CardTitle>
            <CardDescription className="text-xl mt-2">
              {process.env.NODE_ENV === 'development'
                ? error.message
                : 'Something went wrong'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-2">
            <Button onClick={() => reset()} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Try Again
            </Button>
            <Button variant="link" size="sm" asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
