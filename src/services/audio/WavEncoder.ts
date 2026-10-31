export function encodeAudioBufferToWav(
  audioBuffer: AudioBuffer,
  targetChannels: 1 | 2 = 1
): Blob {
  const sampleRate = audioBuffer.sampleRate;
  const monoData = audioBuffer.getChannelData(0);
  const numSamples = monoData.length;
  const bytesPerSample = 2;
  const blockAlign = targetChannels * bytesPerSample;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, targetChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, monoData[i]));
    const pcm16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, pcm16, true);
    offset += 2;
    if (targetChannels === 2) {
      view.setInt16(offset, pcm16, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}
