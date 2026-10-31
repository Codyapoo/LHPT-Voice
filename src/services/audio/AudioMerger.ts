export function mergeAudioBuffers(
  ctx: BaseAudioContext,
  buffers: AudioBuffer[]
): AudioBuffer {
  if (buffers.length === 0) {
    return ctx.createBuffer(1, 22050, 22050);
  }
  if (buffers.length === 1) return buffers[0];

  const sampleRate = buffers[0].sampleRate;
  const totalLength = buffers.reduce((acc, b) => acc + b.length, 0);
  const merged = ctx.createBuffer(1, totalLength, sampleRate);
  const output = merged.getChannelData(0);

  let offset = 0;
  for (const buf of buffers) {
    output.set(buf.getChannelData(0), offset);
    offset += buf.length;
  }
  return merged;
}
