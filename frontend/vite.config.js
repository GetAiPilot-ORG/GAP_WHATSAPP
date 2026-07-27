import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NOTIFICATION_SOUNDS_MODULE_ID = 'virtual:notification-sounds'
const RESOLVED_NOTIFICATION_SOUNDS_MODULE_ID = `\0${NOTIFICATION_SOUNDS_MODULE_ID}`
const notificationSoundsDir = path.resolve(__dirname, 'public', 'Notifications')
const supportedAudioExtensions = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.aac'])

const knownNotificationSoundMeta = {
  'dragon-studio-alert-444816.mp3': {
    id: 'dragon-studio-alert',
    label: 'Studio alert',
    tone: 'Calm',
    description: 'Polished alert tone with a soft studio-style finish.',
  },
  'dragon-studio-notification-sound-444817.mp3': {
    id: 'dragon-studio',
    label: 'Soft chime',
    tone: 'Calm',
    description: 'Soft and professional for long support shifts.',
  },
  'soynoviembre-short-digital-notification-alert-440353.mp3': {
    id: 'soynoviembre-440353',
    label: 'Digital blink',
    tone: 'Custom',
    description: 'Short digital cue added from your notification library.',
  },
  'universfield-new-notification-033-480571.mp3': {
    id: 'universfield-033',
    label: 'Quick pop',
    tone: 'Light',
    description: 'Short pop for agents handling multiple active chats.',
  },
  'universfield-new-notification-038-487899.mp3': {
    id: 'universfield-038',
    label: 'Bright ping',
    tone: 'Clear',
    description: 'Noticeable alert for busy teams.',
  },
  'universfield-new-notification-051-494246.mp3': {
    id: 'universfield-051',
    label: 'Gentle pulse',
    tone: 'Smooth',
    description: 'Rounded alert that feels present without being harsh.',
  },
  'universfield-new-notification-056-494256.mp3': {
    id: 'universfield-056',
    label: 'Clean tap',
    tone: 'Balanced',
    description: 'Low-distraction tap for focused work.',
  },
  'universfield-new-notification-057-494255.mp3': {
    id: 'universfield-057',
    label: 'Fresh ping',
    tone: 'Crisp',
    description: 'Clean new-message cue with a little more lift.',
  },
  'universfield-new-notification-09-352705.mp3': {
    id: 'universfield-09',
    label: 'Short alert',
    tone: 'Minimal',
    description: 'Very short alert for quiet workspaces.',
  },
}

const toSoundId = (fileName) => (
  path.basename(fileName, path.extname(fileName))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
)

const getNotificationSounds = () => {
  if (!fs.existsSync(notificationSoundsDir)) return []

  let customSoundCount = 0

  return fs.readdirSync(notificationSoundsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && supportedAudioExtensions.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
    .map((entry) => {
      const meta = knownNotificationSoundMeta[entry.name] || {}
      const isKnownSound = Boolean(knownNotificationSoundMeta[entry.name])
      if (!isKnownSound) customSoundCount += 1

      return {
        id: meta.id || toSoundId(entry.name),
        label: meta.label || `Custom alert ${customSoundCount}`,
        tone: meta.tone || 'Custom',
        description: meta.description || 'Added from your Notifications folder. Click to preview and select.',
        src: `/Notifications/${entry.name}`,
      }
    })
}

const notificationSoundsPlugin = () => ({
  name: 'gap-notification-sounds',
  resolveId(id) {
    if (id === NOTIFICATION_SOUNDS_MODULE_ID) return RESOLVED_NOTIFICATION_SOUNDS_MODULE_ID
    return null
  },
  load(id) {
    if (id !== RESOLVED_NOTIFICATION_SOUNDS_MODULE_ID) return null

    return `export default ${JSON.stringify(getNotificationSounds(), null, 2)}\n`
  },
  configureServer(server) {
    if (fs.existsSync(notificationSoundsDir)) {
      server.watcher.add(notificationSoundsDir)
    }

    const invalidateNotificationSounds = (filePath) => {
      const absoluteFilePath = path.resolve(filePath)
      const relativePath = path.relative(notificationSoundsDir, absoluteFilePath)
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return
      if (!supportedAudioExtensions.has(path.extname(absoluteFilePath).toLowerCase())) return

      const module = server.moduleGraph.getModuleById(RESOLVED_NOTIFICATION_SOUNDS_MODULE_ID)
      if (module) server.moduleGraph.invalidateModule(module)
      server.ws.send({ type: 'full-reload' })
    }

    server.watcher.on('add', invalidateNotificationSounds)
    server.watcher.on('unlink', invalidateNotificationSounds)
    server.watcher.on('change', invalidateNotificationSounds)
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl(), notificationSoundsPlugin()],
  server: {
    port: 3000,
    strictPort: true,
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.loca.lt'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      '/webhook': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
})
