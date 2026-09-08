import { useEffect, useMemo, useRef, useState } from 'react'
import { Mic, Square, Upload, Trash2 } from 'lucide-react'

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

async function getDurationSecondsFromBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.src = url
    audio.onloadedmetadata = () => {
      const d = Number.isFinite(audio.duration) ? audio.duration : 0
      URL.revokeObjectURL(url)
      resolve(d)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
  })
}

export default function AudioRecorderOrUploader({
  value,
  onChange,
}) {
  const inputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])

  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [error, setError] = useState('')

  const canRecord = useMemo(() => {
    return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
  }, [])

  useEffect(() => {
    if (!isRecording) return
    const t = setInterval(() => setRecordSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [isRecording])

  const startRecording = async () => {
    setError('')
    setRecordSeconds(0)

    if (!canRecord) {
      setError('Recording is not supported in this browser.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
        'audio/ogg',
      ]

      const mimeType = preferredTypes.find((t) => typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(t)) || ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        try {
          stream.getTracks().forEach((t) => t.stop())
        } catch {
          // ignore
        }

        const actualMime = recorder.mimeType || (chunksRef.current[0] && chunksRef.current[0].type) || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: actualMime })
        const durationSeconds = await getDurationSecondsFromBlob(blob)

        let ext = 'webm'
        if (actualMime.includes('mp4') || actualMime.includes('m4a')) {
          ext = 'm4a'
        } else if (actualMime.includes('aac')) {
          ext = 'aac'
        } else if (actualMime.includes('ogg')) {
          ext = 'ogg'
        }

        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: actualMime })

        onChange?.({ file, durationSeconds })
      }

      recorder.start(250)
      setIsRecording(true)
    } catch (e) {
      setError('Microphone permission denied or unavailable.')
    }
  }

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current
    if (!recorder) return

    try {
      recorder.stop()
    } catch {
      // ignore
    }
    setIsRecording(false)
  }

  const onPickFile = async (e) => {
    const f = e.target.files?.[0] || null
    if (!f) return

    setError('')
    const durationSeconds = await getDurationSecondsFromBlob(f)
    onChange?.({ file: f, durationSeconds })

    // Allow selecting the same file again
    e.target.value = ''
  }

  const clear = () => onChange?.(null)

  return (
    <div className="w-full">
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={onPickFile}
      />

      {value?.file ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-900 truncate">{value.file.name}</div>
            <div className="text-[11px] text-gray-500">Duration: {formatTime(value.durationSeconds || 0)}</div>
          </div>
          <button
            type="button"
            onClick={clear}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl font-semibold transition-colors ${
              isRecording ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isRecording ? (
              <>
                <Square className="h-4 w-4" />
                Stop ({formatTime(recordSeconds)})
              </>
            ) : (
              <>
                <Mic className="h-4 w-4" />
                Record
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800"
          >
            <Upload className="h-4 w-4" />
            Upload
          </button>
        </div>
      )}

      {error ? <div className="mt-2 text-xs text-red-600">{error}</div> : null}
    </div>
  )
}
