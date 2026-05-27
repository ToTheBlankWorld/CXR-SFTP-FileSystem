'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Crown, MessageSquare, Send, Shield } from 'lucide-react'
import { useSession } from 'next-auth/react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useToast } from '@/hooks/use-toast'

interface ChatMessage {
  id: string
  message: string
  createdAt: string
  userId: string
  user: {
    id: string
    name: string | null
    email: string | null
    role: string
    image: string | null
  }
}

interface TeamChatSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  chatFolderId: string
  chatFolderName: string
}

export function TeamChatSheet({
  isOpen,
  onOpenChange,
  chatFolderId,
  chatFolderName,
}: TeamChatSheetProps) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const currentUserId = session?.user?.id

  // URL encode the folder ID path segment
  const folderPathSegment = chatFolderId
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/folders/chat/${folderPathSegment}`)
      if (!res.ok) throw new Error('Failed to load chat history')
      const data = await res.json()
      setMessages(data.data || [])
    } catch (err) {
      console.error('Error fetching chat messages:', err)
    }
  }, [folderPathSegment])

  // Poll for new messages every 3 seconds when open
  useEffect(() => {
    if (!isOpen) return
    fetchMessages()
    const interval = setInterval(fetchMessages, 3000)
    return () => clearInterval(interval)
  }, [isOpen, fetchMessages])

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || isSending) return

    setIsSending(true)
    const pendingMessage = newMessage.trim()
    setNewMessage('')

    try {
      const res = await fetch(`/api/folders/chat/${folderPathSegment}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: pendingMessage }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to send message')
      }
      await fetchMessages()
    } catch (err) {
      toast({
        title: 'Failed to send message',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
      setNewMessage(pendingMessage) // Restore text on failure
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md h-full flex flex-col p-0 bg-background/95 border-l border-border/50 backdrop-blur-xl shadow-2xl"
      >
        <SheetHeader className="p-4 border-b border-border/50 bg-card/20 flex flex-row items-center gap-2.5 space-y-0">
          <div className="rounded-full bg-purple-500/10 p-2 text-purple-500 ring-1 ring-purple-500/20">
            <MessageSquare className="h-5 w-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-sm font-semibold truncate leading-none">
              {chatFolderName} Chat
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1 truncate">
              Team communication room
            </SheetDescription>
          </div>
        </SheetHeader>

        {/* Message Stream */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 p-8">
              <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">
                No messages yet.
              </p>
              <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-xs">
                Start the conversation! Everyone in the team can join.
              </p>
            </div>
          ) : (
            messages.map((m) => {
              const isSelf = m.userId === currentUserId
              const senderInitials = (m.user.name || m.user.email || '?')
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()

              return (
                <div
                  key={m.id}
                  className={`flex gap-3 max-w-[85%] ${isSelf ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5 border border-border/40">
                    <AvatarImage src={m.user.image || undefined} />
                    <AvatarFallback className="text-[10px] font-semibold bg-muted-foreground/10">
                      {senderInitials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="space-y-1 min-w-0">
                    {/* Sender Header */}
                    {!isSelf && (
                      <div className="flex items-center gap-1.5 px-1">
                        <span className="text-[11px] font-medium text-muted-foreground truncate max-w-[150px]">
                          {m.user.name || m.user.email}
                        </span>
                        {m.user.role === 'OWNER' ? (
                          <Crown className="h-3 w-3 text-yellow-500" />
                        ) : m.user.role === 'ADMIN' ? (
                          <Shield className="h-3 w-3 text-primary" />
                        ) : null}
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={`p-3 rounded-2xl text-sm break-words shadow-sm leading-relaxed ${
                        isSelf
                          ? 'bg-purple-600 text-white rounded-tr-none'
                          : 'bg-card border border-border/50 rounded-tl-none text-foreground'
                      }`}
                    >
                      {m.message}
                    </div>

                    {/* Timestamp */}
                    <div
                      className={`text-[9px] text-muted-foreground/70 px-1.5 ${isSelf ? 'text-right' : ''}`}
                    >
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSendMessage}
          className="p-4 border-t border-border/50 bg-card/20 flex gap-2 items-center"
        >
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            maxLength={1000}
            className="flex-1 bg-background/50 border-border focus:border-purple-500"
            disabled={isSending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || isSending}
            className="bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
