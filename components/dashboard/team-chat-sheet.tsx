'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Crown, MessageSquare, Pencil, Send, Shield, Trash2, X } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

interface ChatMessage {
  id: string
  message: string
  createdAt: string
  editedAt?: string | null
  userId: string
  user: {
    id: string
    name: string | null
    email: string | null
    role: string
    image: string | null
  }
}

interface TeamMember {
  id: string
  name: string | null
  email: string | null
  role: string
  image: string | null
}

interface TeamChatSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  chatFolderId: string
  chatFolderName: string
  ownerId: string
  members?: TeamMember[]
}

export function TeamChatSheet({
  isOpen,
  onOpenChange,
  chatFolderId,
  chatFolderName,
  ownerId,
  members = [],
}: TeamChatSheetProps) {
  const { data: session } = useSession()
  const { toast } = useToast()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState('')
  // null = mention picker closed; otherwise the current "@query" text being typed
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [activeMentionIdx, setActiveMentionIdx] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastTypingSentTime = useRef<number>(0)
  // Tracks the newest message timestamp we already hold, for incremental polling
  const latestCreatedAtRef = useRef<string | null>(null)
  // Counts polls so we can periodically do a full reload to reconcile edits/deletes
  const pollCountRef = useRef<number>(0)

  const currentUserId = session?.user?.id
  const isOwner =
    currentUserId === ownerId ||
    session?.user?.role === 'OWNER' ||
    session?.user?.role === 'ADMIN'

  // URL encode the folder ID path segment
  const folderPathSegment = chatFolderId
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')

  // ---- @mention support ----
  const mentionLabelOf = (m: TeamMember) => m.name || m.email || 'user'

  // Candidate labels, longest first so "@John Doe" wins over "@John"
  const mentionLabels = useMemo(
    () =>
      members
        .map(mentionLabelOf)
        .filter((l): l is string => !!l)
        .sort((a, b) => b.length - a.length),
    [members]
  )

  // Labels that refer to the current user, for "you were mentioned" highlighting
  const myLabels = useMemo(() => {
    const set = new Set<string>()
    if (session?.user?.name) set.add(session.user.name.toLowerCase())
    if (session?.user?.email) set.add(session.user.email.toLowerCase())
    return set
  }, [session?.user?.name, session?.user?.email])

  const filteredMentionMembers = useMemo(() => {
    if (mentionQuery === null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => m.id !== currentUserId)
      .filter((m) => !q || mentionLabelOf(m).toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionQuery, members, currentUserId])

  // Detect a "@query" token immediately before the cursor
  const detectMention = (value: string, cursor: number): string | null => {
    const upToCursor = value.slice(0, cursor)
    const match = upToCursor.match(/(?:^|\s)@([^\s@]*)$/)
    return match ? match[1] : null
  }

  const insertMention = (member: TeamMember) => {
    const input = inputRef.current
    const cursor = input?.selectionStart ?? newMessage.length
    const upToCursor = newMessage.slice(0, cursor)
    const match = upToCursor.match(/(?:^|\s)@([^\s@]*)$/)
    if (!match) return
    const tokenStart = cursor - match[1].length - 1 // position of the '@'
    const label = mentionLabelOf(member)
    const next =
      newMessage.slice(0, tokenStart) + `@${label} ` + newMessage.slice(cursor)
    setNewMessage(next)
    setMentionQuery(null)
    setActiveMentionIdx(0)
    // Restore focus and place the cursor after the inserted mention
    requestAnimationFrame(() => {
      const pos = tokenStart + label.length + 2
      input?.focus()
      input?.setSelectionRange(pos, pos)
    })
  }

  // Split a message into plain text and highlighted @mention spans
  const renderMessageWithMentions = (text: string, isSelf: boolean) => {
    if (mentionLabels.length === 0) return text
    const nodes: React.ReactNode[] = []
    let buffer = ''
    let i = 0
    let key = 0
    const flush = () => {
      if (buffer) {
        nodes.push(buffer)
        buffer = ''
      }
    }
    while (i < text.length) {
      if (text[i] === '@') {
        const rest = text.slice(i + 1).toLowerCase()
        const matched = mentionLabels.find((l) => rest.startsWith(l.toLowerCase()))
        if (matched) {
          flush()
          const isMe = myLabels.has(matched.toLowerCase())
          nodes.push(
            <span
              key={`m-${key++}`}
              className={`rounded px-0.5 font-semibold ${
                isMe
                  ? 'bg-yellow-400/30 text-yellow-200'
                  : isSelf
                    ? 'bg-white/20 text-white'
                    : 'text-purple-400'
              }`}
            >
              @{text.slice(i + 1, i + 1 + matched.length)}
            </span>
          )
          i += 1 + matched.length
          continue
        }
      }
      buffer += text[i]
      i++
    }
    flush()
    return nodes
  }

  const messageMentionsMe = (text: string) => {
    if (myLabels.size === 0) return false
    const lower = text.toLowerCase()
    for (const label of myLabels) {
      if (lower.includes(`@${label}`)) return true
    }
    return false
  }

  const fetchMessages = useCallback(
    async (mode: 'full' | 'incremental' = 'full') => {
      try {
        const since = mode === 'incremental' ? latestCreatedAtRef.current : null
        const url = since
          ? `/api/folders/chat/${folderPathSegment}?since=${encodeURIComponent(since)}`
          : `/api/folders/chat/${folderPathSegment}`
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to load chat history')
        const data = await res.json()
        const incoming: ChatMessage[] = data.data?.messages || []
        setTypingUsers(data.data?.typingUsers || [])

        if (since) {
          // Merge new messages, de-duplicating by id
          if (incoming.length > 0) {
            setMessages((prev) => {
              const seen = new Set(prev.map((m) => m.id))
              const merged = [...prev, ...incoming.filter((m) => !seen.has(m.id))]
              return merged
            })
          }
        } else {
          setMessages(incoming)
        }

        const newest = incoming[incoming.length - 1]
        if (newest) latestCreatedAtRef.current = newest.createdAt
      } catch (err) {
        console.error('Error fetching chat messages:', err)
      }
    },
    [folderPathSegment]
  )

  const handleDeleteMessage = async (messageId: string) => {
    const previous = messages
    setMessages((prev) => prev.filter((m) => m.id !== messageId))
    try {
      const res = await fetch(`/api/chat-messages/${messageId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to delete message')
      }
    } catch (err) {
      setMessages(previous) // Restore on failure
      toast({
        title: 'Failed to delete message',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleSaveEdit = async (messageId: string) => {
    const trimmed = editingText.trim()
    if (!trimmed) return
    try {
      const res = await fetch(`/api/chat-messages/${messageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to edit message')
      }
      const updated = await res.json()
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, message: updated.data.message, editedAt: updated.data.editedAt }
            : m
        )
      )
      setEditingId(null)
      setEditingText('')
    } catch (err) {
      toast({
        title: 'Failed to edit message',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setNewMessage(value)

    // Update the @mention picker based on what's right before the cursor
    const cursor = e.target.selectionStart ?? value.length
    const query = detectMention(value, cursor)
    setMentionQuery(query)
    setActiveMentionIdx(0)

    const now = Date.now()
    if (now - lastTypingSentTime.current > 4000) {
      lastTypingSentTime.current = now
      fetch(`/api/folders/chat/${folderPathSegment}`, {
        method: 'PUT',
      }).catch((err) => console.error('Failed to send typing status', err))
    }
  }

  // Poll for new messages when open: incremental by default, full reload every ~30s
  useEffect(() => {
    if (!isOpen) return
    latestCreatedAtRef.current = null
    pollCountRef.current = 0
    fetchMessages('full')
    const interval = setInterval(() => {
      pollCountRef.current += 1
      fetchMessages(pollCountRef.current % 10 === 0 ? 'full' : 'incremental')
    }, 3000)
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
    setMentionQuery(null)

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
      await fetchMessages('incremental')
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

  const handleClearChat = async () => {
    try {
      const res = await fetch(`/api/folders/chat/${folderPathSegment}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to clear chat')
      }
      setMessages([])
      toast({ title: 'Chat cleared' })
      setIsClearConfirmOpen(false)
    } catch (err) {
      toast({
        title: 'Failed to clear chat',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
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
            <SheetDescription className="text-[11px] text-muted-foreground mt-1 truncate">
              {typingUsers.length > 0 ? (
                <span className="text-purple-400 font-semibold flex items-center gap-1 animate-pulse">
                  <span className="flex gap-0.5 items-center mr-1">
                    <span className="h-1 w-1 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="h-1 w-1 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <span className="h-1 w-1 bg-purple-400 rounded-full animate-bounce" />
                  </span>
                  {typingUsers.join(', ')} typing...
                </span>
              ) : (
                'Team communication room'
              )}
            </SheetDescription>
          </div>
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsClearConfirmOpen(true)}
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 flex-shrink-0 mr-4"
              title="Clear Chat"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
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

                    {/* Bubble + inline actions */}
                    {editingId === m.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          maxLength={1000}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(m.id)
                            if (e.key === 'Escape') {
                              setEditingId(null)
                              setEditingText('')
                            }
                          }}
                          className="h-8 text-sm bg-background/60 border-purple-500/40"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-500 hover:text-green-400 flex-shrink-0"
                          onClick={() => handleSaveEdit(m.id)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                          onClick={() => {
                            setEditingId(null)
                            setEditingText('')
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className={`group/msg flex items-center gap-1.5 ${isSelf ? 'flex-row-reverse' : ''}`}
                      >
                        <div
                          className={`p-3 rounded-2xl text-sm break-words shadow-sm leading-relaxed ${
                            isSelf
                              ? 'bg-purple-600 text-white rounded-tr-none'
                              : 'bg-card border border-border/50 rounded-tl-none text-foreground'
                          } ${
                            messageMentionsMe(m.message)
                              ? 'ring-2 ring-yellow-400/60'
                              : ''
                          }`}
                        >
                          {renderMessageWithMentions(m.message, isSelf)}
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity flex-shrink-0">
                          {isSelf && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-purple-400"
                              title="Edit"
                              onClick={() => {
                                setEditingId(m.id)
                                setEditingText(m.message)
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                          {(isSelf || isOwner) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive"
                              title="Delete"
                              onClick={() => handleDeleteMessage(m.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Timestamp */}
                    <div
                      className={`text-[9px] text-muted-foreground/70 px-1.5 ${isSelf ? 'text-right' : ''}`}
                    >
                      {new Date(m.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {m.editedAt && <span className="italic ml-1">(edited)</span>}
                    </div>
                  </div>
                </div>
              )
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="relative">
          {/* @mention autocomplete */}
          {mentionQuery !== null && filteredMentionMembers.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 rounded-xl border border-purple-500/30 bg-popover/95 backdrop-blur-xl shadow-2xl overflow-hidden z-10">
              {filteredMentionMembers.map((m, idx) => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insertMention(m)
                  }}
                  onMouseEnter={() => setActiveMentionIdx(idx)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                    idx === activeMentionIdx ? 'bg-purple-500/15' : 'hover:bg-muted/50'
                  }`}
                >
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarImage src={m.image || undefined} />
                    <AvatarFallback className="text-[9px] font-semibold bg-muted-foreground/10">
                      {(m.name || m.email || '?').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate flex-1">{m.name || m.email}</span>
                  {m.role === 'OWNER' ? (
                    <Crown className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                  ) : m.role === 'ADMIN' ? (
                    <Shield className="h-3 w-3 text-primary flex-shrink-0" />
                  ) : null}
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={handleSendMessage}
            className="p-4 border-t border-border/50 bg-card/20 flex gap-2 items-center"
          >
            <Input
              ref={inputRef}
              value={newMessage}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (mentionQuery === null || filteredMentionMembers.length === 0) return
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setActiveMentionIdx((i) => (i + 1) % filteredMentionMembers.length)
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setActiveMentionIdx(
                    (i) =>
                      (i - 1 + filteredMentionMembers.length) %
                      filteredMentionMembers.length
                  )
                } else if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault()
                  insertMention(filteredMentionMembers[activeMentionIdx])
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setMentionQuery(null)
                }
              }}
              placeholder="Type a message... use @ to mention"
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
        </div>

        <Dialog open={isClearConfirmOpen} onOpenChange={setIsClearConfirmOpen}>
          <DialogContent className="sm:max-w-md border border-purple-500/20 bg-black/95 backdrop-blur-xl shadow-[0_0_50px_rgba(168,85,247,0.15)] text-foreground">
            <DialogHeader className="flex flex-col items-center gap-4 text-center">
              <div className="rounded-full bg-purple-500/10 p-3 ring-1 ring-purple-500/30">
                <Trash2 className="h-6 w-6 text-purple-500 animate-pulse" />
              </div>
              <DialogTitle className="text-xl font-bold tracking-tight">Clear Chat History</DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                Are you sure you want to clear all chat messages in this team folder? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                className="border-border/50 hover:bg-white/10"
                onClick={() => setIsClearConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                onClick={handleClearChat}
              >
                Clear Chat
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
}
