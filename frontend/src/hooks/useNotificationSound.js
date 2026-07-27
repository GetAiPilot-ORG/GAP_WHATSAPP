import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import notificationSounds from 'virtual:notification-sounds'

const FALLBACK_NOTIFICATION_SOUND = {
    id: 'notification-sound',
    label: 'Notification sound',
    src: '',
}

export const NOTIFICATION_SOUNDS = notificationSounds.length > 0
    ? notificationSounds
    : [FALLBACK_NOTIFICATION_SOUND]

const ENABLED_STORAGE_KEY = 'gap_notification_sound_enabled'
const SOUND_STORAGE_KEY = 'gap_notification_sound_file'
const VOLUME_STORAGE_KEY = 'gap_notification_sound_volume'
const RATE_LIMIT_MS = 1800
const RECENT_MESSAGE_TTL_MS = 10000

const readBoolean = (key, fallback) => {
    try {
        const value = localStorage.getItem(key)
        if (value == null) return fallback
        return value === 'true'
    } catch {
        return fallback
    }
}

const readNumber = (key, fallback) => {
    try {
        const value = Number(localStorage.getItem(key))
        return Number.isFinite(value) ? value : fallback
    } catch {
        return fallback
    }
}

const clampVolume = (value) => Math.min(1, Math.max(0, Number(value) || 0))

export function useNotificationSound() {
    const audioRef = useRef(null)
    const lastPlayedRef = useRef(0)
    const unlockedRef = useRef(false)
    const recentMessageIdsRef = useRef(new Map())

    const [isEnabled, setIsEnabledState] = useState(() => readBoolean(ENABLED_STORAGE_KEY, true))
    const [selectedSoundId, setSelectedSoundIdState] = useState(() => {
        try {
            const stored = localStorage.getItem(SOUND_STORAGE_KEY)
            return NOTIFICATION_SOUNDS.some(sound => sound.id === stored) ? stored : NOTIFICATION_SOUNDS[0].id
        } catch {
            return NOTIFICATION_SOUNDS[0].id
        }
    })
    const [volume, setVolumeState] = useState(() => clampVolume(readNumber(VOLUME_STORAGE_KEY, 0.7)))

    const isEnabledRef = useRef(isEnabled)
    const selectedSoundIdRef = useRef(selectedSoundId)
    const volumeRef = useRef(volume)

    useEffect(() => {
        isEnabledRef.current = isEnabled
    }, [isEnabled])

    useEffect(() => {
        selectedSoundIdRef.current = selectedSoundId
    }, [selectedSoundId])

    useEffect(() => {
        volumeRef.current = volume
    }, [volume])

    const selectedSound = useMemo(
        () => NOTIFICATION_SOUNDS.find(sound => sound.id === selectedSoundId) || NOTIFICATION_SOUNDS[0],
        [selectedSoundId]
    )

    const getSoundById = useCallback((soundId) => (
        NOTIFICATION_SOUNDS.find(sound => sound.id === soundId) || NOTIFICATION_SOUNDS[0]
    ), [])

    const getAudio = useCallback((soundId = selectedSoundIdRef.current) => {
        const sound = getSoundById(soundId)
        if (!audioRef.current || audioRef.current.dataset.soundId !== sound.id) {
            const audio = new Audio(sound.src)
            audio.preload = 'auto'
            audio.dataset.soundId = sound.id
            audioRef.current = audio
        }
        audioRef.current.volume = clampVolume(volumeRef.current)
        return audioRef.current
    }, [getSoundById])

    useEffect(() => {
        const unlock = () => {
            if (unlockedRef.current) return
            unlockedRef.current = true
            try {
                getAudio().load()
            } catch {
                // Browser support varies; playback will retry on the next notification.
            }
        }

        document.addEventListener('click', unlock, { once: true })
        document.addEventListener('keydown', unlock, { once: true })
        document.addEventListener('touchstart', unlock, { once: true })

        return () => {
            document.removeEventListener('click', unlock)
            document.removeEventListener('keydown', unlock)
            document.removeEventListener('touchstart', unlock)
        }
    }, [getAudio])

    const setIsEnabled = useCallback((nextValue) => {
        setIsEnabledState(prev => {
            const next = typeof nextValue === 'function' ? nextValue(prev) : nextValue
            try {
                localStorage.setItem(ENABLED_STORAGE_KEY, String(Boolean(next)))
            } catch {
                // ignore storage failures
            }
            return Boolean(next)
        })
    }, [])

    const setSelectedSoundId = useCallback((soundId) => {
        const next = getSoundById(soundId).id
        setSelectedSoundIdState(next)
        try {
            localStorage.setItem(SOUND_STORAGE_KEY, next)
        } catch {
            // ignore storage failures
        }
    }, [getSoundById])

    const setVolume = useCallback((nextVolume) => {
        const next = clampVolume(nextVolume)
        setVolumeState(next)
        if (audioRef.current) audioRef.current.volume = next
        try {
            localStorage.setItem(VOLUME_STORAGE_KEY, String(next))
        } catch {
            // ignore storage failures
        }
    }, [])

    const playNotification = useCallback(async ({ messageId, force = false } = {}) => {
        if (!force && !isEnabledRef.current) return false

        const now = Date.now()
        if (!force && now - lastPlayedRef.current < RATE_LIMIT_MS) return false

        if (messageId) {
            const recent = recentMessageIdsRef.current
            for (const [id, timestamp] of recent.entries()) {
                if (now - timestamp > RECENT_MESSAGE_TTL_MS) recent.delete(id)
            }
            if (!force && recent.has(messageId)) return false
            recent.set(messageId, now)
        }

        lastPlayedRef.current = now

        try {
            const audio = getAudio()
            audio.currentTime = 0
            await audio.play()
            return true
        } catch (err) {
            console.warn('[NotificationSound] Playback was blocked or failed:', err?.message || err)
            return false
        }
    }, [getAudio])

    return {
        isEnabled,
        setIsEnabled,
        selectedSound,
        selectedSoundId,
        setSelectedSoundId,
        volume,
        setVolume,
        sounds: NOTIFICATION_SOUNDS,
        playNotification,
    }
}
