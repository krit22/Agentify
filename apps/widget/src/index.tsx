import { h, render } from 'preact'
import { useState, useEffect, useRef } from 'preact/hooks'
import gsap from 'gsap'

// Inline SVG Icons for minimal weight and absolute tree-shaking
const MessageIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
)

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
)

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
)

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
    <polyline points="22 4 12 14.01 9 11.01"></polyline>
  </svg>
)

const SpinnerIcon = () => (
  <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="2" x2="12" y2="6"></line>
    <line x1="12" y1="18" x2="12" y2="22"></line>
    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
    <line x1="2" y1="12" x2="6" y2="12"></line>
    <line x1="18" y1="12" x2="22" y2="12"></line>
    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
  </svg>
)

const parseMarkdown = (text: string): string => {
  if (!text) return ''

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  html = html.replace(/^### (.*?)$/gm, '<h4 class="font-bold text-xs mt-3 mb-1 text-zinc-900 dark:text-zinc-50">$1</h4>')
  html = html.replace(/^## (.*?)$/gm, '<h3 class="font-bold text-sm mt-4 mb-2 text-zinc-900 dark:text-zinc-50">$1</h3>')
  html = html.replace(/^# (.*?)$/gm, '<h2 class="font-bold text-base mt-4 mb-2 text-zinc-900 dark:text-zinc-50">$1</h2>')

  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-zinc-900 dark:text-zinc-50">$1</strong>')
  html = html.replace(/^\s*[\*\-]\s+(.*?)$/gm, '<li class="list-disc ml-4 pl-1 my-1 text-zinc-700 dark:text-zinc-300">$1</li>')
  html = html.replace(/^\>\s+(.*?)$/gm, '<blockquote class="border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 my-2 italic text-zinc-600 dark:text-zinc-400">$1</blockquote>')
  html = html.replace(/`(.*?)`/g, '<code class="bg-zinc-200/60 dark:bg-zinc-800 px-1 rounded text-red-500 font-mono text-[10px]">$1</code>')

  const paragraphs = html.split('\n\n')
  const rendered = paragraphs.map((p) => {
    if (p.startsWith('<h') || p.startsWith('<li') || p.startsWith('<block')) {
      return p.replace(/\n/g, '<br />')
    }
    return `<div class="mb-2 last:mb-0">${p.replace(/\n/g, '<br />')}</div>`
  })

  return rendered.join('')
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AppProps {
  orgId: string
  apiHost: string
  brandColor: string
  greetingMessage: string
  escalationSLAHours: number
  isInline: boolean
}

export function App({
  orgId,
  apiHost,
  brandColor,
  greetingMessage,
  escalationSLAHours,
  isInline
}: AppProps) {
  const [isOpen, setIsOpen] = useState(isInline)
  const [view, setView] = useState<'chat' | 'escalation' | 'success'>('chat')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: greetingMessage }
  ])
  const [inputText, setInputText] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')

  // Escalation form fields
  const [email, setEmail] = useState('')
  const [summary, setSummary] = useState('')
  const [isSubmittingEscalation, setIsSubmittingEscalation] = useState(false)
  const [escalationError, setEscalationError] = useState('')

  // Refs for layouts and scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatWindowRef = useRef<HTMLDivElement>(null)
  const launcherRef = useRef<HTMLButtonElement>(null)

  // Resolve session UUID from sessionStorage to persist conversations across page loads
  const getSessionId = () => {
    let sid = sessionStorage.getItem(`aegis_sid_${orgId}`)
    if (!sid) {
      sid = crypto.randomUUID()
      sessionStorage.setItem(`aegis_sid_${orgId}`, sid)
    }
    return sid
  }

  // Scroll message board to bottom on updates
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamText, isStreaming])

  // GSAP animation triggers for expanding/shrinking widget card
  useEffect(() => {
    if (isInline) return // Skip floating animations if inline

    if (isOpen) {
      // Transition Open Chat window
      gsap.killTweensOf(chatWindowRef.current)
      gsap.set(chatWindowRef.current, { display: 'flex', scale: 0.85, opacity: 0, y: 30 })
      gsap.to(chatWindowRef.current, {
        scale: 1,
        opacity: 1,
        y: 0,
        duration: 0.35,
        ease: 'power3.out'
      })
      
      // Rotate Launcher icon
      gsap.to(launcherRef.current, { rotate: 90, scale: 0.9, duration: 0.25 })
    } else {
      // Transition Close Chat Window
      gsap.killTweensOf(chatWindowRef.current)
      gsap.to(chatWindowRef.current, {
        scale: 0.85,
        opacity: 0,
        y: 30,
        duration: 0.25,
        ease: 'power3.in',
        onComplete: () => {
          gsap.set(chatWindowRef.current, { display: 'none' })
        }
      })
      
      // Restore Launcher icon
      gsap.to(launcherRef.current, { rotate: 0, scale: 1, duration: 0.25 })
    }
  }, [isOpen, isInline])

  const handleSendMessage = async (e: h.JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault()
    const query = inputText.trim()
    if (!query || isStreaming) return

    setInputText('')
    setMessages((prev) => [...prev, { role: 'user', content: query }])
    setIsStreaming(true)
    setStreamText('')

    try {
      const sessionId = getSessionId()
      const response = await fetch(`${apiHost}/api/widget/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId,
          sessionId,
          message: query,
        }),
      })

      if (!response.ok) {
        throw new Error('Server responded with an error status.')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let accumulatedText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            if (trimmed === 'data: [DONE]') break

            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6))
                if (parsed.error) {
                  throw new Error(parsed.error)
                }
                const content = parsed.text || ''
                if (content) {
                  accumulatedText += content
                  setStreamText(accumulatedText)
                }
              } catch (e) {
                // ignore parsing exceptions for incomplete SSE streams
              }
            }
          }
        }
      }

      // Conclude Assistant Reply message
      setMessages((prev) => [...prev, { role: 'assistant', content: accumulatedText }])
    } catch (err: any) {
      console.error('Chat error:', err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'I encountered a connection error. Would you like to escalate this issue to our support team?'
        }
      ])
    } finally {
      setIsStreaming(false)
      setStreamText('')
    }
  }

  const handleEscalationSubmit = async (e: h.JSX.TargetedEvent<HTMLFormElement, Event>) => {
    e.preventDefault()
    if (!email.trim() || !summary.trim() || isSubmittingEscalation) return

    setIsSubmittingEscalation(true)
    setEscalationError('')

    try {
      const sessionId = getSessionId()
      const response = await fetch(`${apiHost}/api/widget/escalate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orgId,
          sessionId,
          userEmail: email.trim(),
          userSummary: summary.trim(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit escalation request.')
      }

      setView('success')
    } catch (err: any) {
      setEscalationError(err.message || 'Failed to connect. Please try again.')
    } finally {
      setIsSubmittingEscalation(false)
    }
  }

  const startNewConversation = () => {
    // Clear Session storage and reset states
    sessionStorage.removeItem(`aegis_sid_${orgId}`)
    setMessages([{ role: 'assistant', content: greetingMessage }])
    setView('chat')
    setEmail('')
    setSummary('')
  }

  // Common Header component inside the card
  const WidgetHeader = () => (
    <header 
      className="p-4 border-b border-zinc-100 dark:border-zinc-900 flex justify-between items-center rounded-t-2xl text-white select-none shrink-0 shadow-xs"
      style={{ backgroundColor: brandColor }}
    >
      <div className="flex items-center gap-2">
        <div className="size-2 bg-emerald-400 rounded-full animate-pulse" />
        <span className="font-bold text-sm tracking-wide">Aegis AI Support</span>
      </div>
      {!isInline && (
        <button 
          onClick={() => setIsOpen(false)}
          className="text-white/80 hover:text-white hover:bg-white/10 p-1 rounded-lg transition-colors cursor-pointer outline-hidden"
        >
          <CloseIcon />
        </button>
      )}
    </header>
  )

  return (
    <div className={`font-sans text-zinc-800 dark:text-zinc-200 ${isInline ? 'w-full h-full' : ''}`}>
      {/* 1. CHAT DISPLAY PANEL CARD */}
      <div
        ref={chatWindowRef}
        className={`
          border border-zinc-200/80 bg-white/95 dark:border-zinc-850 dark:bg-zinc-950/95 shadow-2xl flex-col
          ${isInline 
            ? 'w-full h-full rounded-2xl flex' 
            : 'fixed bottom-22 right-6 w-96 h-[600px] max-h-[calc(100vh-120px)] rounded-2xl z-[99999] hidden'
          }
        `}
      >
        <WidgetHeader />

        {/* VIEW A: MESSAGING BOARD VIEW */}
        {view === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0 bg-zinc-50/30 dark:bg-zinc-900/10">
            {/* Scrollable Transcript view */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'self-end' : 'self-start'}`}
                >
                  <div 
                    className={`
                      text-xs px-3.5 py-2.5 rounded-2xl leading-relaxed shadow-xs
                      ${msg.role === 'user' 
                        ? 'text-white rounded-br-none whitespace-pre-wrap' 
                        : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 border border-zinc-200/40 dark:border-zinc-800/40 rounded-bl-none'
                      }
                    `}
                    style={msg.role === 'user' ? { backgroundColor: brandColor } : undefined}
                  >
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <div dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content) }} />
                    )}
                  </div>
                </div>
              ))}

              {/* Streaming loading token chunk bubbles */}
              {isStreaming && streamText && (
                <div className="flex flex-col max-w-[80%] self-start">
                  <div className="text-xs px-3.5 py-2.5 rounded-2xl rounded-bl-none bg-zinc-100 text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 border border-zinc-200/40 dark:border-zinc-800/40 leading-relaxed shadow-xs">
                    <div dangerouslySetInnerHTML={{ __html: parseMarkdown(streamText) }} />
                  </div>
                </div>
              )}

              {/* Loader Dot Bubble */}
              {isStreaming && !streamText && (
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/40 dark:border-zinc-800/40 px-3.5 py-3 rounded-2xl rounded-bl-none self-start shadow-xs">
                  <span className="size-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="size-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="size-1.5 bg-zinc-400 dark:bg-zinc-600 rounded-full animate-bounce" />
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* In-view escalation warning banner */}
            {messages.length > 2 && !isStreaming && (
              <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-900 bg-zinc-50/50 dark:bg-zinc-900/10 flex justify-between items-center text-[10px]">
                <span className="text-zinc-500">Need immediate support?</span>
                <button 
                  onClick={() => {
                    setView('escalation')
                    setSummary(messages[messages.length - 2]?.content || '')
                  }}
                  className="font-bold underline cursor-pointer outline-hidden hover:opacity-80"
                  style={{ color: brandColor }}
                >
                  Connect with human agent
                </button>
              </div>
            )}

            {/* Input area footer */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-100 dark:border-zinc-900 bg-white dark:bg-zinc-950 rounded-b-2xl flex gap-2 shrink-0">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText((e.target as HTMLInputElement).value)}
                placeholder="Type your message..."
                disabled={isStreaming}
                className="flex-1 bg-zinc-50 dark:bg-zinc-900 text-xs border border-zinc-200/80 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 outline-hidden focus:border-zinc-300 dark:focus:border-zinc-700 transition-colors disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isStreaming}
                className="text-white p-2.5 rounded-xl transition-all cursor-pointer outline-hidden shrink-0 flex items-center justify-center disabled:opacity-40 disabled:scale-95 disabled:cursor-not-allowed hover:brightness-105 active:scale-95"
                style={{ backgroundColor: brandColor }}
              >
                <SendIcon />
              </button>
            </form>
          </div>
        )}

        {/* VIEW B: SUPPORT ESCALATION FORM VIEW */}
        {view === 'escalation' && (
          <form onSubmit={handleEscalationSubmit} className="flex-1 flex flex-col min-h-0 p-4">
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1.5 select-none">
                <span className="text-sm font-bold text-zinc-900 dark:text-white">Escalate to support agent</span>
                <p className="text-xs text-zinc-500">
                  Our bot couldn&apos;t resolve your query. File a direct ticket and our support team will get back to you via email.
                </p>
              </div>

              {/* Email Address */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="userEmail" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Your Email Address
                </label>
                <input
                  id="userEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail((e.target as HTMLInputElement).value)}
                  placeholder="name@domain.com"
                  className="bg-zinc-50 dark:bg-zinc-900 text-xs border border-zinc-200/80 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 outline-hidden focus:border-zinc-300 dark:focus:border-zinc-700 transition-colors"
                />
              </div>

              {/* Request Description */}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="userSummary" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Description of Issue
                </label>
                <textarea
                  id="userSummary"
                  required
                  rows={4}
                  value={summary}
                  onChange={(e) => setSummary((e.target as HTMLTextAreaElement).value)}
                  placeholder="Describe what you need help with..."
                  className="bg-zinc-50 dark:bg-zinc-900 text-xs border border-zinc-200/80 dark:border-zinc-800 rounded-xl px-3.5 py-2.5 outline-hidden focus:border-zinc-300 dark:focus:border-zinc-700 transition-colors resize-none"
                />
              </div>

              {escalationError && (
                <div className="rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 p-3 text-xs text-red-600 dark:text-red-400 select-none">
                  {escalationError}
                </div>
              )}
            </div>

            {/* Buttons footer */}
            <div className="border-t border-zinc-100 dark:border-zinc-900 pt-3 mt-3 flex justify-end gap-2 shrink-0 select-none">
              <button
                type="button"
                onClick={() => setView('chat')}
                className="text-xs px-4 py-2 border border-zinc-200/80 dark:border-zinc-800 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer outline-hidden transition-colors"
              >
                Go back
              </button>
              <button
                type="submit"
                disabled={isSubmittingEscalation}
                className="text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer outline-hidden transition-all flex items-center gap-1.5 hover:brightness-105 active:scale-95 disabled:opacity-50"
                style={{ backgroundColor: brandColor }}
              >
                {isSubmittingEscalation ? (
                  <>
                    <SpinnerIcon /> Sending...
                  </>
                ) : (
                  'Send Ticket'
                )}
              </button>
            </div>
          </form>
        )}

        {/* VIEW C: SUCCESS SCREEN */}
        {view === 'success' && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none bg-zinc-50/10 dark:bg-zinc-900/10">
            <div className="size-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center mb-4">
              <CheckIcon />
            </div>
            <span className="text-base font-bold text-zinc-900 dark:text-white">Ticket Submitted</span>
            <p className="text-xs text-zinc-500 mt-2 max-w-[240px] leading-relaxed">
              Your inquiry has been successfully filed. We will reach out to you at <span className="font-semibold text-zinc-700 dark:text-zinc-300">{email}</span> within {escalationSLAHours} hours.
            </p>
            <button
              onClick={startNewConversation}
              className="mt-6 text-white text-xs font-semibold px-4 py-2 rounded-xl cursor-pointer outline-hidden transition-all hover:brightness-105 active:scale-95"
              style={{ backgroundColor: brandColor }}
            >
              Start New Chat
            </button>
          </div>
        )}
      </div>

      {/* 2. FLOATING FAB LAUNCHER BUBBLE */}
      {!isInline && (
        <button
          ref={launcherRef}
          onClick={() => setIsOpen(!isOpen)}
          className="fixed bottom-6 right-6 size-14 rounded-full shadow-lg flex items-center justify-center text-white cursor-pointer z-[99999] outline-hidden select-none hover:scale-105 active:scale-95"
          style={{ backgroundColor: brandColor }}
        >
          {isOpen ? <CloseIcon /> : <MessageIcon />}
        </button>
      )}
    </div>
  )
}

// Global bootstrap mounting hook called by the loader
export function init(
  container: HTMLElement,
  config: {
    orgId: string
    apiHost: string
    brandColor: string
    greetingMessage: string
    escalationSLAHours: number
    isInline: boolean
  }
) {
  render(h(App, config), container)
}
