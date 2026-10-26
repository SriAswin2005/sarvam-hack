// Capture uncompressed mono PCM and encode an actual 16 kHz WAV, independent of browser codecs.
export function encodeWav(chunks, inputRate, outputRate = 16000) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const input = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) { input.set(chunk, offset); offset += chunk.length; }
  const count = Math.floor(total * outputRate / inputRate);
  const buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
  const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, outputRate, true); view.setUint32(28, outputRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, count * 2, true);
  const ratio = inputRate / outputRate;
  for (let i = 0; i < count; i++) {
    // Average source samples when downsampling, instead of discarding samples.
    const start = Math.floor(i * ratio), end = Math.min(total, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const sample = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export class WavRecorder {
  constructor(stream, onLevel) { this.stream = stream; this.onLevel = onLevel; this.state = 'inactive'; this.chunks = []; this.peak = 0; }
  async start() {
    this.context = new AudioContext();
    await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Audio capture is suspended. Open this app in Chrome or Edge and try again.');
    await this.context.audioWorklet.addModule('/pcm-worklet.js');
    this.source = this.context.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.context, 'saha-pcm', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
    this.node.port.onmessage = ({ data }) => {
      if (data.samples) {
        const samples = data.samples; this.chunks.push(samples);
        let energy = 0, peak = 0;
        for (const sample of samples) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
        this.peak = Math.max(this.peak, peak);
        this.onLevel?.(Math.sqrt(energy / samples.length), peak);
      }
      if (data.flushed) this.finishFlush?.();
    };
    this.source.connect(this.node); this.node.connect(this.context.destination);
    this.state = 'recording';
  }
  async stop() {
    if (this.state !== 'recording') return;
    this.state = 'stopping';
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 1500);
      this.finishFlush = () => { clearTimeout(timeout); resolve(); };
      this.node.port.postMessage({ flush: true });
    });
    this.source.disconnect(); this.node.disconnect();
    this.stream.getTracks().forEach(track => track.stop());
    const recording = encodeWav(this.chunks, this.context.sampleRate);
    await this.context.close(); this.state = 'inactive';
    await this.onstop?.(recording, { peak: this.peak, samples: this.chunks.reduce((sum, chunk) => sum + chunk.length, 0) });
  }
  async cancel() {
    this.source?.disconnect(); this.node?.disconnect();
    this.stream.getTracks().forEach(track => track.stop());
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.state = 'inactive';
  }
}
