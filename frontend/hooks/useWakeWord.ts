'use client'
import { useState, useEffect, useRef } from 'react'

type UseWakeWordOptions = {
  accessKey: string
  onWakeWord: (bufferedAudio: Float32Array, workletNode: AudioWorkletNode) => void
  enabled: boolean
}

export function useWakeWord({ accessKey, onWakeWord, enabled }: UseWakeWordOptions) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const porcupineRef = useRef<any>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const onWakeWordRef = useRef(onWakeWord)
  const enabledRef = useRef(enabled)
  const setupDoneRef = useRef(false)
  onWakeWordRef.current = onWakeWord
  enabledRef.current = enabled

  // Set up the audio pipeline ONCE on mount (if we have an access key).
  // Never tear it down on state changes — only on unmount.
  useEffect(() => {
    if (!accessKey || setupDoneRef.current) return

    let cancelled = false

    async function setup() {
      try {
        const { Porcupine, BuiltInKeyword } = await import('@picovoice/porcupine-web')

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: { ideal: 48000 },
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream

        const audioContext = new AudioContext({ sampleRate: 48000 })
        audioContextRef.current = audioContext

        await audioContext.audioWorklet.addModule('/audio-ring-buffer-processor.js')
        const workletNode = new AudioWorkletNode(audioContext, 'audio-ring-buffer-processor')
        workletNodeRef.current = workletNode

        const source = audioContext.createMediaStreamSource(stream)
        source.connect(workletNode)
        workletNode.connect(audioContext.destination)

        // Snapshot handling via addEventListener (doesn't conflict with other listeners)
        let snapshotResolve: ((buf: Float32Array) => void) | null = null

        workletNode.port.addEventListener('message', (event: MessageEvent) => {
          if (event.data.type === 'snapshot' && snapshotResolve) {
            const resolve = snapshotResolve
            snapshotResolve = null
            resolve(event.data.buffer)
          }
        })
        workletNode.port.start()

        // Set up Porcupine
        const porcupine = await Porcupine.create(
          accessKey,
          [BuiltInKeyword.Alexa],
          (detection) => {
            // Only fire if enabled (not currently transcribing)
            if (!enabledRef.current) {
              console.log(`Wake word detected but ignored (busy)`)
              return
            }
            console.log(`Wake word detected: ${detection.label}`)
            workletNode.port.postMessage({ type: 'snapshot' })
            snapshotResolve = (buffer: Float32Array) => {
              onWakeWordRef.current(buffer, workletNode)
            }
          },
          { publicPath: '/porcupine/porcupine_params.pv', forceWrite: true }
        )
        if (cancelled) {
          await porcupine.release()
          return
        }
        porcupineRef.current = porcupine

        // Feed audio to Porcupine via ScriptProcessor
        const porcupineSampleRate = porcupine.sampleRate
        const porcupineFrameLength = porcupine.frameLength
        const downsampleRatio = audioContext.sampleRate / porcupineSampleRate
        let porcupineBuffer = new Int16Array(0)

        const processorBufferSize = 4096
        const scriptProcessor = (audioContext as any).createScriptProcessor(processorBufferSize, 1, 1)
        source.connect(scriptProcessor)
        scriptProcessor.connect(audioContext.destination)

        scriptProcessor.onaudioprocess = async (e: AudioProcessingEvent) => {
          if (!porcupineRef.current) return

          const inputData = e.inputBuffer.getChannelData(0)
          const downsampledLength = Math.floor(inputData.length / downsampleRatio)
          const newSamples = new Int16Array(downsampledLength)
          for (let i = 0; i < downsampledLength; i++) {
            const srcIdx = Math.floor(i * downsampleRatio)
            const sample = Math.max(-1, Math.min(1, inputData[srcIdx]))
            newSamples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
          }

          const combined = new Int16Array(porcupineBuffer.length + newSamples.length)
          combined.set(porcupineBuffer)
          combined.set(newSamples, porcupineBuffer.length)
          porcupineBuffer = combined

          while (porcupineBuffer.length >= porcupineFrameLength) {
            const frame = porcupineBuffer.slice(0, porcupineFrameLength)
            porcupineBuffer = porcupineBuffer.slice(porcupineFrameLength)
            try {
              await porcupine.process(frame)
            } catch (err) {
              console.error('Porcupine process error:', err)
            }
          }
        }

        setupDoneRef.current = true
        setIsListening(true)
        setError(null)
      } catch (err) {
        console.error('Wake word setup error:', err)
        setError(err instanceof Error ? err.message : 'Failed to set up wake word detection')
        setIsListening(false)
      }
    }

    setup()

    return () => {
      cancelled = true
      setupDoneRef.current = false
      setIsListening(false)

      if (porcupineRef.current) {
        porcupineRef.current.release().catch(console.error)
        porcupineRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(console.error)
        audioContextRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      workletNodeRef.current = null
    }
  }, [accessKey]) // Only depends on accessKey, NOT enabled

  return { isListening, error }
}
