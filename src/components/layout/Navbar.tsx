import React from 'react';

export const Navbar: React.FC<{ onNavigate: (sectionId: string) => void }> = ({ onNavigate }) => {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 backdrop-blur-md">
      <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onNavigate('section-hero')}>
        <img src="public/logo/logo-horizontal.svg" alt="LHPT Voice" className="h-8" />
      </div>
      <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-200">
        <button type="button" onClick={() => onNavigate('section-hero')} className="hover:text-cyan-300">Trang chủ</button>
        <button type="button" onClick={() => onNavigate('section-studio')} className="hover:text-cyan-300">Studio</button>
        <button type="button" onClick={() => onNavigate('section-library')} className="hover:text-cyan-300">Thư viện</button>
        <button type="button" onClick={() => onNavigate('section-settings')} className="hover:text-cyan-300">Cài đặt</button>
        <button type="button" onClick={() => onNavigate('section-about')} className="hover:text-cyan-300">Giới thiệu</button>
      </nav>
    </header>
  );
};
