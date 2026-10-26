class SahaPCM extends AudioWorkletProcessor {
  constructor() {
    super(); this.buffer = new Float32Array(2048); this.used = 0; this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data.flush) { this.stopped = true; this.flush(); this.port.postMessage({ flushed: true }); }
    };
  }
  flush() {
    if (this.used) this.port.postMessage({ samples: this.buffer.slice(0, this.used) });
    this.used = 0;
  }
  process(inputs, outputs) {
    // Keep the audio graph active without playing microphone feedback.
    for (const channel of outputs[0] || []) channel.fill(0);
    const channel = inputs[0]?.[0];
    if (!this.stopped && channel) {
      for (const sample of channel) {
        this.buffer[this.used++] = sample;
        if (this.used === this.buffer.length) this.flush();
      }
    }
    return !this.stopped;
  }
}
registerProcessor('saha-pcm', SahaPCM);
