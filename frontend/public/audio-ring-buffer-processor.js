class AudioRingBufferProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    // 3-second ring buffer at 48kHz (typical browser sample rate)
    this.bufferSize = 48000 * 3
    this.buffer = new Float32Array(this.bufferSize)
    this.writeIndex = 0
    this.isStreaming = false

    this.port.onmessage = (event) => {
      if (event.data.type === 'snapshot') {
        // Return ordered ring buffer contents (oldest to newest)
        const snapshot = new Float32Array(this.bufferSize)
        for (let i = 0; i < this.bufferSize; i++) {
          snapshot[i] = this.buffer[(this.writeIndex + i) % this.bufferSize]
        }
        this.port.postMessage({ type: 'snapshot', buffer: snapshot })
      } else if (event.data.type === 'startStreaming') {
        this.isStreaming = true
      } else if (event.data.type === 'stopStreaming') {
        this.isStreaming = false
      }
    }
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channelData = input[0]

    // Always write to ring buffer
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.writeIndex] = channelData[i]
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize
    }

    // When streaming, forward live audio to main thread
    if (this.isStreaming) {
      // Use slice() to copy the data since channelData is reused
      this.port.postMessage({ type: 'audio', buffer: channelData.slice() })
    }

    return true
  }
}

registerProcessor('audio-ring-buffer-processor', AudioRingBufferProcessor)
