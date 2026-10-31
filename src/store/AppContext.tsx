import React, { createContext, useContext, useState } from 'react';
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  language: 'vi',
  defaultVoiceId: 'vi-north-female',
  defaultSpeed: 1.0,
  sampleRate: 44100,
  mp3Bitrate: 192,
  channels: 1,
  storageLocation: 'indexeddb',
  localNeuralEndpoint: ''
};

interface AppContextValue {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
}

const AppContext = createContext<AppContextValue>({
  settings: DEFAULT_SETTINGS,
  updateSettings: () => {}
});

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('lhpt_voice_settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem('lhpt_voice_settings', JSON.stringify(next));
      } catch {
        // Ignore storage error
      }
      return next;
    });
  };

  return (
    <AppContext.Provider value={{ settings, updateSettings }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => useContext(AppContext);
