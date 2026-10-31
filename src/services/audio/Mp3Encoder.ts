declare global {
  interface Window {
    lamejs?: {
      Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
        encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array;
        flush: () => Int8Array;
      };
    };
  }
}

export function encodeAudioBufferToMp3(
  audioBuffer: AudioBuffer,
  kbps: 128 | 192 | 320 = 128
): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const floatSamples = audioBuffer.getChannelData(0);
  const pcm16 = new Int16Array(floatSamples.length);

  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  if (window.lamejs && window.lamejs.Mp3Encoder) {
    const mp3encoder = new window.lamejs.Mp3Encoder(1, sampleRate, kbps);
    const mp3Data: Int8Array[] = [];
    const blockSize = 1152;
    for (let i = 0; i < pcm16.length; i += blockSize) {
      const chunk = pcm16.subarray(i, i + blockSize);
      const mp3buf = mp3encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Data.push(new Int8Array(mp3buf));
      }
    }
    const endBuf = mp3encoder.flush();
    if (endBuf.length > 0) {
      mp3Data.push(new Int8Array(endBuf));
    }
    return new Blob(mp3Data, { type: 'audio/mpeg' });
  }

  throw new Error('MP3 encoder library (lamejs) is not loaded yet.');
}
