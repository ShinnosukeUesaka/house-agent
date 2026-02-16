'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

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
  const resampleBufferRef = useRef<Float32Array>(new Float32Array(0))
  const onWakeWordRef = useRef(onWakeWord)
  onWakeWordRef.current = onWakeWord

  useEffect(() => {
    if (!enabled || !accessKey) return

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
        // Connect to destination to keep the audio pipeline alive
        workletNode.connect(audioContext.destination)

        // Set up Porcupine
        let snapshotResolve: ((buf: Float32Array) => void) | null = null

        const porcupine = await Porcupine.create(
          accessKey,
          [BuiltInKeyword.Alexa],
          (detection) => {
            console.log(`Wake word detected: ${detection.label}`)
            // Request ring buffer snapshot from worklet
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

        const porcupineSampleRate = porcupine.sampleRate // 16000
        const porcupineFrameLength = porcupine.frameLength // 512
        const downsampleRatio = audioContext.sampleRate / porcupineSampleRate
        let porcupineBuffer = new Int16Array(0)

        // Handle messages from the AudioWorklet
        workletNode.port.onmessage = async (event) => {
          if (event.data.type === 'snapshot' && snapshotResolve) {
            const resolve = snapshotResolve
            snapshotResolve = null
            resolve(event.data.buffer)
            return
          }

          if (event.data.type === 'audio') {
            // This is live audio for streaming (handled by useRealtimeSTT)
            return
          }

          // Default: audio data from the worklet for Porcupine processing
          // (we use the ring buffer's continuous writing, but also need to feed Porcupine)
        }

        // Set up a ScriptProcessorNode as a fallback to get audio for Porcupine
        // since the worklet is primarily for the ring buffer
        // Actually, let's use a separate listener on the worklet
        // We'll modify the worklet to always send audio for processing too

        // Better approach: create an AnalyserNode or use another connection
        // Simplest: use a second AudioWorkletNode or use the worklet to always forward audio
        // Let's use a simple approach: connect a script processor for Porcupine

        // Actually, let's just handle it in the worklet - it always writes to buffer
        // We need audio data on the main thread for Porcupine, so let's always forward it

        // Re-setup: the worklet always sends audio data, we process for Porcupine here
        // We need to modify the worklet to always post audio... but we don't want to when streaming
        // Solution: use a MediaStreamAudioSourceNode -> split -> one branch to worklet, one to ScriptProcessor

        // Cleanest approach: create a separate processing pipeline for Porcupine
        const processorBufferSize = 4096
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const scriptProcessor = (audioContext as any).createScriptProcessor(processorBufferSize, 1, 1)
        source.connect(scriptProcessor)
        scriptProcessor.connect(audioContext.destination)

        scriptProcessor.onaudioprocess = async (e: AudioProcessingEvent) => {
          if (!porcupineRef.current) return

          const inputData = e.inputBuffer.getChannelData(0)

          // Downsample to 16kHz and convert to Int16
          const downsampledLength = Math.floor(inputData.length / downsampleRatio)
          const newSamples = new Int16Array(downsampledLength)
          for (let i = 0; i < downsampledLength; i++) {
            const srcIdx = Math.floor(i * downsampleRatio)
            const sample = Math.max(-1, Math.min(1, inputData[srcIdx]))
            newSamples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
          }

          // Append to buffer
          const combined = new Int16Array(porcupineBuffer.length + newSamples.length)
          combined.set(porcupineBuffer)
          combined.set(newSamples, porcupineBuffer.length)
          porcupineBuffer = combined

          // Process complete frames
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
  }, [enabled, accessKey])

  return { isListening, error, workletNode: workletNodeRef.current }
}
