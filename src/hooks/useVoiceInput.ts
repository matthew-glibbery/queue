import { useState, useRef, useCallback } from 'react'

export type VoiceState = 'idle' | 'listening' | 'processing'

interface UseVoiceInputOptions {
  onInterim?: (transcript: string) => void
  onResult: (transcript: string) => void
  onError?: (error: string) => void
}

export function useVoiceInput({ onInterim, onResult, onError }: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceState>('idle')
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const isSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const start = useCallback(() => {
    if (!isSupported || state !== 'idle') return

    const SpeechRecognition =
      (window as Window & { SpeechRecognition?: typeof window.SpeechRecognition; webkitSpeechRecognition?: typeof window.SpeechRecognition }).SpeechRecognition ||
      (window as Window & { webkitSpeechRecognition?: typeof window.SpeechRecognition }).webkitSpeechRecognition

    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onstart = () => setState('listening')

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = Array.from(event.results)
      const transcript = results.map((r) => r[0].transcript).join('')
      const isFinal = results[results.length - 1].isFinal

      if (isFinal) {
        setState('processing')
        onResult(transcript)
        setState('idle')
      } else {
        onInterim?.(transcript)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[voice] Recognition error:', event.error)
      onError?.(event.error)
      setState('idle')
    }

    recognition.onend = () => {
      if (state === 'listening') setState('idle')
    }

    recognition.start()
  }, [isSupported, state, onInterim, onResult, onError])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    setState('idle')
  }, [])

  const toggle = useCallback(() => {
    if (state === 'idle') start()
    else stop()
  }, [state, start, stop])

  return { state, isSupported, start, stop, toggle }
}
