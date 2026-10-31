export type VoiceRegion = 'north' | 'south' | 'intl';
export type EngineType = 'acoustic-dsp' | 'browser-speech' | 'piper-neural';

export interface VoiceProfile {
  id: string;
  name: string;
  tag: string;
  desc: string;
  region: VoiceRegion;
  lang: string;
  gender: 'male' | 'female';
  basePitchHz: number;
  pitchRate: number;
  speedMod: number;
  engineType: EngineType;
  supportsExport: boolean;
  avatarGradient: string;
  sampleText: string;
}

export interface TTSOptions {
  speed: number;
  volume: number;
  pitch: number;
  autoSplit: boolean;
  readNumbers: boolean;
  readAbbreviations: boolean;
  sampleRate: 22050 | 44100 | 48000;
  mp3Bitrate: 128 | 192 | 320;
  channels: 1 | 2;
}

export interface TextChunkStatus {
  index: number;
  text: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  errorMsg?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  text: string;
  voiceId: string;
  date: string;
  durationSec: number;
  durationFormatted: string;
  category: 'text' | 'audio';
  iconType: 'doc-blue' | 'doc-amber' | 'audio-cyan' | 'video-pink' | 'note-green';
  hasGeneratedAudio?: boolean;
}

export interface AppSettings {
  theme: 'dark' | 'light';
  language: 'vi' | 'en';
  defaultVoiceId: string;
  defaultSpeed: number;
  sampleRate: 22050 | 44100 | 48000;
  mp3Bitrate: 128 | 192 | 320;
  channels: 1 | 2;
  storageLocation: 'indexeddb';
  localNeuralEndpoint: string;
}
