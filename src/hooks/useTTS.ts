import { useState, useRef } from 'react';
import { VoiceProfile, TTSOptions, TextChunkStatus } from '../types';
import { normalizeVietnameseText, splitTextIntoSafeChunks } from '../utils/vietnameseNormalizer';
import { AcousticFormantSynthAdapter } from '../services/tts/TTSAdapter';
import { mergeAudioBuffers } from '../services/audio/AudioMerger';

export function useTTS() {
  const [chunks, setChunks] = useState<TextChunkStatus[]>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const cancelRef = useRef(false);
  const adapter = useRef(new AcousticFormantSynthAdapter());

  const synthesizeLongText = async (
    ctx: BaseAudioContext,
    rawText: string,
    voice: VoiceProfile,
    options: TTSOptions
  ): Promise<AudioBuffer | null> => {
    cancelRef.current = false;
    setIsSynthesizing(true);

    const normalized = normalizeVietnameseText(rawText, options.readNumbers, options.readAbbreviations);
    const segments = options.autoSplit ? splitTextIntoSafeChunks(normalized, 220) : [normalized];
    const initialChunks: TextChunkStatus[] = segments.map((t, i) => ({
      index: i,
      text: t,
      status: 'pending'
    }));
    setChunks(initialChunks);

    const buffers: AudioBuffer[] = [];
    for (let i = 0; i < segments.length; i++) {
      if (cancelRef.current) {
        setIsSynthesizing(false);
        return null;
      }
      setChunks((prev) => prev.map((c, idx) => (idx === i ? { ...c, status: 'processing' } : c)));
      const buf = await adapter.current.synthesizeChunk(ctx, segments[i], voice, options);
      buffers.push(buf);
      setChunks((prev) => prev.map((c, idx) => (idx === i ? { ...c, status: 'done' } : c)));
    }

    setIsSynthesizing(false);
    return mergeAudioBuffers(ctx, buffers);
  };

  const cancelSynthesis = () => {
    cancelRef.current = true;
    setIsSynthesizing(false);
  };

  return { chunks, isSynthesizing, synthesizeLongText, cancelSynthesis };
}
