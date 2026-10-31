import React from 'react';
import { AppProvider } from './store/AppContext';
import { Navbar } from './components/layout/Navbar';
import { HomePage } from './pages/Home/HomePage';
import { StudioPage } from './pages/Studio/StudioPage';
import { LibraryPage } from './pages/Library/LibraryPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { AboutPage } from './pages/About/AboutPage';

export default function App() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <AppProvider>
      <div className="min-h-screen bg-[#080B20] text-[#E8F0FF]">
        <Navbar onNavigate={scrollTo} />
        <main className="max-w-7xl mx-auto p-4 space-y-6">
          <HomePage onStartStudio={() => scrollTo('studio-workspace')} />
          <StudioPage />
          <LibraryPage />
          <SettingsPage />
          <AboutPage />
        </main>
      </div>
    </AppProvider>
  );
}
