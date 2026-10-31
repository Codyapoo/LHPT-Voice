import { VoiceProfile, TTSOptions } from '../../types';

export interface ITTSAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportsDirectExport: boolean;
  synthesizeChunk(
    ctx: BaseAudioContext,
    textChunk: string,
    voice: VoiceProfile,
    options: TTSOptions
  ): Promise<AudioBuffer>;
}

export class AcousticFormantSynthAdapter implements ITTSAdapter {
  public readonly id = 'acoustic-dsp';
  public readonly name = 'LHPT WebAudio Acoustic Formant Synthesizer (Local)';
  public readonly supportsDirectExport = true;

  public async synthesizeChunk(
    ctx: BaseAudioContext,
    textChunk: string,
    voice: VoiceProfile,
    options: TTSOptions
  ): Promise<AudioBuffer> {
    const words = (textChunk || '').trim().split(/\s+/).filter(Boolean);
    const sampleRate = options.sampleRate || 22050;
    const speedFactor = Math.max(0.5, Math.min(2.0, options.speed * (voice.speedMod || 1.0)));
    const sylDuration = 0.20 / speedFactor;
    const pauseDuration = 0.042 / speedFactor;
    const totalSyl = Math.max(2, words.length);
    const totalSeconds = Math.max(0.6, totalSyl * (sylDuration + pauseDuration) + 0.18);
    const totalSamples = Math.floor(totalSeconds * sampleRate);

    const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buffer.getChannelData(0);
    const basePitch = (voice.basePitchHz || 190) * Math.pow(2, (options.pitch || 0) / 100);
    const volGain = Math.min(1.0, (options.volume / 100) * 0.48);

    let cursor = Math.floor(0.04 * sampleRate);
    for (let w = 0; w < totalSyl; w++) {
      const word = words[w] || 'a';
      let toneStart = 1.0;
      let toneEnd = 1.0;
      if (/[áắấéếíóốớúứý]/i.test(word)) { toneStart = 0.98; toneEnd = 1.22; }
      else if (/[àằầèềìòồờùừỳ]/i.test(word)) { toneStart = 1.02; toneEnd = 0.84; }
      else if (/[ảẳẩẻểỉỏổởủửỷ]/i.test(word)) { toneStart = 0.95; toneEnd = 1.09; }
      else if (/[ãẵẫẽễĩõỗỡũữỹ]/i.test(word)) { toneStart = 1.0; toneEnd = 1.18; }
      else if (/[ạặậẹệịọộợụựỵ]/i.test(word)) { toneStart = 0.92; toneEnd = 0.78; }

      const sylSamples = Math.floor(sylDuration * sampleRate * (0.85 + (word.length % 4) * 0.09));
      const f1 = 480 + ((word.charCodeAt(0) * 37) % 340);
      const f2 = 1350 + ((word.charCodeAt(word.length - 1) * 53) % 750);

      let p0 = 0, p1 = 0, p2 = 0;
      for (let i = 0; i < sylSamples && (cursor + i) < totalSamples; i++) {
        const t = i / sylSamples;
        const env = Math.sin(Math.PI * t) * Math.min(1, t * 8) * Math.min(1, (1 - t) * 6);
        const f0 = basePitch * (toneStart + (toneEnd - toneStart) * t) * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * (i / sampleRate)));

        p0 += (2 * Math.PI * f0) / sampleRate;
        p1 += (2 * Math.PI * f1) / sampleRate;
        p2 += (2 * Math.PI * f2) / sampleRate;

        const glottal =
          0.52 * Math.sin(p0) +
          0.25 * Math.sin(2 * p0 + 0.3) +
          0.13 * Math.sin(3 * p0 + 0.7) +
          0.06 * Math.sin(p1) +
          0.04 * Math.sin(p2);

        data[cursor + i] = glottal * env * volGain;
      }
      cursor += sylSamples + Math.floor(pauseDuration * sampleRate);
      if (/[,.;!?]/.test(word)) {
        cursor += Math.floor((0.12 * sampleRate) / speedFactor);
      }
    }
    return buffer;
  }
}
