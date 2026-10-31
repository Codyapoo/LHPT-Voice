import React from 'react';

export const HomePage: React.FC<{ onStartStudio: () => void }> = ({ onStartStudio }) => (
  <section className="rounded-3xl p-8 bg-[#121A3A]/90 border border-cyan-400/25 text-center lg:text-left">
    <h1 className="text-4xl sm:text-5xl font-extrabold text-white">
      Biến mọi văn bản <span className="text-cyan-400 block mt-1">thành giọng nói</span>
    </h1>
    <p className="text-slate-300 mt-4 max-w-xl">
      LHPT Voice - Giọng đọc AI tự nhiên, miễn phí, dễ sử dụng. Sáng tạo nội dung, học tập, làm việc hiệu quả hơn!
    </p>
    <button
      type="button"
      onClick={onStartStudio}
      className="mt-6 px-7 py-3 rounded-full font-bold bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 text-white"
    >
      Bắt đầu ngay
    </button>
  </section>
);
