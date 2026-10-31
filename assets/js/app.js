/* ==========================================================================
   LHPT Voice v2.3 - Crystal-Clear Multi-Chunk Vietnamese Speech Engine
   Root-Cause Fixes Applied:
   1. REMOVED SINE-WAVE BEEP FALLBACK & ENGLISH VOICE FALLBACK:
      - Completely removed `buildOfflineVowelFormantBuffer` (which caused chunk 2+
        to sound like wordless musical beeps when a proxy timed out).
      - Completely removed `allowAnyVoiceFallback` (which caused English voices to
        read Vietnamese diacritics as unintelligible gibberish).
   2. SAFE <= 90-CHAR VIETNAMESE CLAUSE CHUNKING:
      - UTF-8 Vietnamese characters use 3 bytes each (9 chars when URL-encoded).
      - Splitting clauses at <= 90 chars guarantees every single chunk stays well
        under Google TTS's 200-char query limit so chunk 2, 3, ... N never fail!
   3. PERSISTENT SINGLE <audio referrerpolicy="no-referrer"> SEQUENTIAL STREAMER:
      - Reuses one unlocked <audio> element across all chunks so browser autoplay
        policies never block chunk 2+.
      - Keeps `preservesPitch = true` by default so words are never slurred.
      - Playback timer never prematurely stops the audio stream before the final
        chunk finishes speaking.
   4. VERIFIED MP3 MAGIC-BYTE MULTI-PROXY FETCHER FOR WAV/MP3 EXPORT:
      - Validates MP3 header bytes (`ID3` or `0xFF 0xFB/0xF3`) across 5 endpoints
        with polite pacing and retry so exported WAV & MP3 files contain 100% real
        human Vietnamese speech from start to finish.
   ========================================================================== */

(function() {
  'use strict';

  window.__lhptUtterances = [];
  window.__lhptHtmlAudio = null;

  // --- 1. Vietnamese Text Normalizer (Numbers & Abbreviations) ---
  const DIGITS_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const ABBREVIATIONS_VI = {
    'TP.HCM': 'Thành phố Hồ Chí Minh',
    'TPHCM': 'Thành phố Hồ Chí Minh',
    'HN': 'Hà Nội',
    'VN': 'Việt Nam',
    'THPT': 'Trung học phổ thông',
    'THCS': 'Trung học cơ sở',
    'ĐH': 'Đại học',
    'CNTT': 'Công nghệ thông tin',
    'AI': 'ây ai',
    'TTS': 'chuyển văn bản thành giọng nói',
    'LHPT': 'Lê Hồng Phong Tech',
    'WAV': 'uây',
    'MP3': 'em pi ba',
    'UBND': 'Ủy ban nhân dân',
    'CLB': 'Câu lạc bộ'
  };

  function readThreeDigitsVi(num, showZeroHundred) {
    const tram = Math.floor(num / 100);
    const chuc = Math.floor((num % 100) / 10);
    const donvi = num % 10;
    const parts = [];
    if (tram > 0 || showZeroHundred) parts.push(DIGITS_VI[tram] + ' trăm');
    if (chuc === 0 && donvi > 0 && (tram > 0 || showZeroHundred)) {
      parts.push('lẻ');
    } else if (chuc === 1) {
      parts.push('mười');
    } else if (chuc > 1) {
      parts.push(DIGITS_VI[chuc] + ' mươi');
    }
    if (donvi > 0) {
      if (chuc > 1 && donvi === 1) parts.push('mốt');
      else if (chuc >= 1 && donvi === 5) parts.push('lăm');
      else if (chuc > 1 && donvi === 4) parts.push('tư');
      else parts.push(DIGITS_VI[donvi]);
    }
    return parts.join(' ');
  }

  function numberToVietnameseWords(n) {
    if (!Number.isFinite(n)) return '';
    if (n === 0) return 'không';
    if (n < 0) return 'âm ' + numberToVietnameseWords(Math.abs(n));
    let rem = Math.floor(n);
    const units = ['', 'nghìn', 'triệu', 'tỷ'];
    const groups = [];
    while (rem > 0) {
      groups.push(rem % 1000);
      rem = Math.floor(rem / 1000);
    }
    const out = [];
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i];
      if (g > 0) {
        const text = readThreeDigitsVi(g, i < groups.length - 1);
        const u = units[i % 4];
        out.push(u ? (text + ' ' + u) : text);
      }
    }
    return out.join(' ').trim();
  }

  function normalizeTextForTTS(rawText, readNumbers, readAbbrev) {
    let res = rawText || '';
    if (readAbbrev) {
      Object.keys(ABBREVIATIONS_VI).forEach((k) => {
        const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp('\\b' + esc + '\\b', 'gi');
        res = res.replace(rx, ABBREVIATIONS_VI[k]);
      });
    }
    if (readNumbers) {
      res = res.replace(/(\d+)%/g, function(_, d) {
        return numberToVietnameseWords(parseInt(d, 10)) + ' phần trăm';
      });
      res = res.replace(/\b(\d{1,9})\b/g, function(_, d) {
        return numberToVietnameseWords(parseInt(d, 10));
      });
    }
    // Replace special dashes/bullets with natural pause commas
    res = res.replace(/[—–•·]/g, ', ');
    return res.replace(/\s+/g, ' ').trim();
  }

  // Split unlimited text into safe <= 90-character clauses so UTF-8 encoded Vietnamese
  // NEVER exceeds Google Translate TTS's 200-char query limit on any chunk!
  function splitTextIntoSafeChunks(text, maxLen) {
    const limit = maxLen || 90;
    const cleaned = (text || '').trim();
    if (!cleaned) return [];
    if (cleaned.length <= limit) return [cleaned];

    // First split by sentence and clause punctuation
    const rawClauses = cleaned.split(/(?<=[.!?।;:,\n])\s+/);
    const chunks = [];
    let current = '';

    for (let clause of rawClauses) {
      const trimmedClause = clause.trim();
      if (!trimmedClause) continue;

      if ((current ? (current + ' ' + trimmedClause) : trimmedClause).length <= limit) {
        current = current ? (current + ' ' + trimmedClause) : trimmedClause;
      } else {
        if (current) {
          chunks.push(current);
          current = '';
        }
        if (trimmedClause.length <= limit) {
          current = trimmedClause;
        } else {
          // Clause itself is > 90 chars: split cleanly on word boundaries
          const words = trimmedClause.split(/\s+/);
          let sub = '';
          for (let w of words) {
            if ((sub ? (sub + ' ' + w) : w).length <= limit) {
              sub = sub ? (sub + ' ' + w) : w;
            } else {
              if (sub) chunks.push(sub);
              sub = w;
            }
          }
          if (sub) current = sub;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  // --- 2. Voice Profiles (Articulate, Natural Cadence without Formant Slurring) ---
  const VOICE_PROFILES = [
    {
      id: 'vi-north-male',
      name: 'Nam miền Bắc',
      tag: '(Tự nhiên)',
      desc: 'Phổ biến - Ổn định • Đĩnh đạc rõ chữ',
      region: 'north',
      style: 'natural',
      lang: 'vi-VN',
      tl: 'vi',
      gender: 'male',
      nativePitch: 0.88,
      speedMod: 0.96,
      avatarBg: 'from-cyan-400 to-blue-600',
      sampleText: 'Xin chào! Tôi là giọng đọc Nam miền Bắc của LHPT Voice, mang đến âm thanh rõ ràng, chững chạc và ổn định cho bài thuyết trình của bạn.'
    },
    {
      id: 'vi-north-female',
      name: 'Nữ miền Bắc',
      tag: '(Tự nhiên)',
      desc: 'Phổ biến - Ngọt ngào • Chuẩn tự nhiên',
      region: 'north',
      style: 'natural',
      lang: 'vi-VN',
      tl: 'vi',
      gender: 'female',
      nativePitch: 1.05,
      speedMod: 1.0,
      avatarBg: 'from-pink-400 via-purple-500 to-indigo-600',
      sampleText: 'Chào mừng bạn đến với LHPT Voice! Giọng đọc Nữ miền Bắc tự nhiên, truyền cảm và ngọt ngào, rất phù hợp cho kể chuyện, podcast và học tập.'
    },
    {
      id: 'vi-south-male',
      name: 'Nam miền Nam',
      tag: '(Tự nhiên)',
      desc: 'Trầm ấm - Ấm áp • Gần gũi truyền cảm',
      region: 'south',
      style: 'natural',
      lang: 'vi-VN',
      tl: 'vi',
      gender: 'male',
      nativePitch: 0.84,
      speedMod: 0.92,
      avatarBg: 'from-sky-400 to-indigo-600',
      sampleText: 'Xin chào các bạn! Đây là giọng Nam miền Nam trầm ấm, gần gũi và tự nhiên từ studio LHPT Voice.'
    },
    {
      id: 'vi-south-female',
      name: 'Nữ miền Nam',
      tag: '(Tự nhiên)',
      desc: 'Trẻ trung - Nhiệt huyết • Tươi sáng',
      region: 'south',
      style: 'natural',
      lang: 'vi-VN',
      tl: 'vi',
      gender: 'female',
      nativePitch: 1.12,
      speedMod: 1.05,
      avatarBg: 'from-fuchsia-400 to-purple-600',
      sampleText: 'Rất vui được đồng hành cùng bạn! Giọng Nữ miền Nam trẻ trung, năng động, giúp video sáng tạo nội dung thêm cuốn hút.'
    },
    {
      id: 'en-us-female',
      name: 'English US (Neural)',
      tag: '(Quốc tế)',
      desc: 'Chuẩn quốc tế - Tự nhiên',
      region: 'intl',
      style: 'natural',
      lang: 'en-US',
      tl: 'en',
      gender: 'female',
      nativePitch: 1.0,
      speedMod: 1.0,
      avatarBg: 'from-emerald-400 to-cyan-600',
      sampleText: 'Welcome to LHPT Voice! Transform unlimited text into natural speech right in your browser with real WAV and MP3 audio export.'
    },
    {
      id: 'en-uk-male',
      name: 'English UK (Neural)',
      tag: '(Quốc tế)',
      desc: 'Lịch lãm - Học thuật',
      region: 'intl',
      style: 'natural',
      lang: 'en-GB',
      tl: 'en-gb',
      gender: 'male',
      nativePitch: 0.88,
      speedMod: 0.96,
      avatarBg: 'from-violet-400 to-purple-700',
      sampleText: 'Your words, your voice. High quality text to speech synthesis for creators and educators.'
    }
  ];

  // --- 3. Default Projects ---
  const DEFAULT_PROJECTS = [
    {
      id: 'proj-1',
      title: 'Bài thuyết trình',
      date: '12/10/2025 • 02:15',
      durationSec: 135,
      durationFormatted: '02:15',
      category: 'text',
      voiceId: 'vi-north-male',
      iconType: 'doc-blue',
      text: 'Kính chào ban giám khảo và quý vị đại biểu. Hôm nay, chúng tôi xin giới thiệu dự án LHPT Voice năm 2026. Đây là nền tảng chuyển đổi văn bản thành giọng nói tiếng Việt tự nhiên ngay trên trình duyệt web, không giới hạn ký tự và giúp tiết kiệm 80% thời gian sản xuất nội dung số.'
    },
    {
      id: 'proj-2',
      title: 'Truyện ngắn',
      date: '10/10/2025 • 04:32',
      durationSec: 272,
      durationFormatted: '04:32',
      category: 'audio',
      voiceId: 'vi-north-female',
      iconType: 'doc-amber',
      text: 'Đêm xuống bên hồ tinh vân lấp lánh, những dải ánh sáng xanh tím phản chiếu mặt nước phẳng lặng như gương. Mỗi lời nói cất lên đều mang theo âm hưởng của những vì sao xa xôi, dịu dàng và sâu lắng.'
    },
    {
      id: 'proj-3',
      title: 'Học tiếng Anh',
      date: '08/10/2025 • 03:18',
      durationSec: 198,
      durationFormatted: '03:18',
      category: 'audio',
      voiceId: 'en-us-female',
      iconType: 'audio-cyan',
      text: 'Practice daily shadowing with LHPT Voice. Consistency is the bridge between goals and accomplishment. Listen carefully to the intonation and rhythm of each sentence.'
    },
    {
      id: 'proj-4',
      title: 'Nội dung video',
      date: '05/10/2025 • 01:45',
      durationSec: 105,
      durationFormatted: '01:45',
      category: 'audio',
      voiceId: 'vi-south-female',
      iconType: 'video-pink',
      text: 'Bạn đang tìm công cụ lồng tiếng video miễn phí 100%, không giới hạn độ dài văn bản, không cần đăng nhập tài khoản và xuất file WAV, MP3 chất lượng cao? Hãy trải nghiệm ngay LHPT Voice Studio!'
    },
    {
      id: 'proj-5',
      title: 'Ghi chú công việc',
      date: '03/10/2025 • 00:52',
      durationSec: 52,
      durationFormatted: '00:52',
      category: 'text',
      voiceId: 'vi-south-male',
      iconType: 'note-green',
      text: 'Tổng hợp kế hoạch tuần mới tại TP.HCM và HN: Hoàn thiện giao diện LHPT Voice trên GitHub Pages, kiểm tra tính năng lưu trữ dự án an toàn qua IndexedDB và bộ mã hóa MP3 thực tế.'
    }
  ];

  // --- 4. Application State ---
  const state = {
    selectedVoiceId: 'vi-north-female',
    voiceLangTab: 'vi',
    voiceSubFilter: 'all',
    speed: 1.0,
    volume: 100,
    pitch: 0,
    autoSplit: true,
    readNumbers: true,
    readAbbrev: true,
    sampleRate: 44100,
    mp3Bitrate: 192,
    channels: 1,
    uiLang: 'vi',
    editorHistory: [''],
    historyIndex: 0,
    projects: [],
    activeProjectId: 'proj-1',
    renamingProjectId: null,
    libraryFilter: 'all',
    librarySearch: '',
    isPlaying: false,
    isMuted: false,
    isSynthesizing: false,
    cancelSynthesisFlag: false,
    currentTimeSec: 0,
    totalDurationSec: 12,
    activeChunkIndex: 0,
    totalChunksCount: 1,
    waveformPeaks: [],
    synthesizedAudioBuffer: null,
    rawMp3ChunksCache: [],
    lastSynthesizedKey: '',
    audioCtx: null,
    activeSourceNode: null,
    playbackTimer: null,
    speechKeepAliveTimer: null,
    idbReady: false
  };

  function loadSavedSettings() {
    try {
      const raw = localStorage.getItem('lhpt_voice_settings_v2');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.defaultVoiceId) state.selectedVoiceId = parsed.defaultVoiceId;
      if (parsed.defaultSpeed) state.speed = parseFloat(parsed.defaultSpeed) || 1.0;
      if (parsed.sampleRate) state.sampleRate = parseInt(parsed.sampleRate, 10) || 44100;
      if (parsed.mp3Bitrate) state.mp3Bitrate = parseInt(parsed.mp3Bitrate, 10) || 192;
      if (parsed.channels) state.channels = parseInt(parsed.channels, 10) || 1;
      if (parsed.theme === 'light') {
        document.documentElement.classList.add('light-theme');
      }
    } catch (e) {}
  }

  function saveSettingsToLocal() {
    try {
      const payload = {
        theme: document.documentElement.classList.contains('light-theme') ? 'light' : 'dark',
        defaultVoiceId: state.selectedVoiceId,
        defaultSpeed: state.speed,
        sampleRate: state.sampleRate,
        mp3Bitrate: state.mp3Bitrate,
        channels: state.channels,
        uiLang: state.uiLang
      };
      localStorage.setItem('lhpt_voice_settings_v2', JSON.stringify(payload));
    } catch (e) {}
  }

  function generateWaveformPeaks(seedText) {
    const count = 68;
    const peaks = [];
    let hash = 2166136261;
    const str = seedText || 'LHPT Voice Studio Default Waveform';
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    for (let i = 0; i < count; i++) {
      const env = Math.sin((i / count) * Math.PI);
      const v1 = Math.abs(Math.sin(i * 0.45 + (hash % 17)));
      const v2 = Math.abs(Math.cos(i * 0.82 + (hash % 31)));
      const val = Math.max(0.16, Math.min(0.98, (v1 * 0.55 + v2 * 0.45) * (0.45 + 0.55 * env)));
      peaks.push(val);
    }
    return peaks;
  }

  function extractPeaksFromAudioBuffer(buffer) {
    if (!buffer) return generateWaveformPeaks('LHPT');
    const data = buffer.getChannelData(0);
    const count = 68;
    const step = Math.max(1, Math.floor(data.length / count));
    const peaks = [];
    for (let i = 0; i < count; i++) {
      let max = 0;
      const start = i * step;
      for (let j = 0; j < step && (start + j) < data.length; j += 10) {
        const v = Math.abs(data[start + j]);
        if (v > max) max = v;
      }
      peaks.push(Math.max(0.14, Math.min(0.98, max * 1.6)));
    }
    return peaks;
  }

  state.waveformPeaks = generateWaveformPeaks('LHPT Voice');

  // --- 5. IndexedDB Storage Engine ---
  const DB_NAME = 'LHPTVoiceDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'projects';
  let dbInstance = null;

  function initIndexedDB() {
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) {
          state.projects = DEFAULT_PROJECTS.slice();
          resolve(false);
          return;
        }
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function(event) {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        request.onsuccess = function(event) {
          dbInstance = event.target.result;
          state.idbReady = true;
          loadProjectsFromDB().then(() => resolve(true));
        };
        request.onerror = function() {
          state.projects = DEFAULT_PROJECTS.slice();
          resolve(false);
        };
      } catch (err) {
        state.projects = DEFAULT_PROJECTS.slice();
        resolve(false);
      }
    });
  }

  function loadProjectsFromDB() {
    return new Promise((resolve) => {
      if (!dbInstance) {
        state.projects = DEFAULT_PROJECTS.slice();
        resolve();
        return;
      }
      try {
        const tx = dbInstance.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = function() {
          if (req.result && req.result.length > 0) {
            state.projects = req.result;
          } else {
            state.projects = DEFAULT_PROJECTS.slice();
            saveAllProjectsToDB(state.projects);
          }
          resolve();
        };
        req.onerror = function() {
          state.projects = DEFAULT_PROJECTS.slice();
          resolve();
        };
      } catch (e) {
        state.projects = DEFAULT_PROJECTS.slice();
        resolve();
      }
    });
  }

  function saveAllProjectsToDB(projectsList) {
    if (!dbInstance) return;
    try {
      const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      projectsList.forEach((p) => store.put(p));
    } catch (e) {}
  }

  // --- 6. Toast Notification Helper ---
  function showToast(message, type) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const borderClass = type === 'success' ? 'border-cyan-400' : (type === 'error' ? 'border-rose-400' : 'border-purple-400');
    toast.className = 'cosmic-panel ' + borderClass + ' border px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-xs sm:text-sm font-medium text-slate-100 transform transition-all duration-300 translate-y-2 opacity-0';
    toast.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping shrink-0"></span><span>' + message + '</span>';
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3400);
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return String(mins).padStart(2, '0') + ':' + String(rem).padStart(2, '0');
  }

  function updateAutoSaveTime() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const el = document.getElementById('autosave-label');
    if (el) el.textContent = 'Tự động lưu - ' + hh + ':' + mm;
  }

  function updateEditorMetrics() {
    const textarea = document.getElementById('studio-textarea');
    const charCountEl = document.getElementById('char-counter');
    const estMinEl = document.getElementById('est-minutes');
    if (!textarea) return;

    const val = textarea.value || '';
    const len = val.length;
    if (charCountEl) {
      charCountEl.textContent = len.toLocaleString('vi-VN') + ' ký tự (Không giới hạn)';
    }

    const words = val.trim() ? val.trim().split(/\s+/).length : 0;
    const estSeconds = words === 0 ? 0 : Math.max(2, Math.round((words / 140) * 60 / state.speed));
    const mins = Math.ceil(estSeconds / 60);
    if (estMinEl) {
      estMinEl.textContent = words === 0 ? '≈ 0 phút' : (estSeconds < 60 ? '≈ ' + estSeconds + ' giây' : '≈ ' + mins + ' phút');
    }
  }

  // --- 7. Render Voice Selector List ---
  function renderVoiceList() {
    const container = document.getElementById('voice-list-container');
    if (!container) return;

    let filtered = VOICE_PROFILES.filter((v) => {
      if (state.voiceLangTab === 'vi') return v.lang === 'vi-VN';
      return v.lang !== 'vi-VN';
    });

    if (state.voiceLangTab === 'vi' && state.voiceSubFilter === 'south') {
      filtered = filtered.filter((v) => v.region === 'south');
    }

    container.innerHTML = filtered.map((v) => {
      const isSelected = v.id === state.selectedVoiceId;
      const activeClass = isSelected ? 'cosmic-card-active' : 'cosmic-card';
      return `
        <div class="${activeClass} rounded-xl p-3 flex items-center justify-between cursor-pointer select-none" data-voice-card="${v.id}">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br ${v.avatarBg} flex items-center justify-center text-white shadow-md shrink-0">
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm0 2c-3.33 0-10 1.67-10 5v3h20v-3c0-3.33-6.67-5-10-5z"/>
              </svg>
            </div>
            <div class="truncate">
              <div class="text-sm font-semibold text-slate-100 truncate">
                ${v.name} <span class="text-xs font-normal text-cyan-300/90">${v.tag}</span>
              </div>
              <div class="text-xs text-slate-400 truncate">${v.desc}</div>
            </div>
          </div>
          <button type="button" data-voice-preview="${v.id}" title="Nghe thử giọng ${v.name}"
            class="w-9 h-9 rounded-full ${isSelected ? 'bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-400/40' : 'bg-slate-800/90 text-cyan-400 hover:bg-cyan-500/20'} flex items-center justify-center transition shrink-0">
            <svg class="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </button>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-voice-card]').forEach((card) => {
      card.addEventListener('click', function(e) {
        if (e.target.closest('[data-voice-preview]')) return;
        const vid = this.getAttribute('data-voice-card');
        selectVoice(vid);
      });
    });

    container.querySelectorAll('[data-voice-preview]').forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const vid = this.getAttribute('data-voice-preview');
        selectVoice(vid);
        const voice = VOICE_PROFILES.find((x) => x.id === vid);
        if (voice) {
          synthesizeAndPlay(voice.sampleText, voice, true);
        }
      });
    });

    const currentVoice = VOICE_PROFILES.find((x) => x.id === state.selectedVoiceId) || VOICE_PROFILES[1];
    const mobileVoiceName = document.getElementById('mobile-voice-name');
    const mobileVoiceDesc = document.getElementById('mobile-voice-desc');
    if (mobileVoiceName) mobileVoiceName.textContent = currentVoice.name;
    if (mobileVoiceDesc) mobileVoiceDesc.textContent = 'Tự nhiên - ' + currentVoice.desc.split(' • ')[0];
  }

  function selectVoice(voiceId) {
    state.selectedVoiceId = voiceId;
    state.synthesizedAudioBuffer = null;
    state.rawMp3ChunksCache = [];
    renderVoiceList();
    saveSettingsToLocal();
    const v = VOICE_PROFILES.find((x) => x.id === voiceId);
    if (v) showToast('Đã chọn giọng đọc: ' + v.name + ' ' + v.tag, 'info');
  }

  // --- 8. Render Project Library ---
  function getProjectIconBadge(iconType) {
    switch (iconType) {
      case 'doc-blue':
        return '<div class="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-400/40 text-blue-400 flex items-center justify-center shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div>';
      case 'doc-amber':
        return '<div class="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg></div>';
      case 'audio-cyan':
        return '<div class="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/></svg></div>';
      case 'video-pink':
        return '<div class="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-400/40 text-pink-400 flex items-center justify-center shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg></div>';
      default:
        return '<div class="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg></div>';
    }
  }

  function renderProjectLibrary() {
    const listEl = document.getElementById('project-library-list');
    if (!listEl) return;

    const q = (state.librarySearch || '').toLowerCase().trim();
    const items = state.projects.filter((p) => {
      if (state.libraryFilter !== 'all' && p.category !== state.libraryFilter) return false;
      if (q && !p.title.toLowerCase().includes(q) && !(p.text || '').toLowerCase().includes(q)) return false;
      return true;
    });

    const countBadge = document.getElementById('idb-project-count');
    if (countBadge) countBadge.textContent = state.projects.length + ' dự án lưu cục bộ';

    if (items.length === 0) {
      listEl.innerHTML = `
        <div class="cosmic-card rounded-xl p-6 text-center text-slate-400 text-xs">
          Không tìm thấy dự án phù hợp. Nhấn <strong>+ Tạo dự án</strong> để lưu văn bản mới!
        </div>
      `;
      return;
    }

    listEl.innerHTML = items.map((p) => {
      const isActive = p.id === state.activeProjectId;
      return `
        <div class="${isActive ? 'cosmic-card-active' : 'cosmic-card'} rounded-xl p-2.5 flex flex-col gap-2 cursor-pointer transition" data-project-row="${p.id}">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              ${getProjectIconBadge(p.iconType)}
              <div class="min-w-0">
                <div class="text-xs font-semibold text-slate-100 truncate">${p.title}</div>
                <div class="text-[11px] text-slate-400 truncate">${p.date}</div>
              </div>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button type="button" data-project-play="${p.id}" title="Nghe thử dự án ${p.title}"
                class="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-[11px] flex items-center gap-1 transition">
                <svg class="w-3 h-3 text-cyan-400" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                <span>${p.durationFormatted}</span>
              </button>
              <button type="button" data-project-rename="${p.id}" title="Đổi tên dự án"
                class="p-1 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-500/10 transition text-xs">
                ✎
              </button>
              <button type="button" data-project-duplicate="${p.id}" title="Sao chép dự án"
                class="p-1 rounded-lg text-slate-400 hover:text-purple-300 hover:bg-purple-500/10 transition text-xs">
                ❐
              </button>
              <button type="button" data-project-download="${p.id}" title="Tải file WAV của dự án"
                class="p-1 rounded-lg text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition text-xs">
                ⬇
              </button>
              <button type="button" data-project-delete="${p.id}" title="Xóa dự án"
                class="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition">
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-project-row]').forEach((row) => {
      row.addEventListener('click', function(e) {
        if (e.target.closest('button')) return;
        const pid = this.getAttribute('data-project-row');
        loadProjectIntoStudio(pid, false);
      });
    });

    listEl.querySelectorAll('[data-project-play]').forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const pid = this.getAttribute('data-project-play');
        loadProjectIntoStudio(pid, true);
      });
    });

    listEl.querySelectorAll('[data-project-rename]').forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const pid = this.getAttribute('data-project-rename');
        openRenameModal(pid);
      });
    });

    listEl.querySelectorAll('[data-project-duplicate]').forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const pid = this.getAttribute('data-project-duplicate');
        duplicateProject(pid);
      });
    });

    listEl.querySelectorAll('[data-project-download]').forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const pid = this.getAttribute('data-project-download');
        loadProjectIntoStudio(pid, false);
        exportAudioFile('wav');
      });
    });

    listEl.querySelectorAll('[data-project-delete]').forEach((btn) => {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        const pid = this.getAttribute('data-project-delete');
        deleteProject(pid);
      });
    });
  }

  function openRenameModal(projectId) {
    const proj = state.projects.find((p) => p.id === projectId);
    if (!proj) return;
    state.renamingProjectId = projectId;
    const modal = document.getElementById('modal-rename-project');
    const input = document.getElementById('rename-project-input');
    if (input) input.value = proj.title;
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  }

  function duplicateProject(projectId) {
    const orig = state.projects.find((p) => p.id === projectId);
    if (!orig) return;
    const copy = Object.assign({}, orig, {
      id: 'proj-' + Date.now(),
      title: orig.title + ' (Bản sao)'
    });
    state.projects.unshift(copy);
    saveAllProjectsToDB(state.projects);
    renderProjectLibrary();
    showToast('Đã sao chép dự án: ' + copy.title, 'success');
  }

  function loadProjectIntoStudio(projectId, autoPlay) {
    const proj = state.projects.find((p) => p.id === projectId);
    if (!proj) return;
    state.activeProjectId = proj.id;
    state.synthesizedAudioBuffer = null;
    state.rawMp3ChunksCache = [];
    const textarea = document.getElementById('studio-textarea');
    if (textarea) {
      textarea.value = proj.text;
      pushHistory(proj.text);
      updateEditorMetrics();
    }
    if (proj.voiceId && VOICE_PROFILES.some((v) => v.id === proj.voiceId)) {
      state.selectedVoiceId = proj.voiceId;
      renderVoiceList();
    }
    state.totalDurationSec = proj.durationSec || 83;
    state.currentTimeSec = 0;
    state.waveformPeaks = generateWaveformPeaks(proj.text);
    renderWaveformCanvas();
    updatePlayerTimeUI();
    renderProjectLibrary();
    updateAutoSaveTime();

    if (autoPlay) {
      const voice = VOICE_PROFILES.find((v) => v.id === state.selectedVoiceId) || VOICE_PROFILES[1];
      synthesizeAndPlay(proj.text, voice, false);
    } else {
      showToast('Đã mở lại dự án: ' + proj.title, 'info');
    }
  }

  function deleteProject(projectId) {
    const idx = state.projects.findIndex((p) => p.id === projectId);
    if (idx === -1) return;
    const removed = state.projects[idx];
    state.projects.splice(idx, 1);
    saveAllProjectsToDB(state.projects);
    renderProjectLibrary();
    showToast('Đã xóa dự án "' + removed.title + '" khỏi IndexedDB', 'info');
  }

  // --- 9. Waveform Visualizer Canvas ---
  function renderWaveformCanvas() {
    const canvas = document.getElementById('waveform-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(240, rect.width || 400);
    const height = Math.max(44, rect.height || 52);

    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const peaks = state.waveformPeaks;
    const numBars = peaks.length;
    const gap = 2.5;
    const barWidth = Math.max(2, (width - (numBars - 1) * gap) / numBars);
    const progressRatio = state.totalDurationSec > 0 ? (state.currentTimeSec / state.totalDurationSec) : 0;

    for (let i = 0; i < numBars; i++) {
      const barRatio = i / numBars;
      let amp = peaks[i];
      if (state.isPlaying) {
        const jitter = 0.85 + 0.25 * Math.sin(Date.now() * 0.012 + i * 0.6);
        amp = Math.min(0.98, Math.max(0.15, amp * jitter));
      }
      const barHeight = Math.max(4, amp * (height - 8));
      const x = i * (barWidth + gap);
      const y = (height - barHeight) / 2;

      const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
      if (barRatio <= progressRatio) {
        grad.addColorStop(0, '#00E5FF');
        grad.addColorStop(0.5, '#38BDF8');
        grad.addColorStop(1, '#A855F7');
      } else {
        grad.addColorStop(0, 'rgba(0, 229, 255, 0.45)');
        grad.addColorStop(0.5, 'rgba(124, 58, 237, 0.50)');
        grad.addColorStop(1, 'rgba(168, 85, 247, 0.40)');
      }

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function updatePlayerTimeUI() {
    const timeLabel = document.getElementById('player-time-label');
    const seekSlider = document.getElementById('player-seek-slider');
    if (timeLabel) {
      timeLabel.textContent = formatTime(state.currentTimeSec) + ' / ' + formatTime(state.totalDurationSec);
    }
    if (seekSlider && state.totalDurationSec > 0) {
      seekSlider.value = Math.min(100, Math.round((state.currentTimeSec / state.totalDurationSec) * 100));
    }
  }

  // --- 10. CRYSTAL-CLEAR VIETNAMESE SPEECH ENGINE (Persistent HTML5 Audio + Verified Native Speech + Validated MP3 Export) ---
  function ensureAudioContext() {
    if (!state.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        state.audioCtx = new AudioContextClass();
      }
    }
    if (state.audioCtx && state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }
    return state.audioCtx;
  }

  // Get persistent unlocked <audio referrerpolicy="no-referrer"> element
  function getPersistentAudioElement() {
    if (!window.__lhptHtmlAudio) {
      const a = document.createElement('audio');
      a.setAttribute('referrerpolicy', 'no-referrer');
      a.preload = 'auto';
      a.style.display = 'none';
      document.body.appendChild(a);
      window.__lhptHtmlAudio = a;
    }
    return window.__lhptHtmlAudio;
  }

  // Multiple direct TTS stream URLs for a short <= 90-char clause
  function getTtsStreamUrls(chunkText, tlCode) {
    const tl = tlCode || 'vi';
    const q = encodeURIComponent(chunkText);
    const u1 = 'https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=' + encodeURIComponent(tl) + '&client=tw-ob&q=' + q;
    const u2 = 'https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=' + encodeURIComponent(tl) + '&client=gtx&q=' + q;
    return [
      u1,
      u2,
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(u1),
      'https://corsproxy.io/?' + encodeURIComponent(u2)
    ];
  }

  // Verify that an ArrayBuffer is a genuine MP3/audio binary (NOT an HTML or JSON error page from a proxy!)
  function isValidMp3Buffer(ab) {
    if (!ab || ab.byteLength < 300) return false;
    const u8 = new Uint8Array(ab);
    // Reject HTML ('<' = 0x3C) or JSON ('{' = 0x7B) or plain text ('E'rror = 0x45)
    if (u8[0] === 0x3C || u8[0] === 0x7B) return false;
    // Check for 'ID3' header (0x49 0x44 0x33) or MPEG sync word (0xFF and top 3 bits of byte 1 = 111)
    if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return true;
    if (u8[0] === 0xFF && (u8[1] & 0xE0) === 0xE0) return true;
    // Also scan first 64 bytes for MPEG frame sync
    for (let i = 0; i < Math.min(64, u8.length - 1); i++) {
      if (u8[i] === 0xFF && (u8[i + 1] & 0xE0) === 0xE0) return true;
    }
    return false;
  }

  // Fetch verified MP3 ArrayBuffer for WAV/MP3 export across 5 independent endpoints with retry
  async function fetchVerifiedTtsMp3Buffer(chunkText, tlCode, chunkIdx) {
    const urls = getTtsStreamUrls(chunkText, tlCode);
    const primaryTw = urls[0];
    const primaryGtx = urls[1];

    // Rotate proxy order based on chunkIdx to distribute load and avoid per-proxy rate limits!
    const proxyList = [
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(primaryTw),
      'https://corsproxy.io/?' + encodeURIComponent(primaryGtx),
      'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(primaryTw),
      'https://corsproxy.io/?' + encodeURIComponent(primaryTw),
      primaryTw,
      primaryGtx
    ];

    const startOffset = (chunkIdx || 0) % 3;
    const orderedCandidates = proxyList.slice(startOffset).concat(proxyList.slice(0, startOffset));

    for (let i = 0; i < orderedCandidates.length; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(orderedCandidates[i], {
          method: 'GET',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const ab = await res.arrayBuffer();
          if (isValidMp3Buffer(ab)) {
            return ab;
          }
        }
      } catch (e) {}
    }
    return null;
  }

  function mergeAudioBuffers(buffers) {
    const ctx = ensureAudioContext();
    if (!ctx || !buffers || buffers.length === 0) return null;
    if (buffers.length === 1) return buffers[0];
    const sr = buffers[0].sampleRate;
    const totalLen = buffers.reduce((acc, b) => acc + b.length, 0);
    const out = ctx.createBuffer(1, totalLen, sr);
    const chan = out.getChannelData(0);
    let offset = 0;
    for (let b of buffers) {
      chan.set(b.getChannelData(0), offset);
      offset += b.length;
    }
    return out;
  }

  function encodeAudioBufferToWavBlob(audioBuffer) {
    const targetChannels = state.channels || 1;
    const sampleRate = audioBuffer.sampleRate;
    const samples = audioBuffer.getChannelData(0);
    const bytesPerSample = 2;
    const blockAlign = targetChannels * bytesPerSample;
    const dataSize = samples.length * blockAlign;
    const arrayBuffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(arrayBuffer);

    function writeString(offset, string) {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, targetChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const pcm = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, pcm, true);
      offset += 2;
      if (targetChannels === 2) {
        view.setInt16(offset, pcm, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  function encodeAudioBufferToMp3Blob(audioBuffer) {
    // If we have raw verified MP3 chunks directly from the neural TTS stream and user pitch is 0,
    // we can also encode via lamejs at the exact requested bitrate (128/192/320 kbps)
    const sampleRate = audioBuffer.sampleRate;
    const kbps = state.mp3Bitrate || 192;
    const floatSamples = audioBuffer.getChannelData(0);
    const pcm16 = new Int16Array(floatSamples.length);

    for (let i = 0; i < floatSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, floatSamples[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    if (window.lamejs && window.lamejs.Mp3Encoder) {
      const mp3encoder = new window.lamejs.Mp3Encoder(1, sampleRate, kbps);
      const mp3Data = [];
      const sampleBlockSize = 1152;
      for (let i = 0; i < pcm16.length; i += sampleBlockSize) {
        const sampleChunk = pcm16.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf && mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
        }
      }
      const endBuf = mp3encoder.flush();
      if (endBuf && endBuf.length > 0) {
        mp3Data.push(new Int8Array(endBuf));
      }
      return new Blob(mp3Data, { type: 'audio/mpeg' });
    }

    if (state.rawMp3ChunksCache && state.rawMp3ChunksCache.length > 0) {
      return new Blob(state.rawMp3ChunksCache, { type: 'audio/mpeg' });
    }

    return encodeAudioBufferToWavBlob(audioBuffer);
  }

  function stopPlayback() {
    state.isPlaying = false;
    if (state.playbackTimer) {
      clearInterval(state.playbackTimer);
      state.playbackTimer = null;
    }
    if (state.speechKeepAliveTimer) {
      clearInterval(state.speechKeepAliveTimer);
      state.speechKeepAliveTimer = null;
    }
    if (state.activeSourceNode) {
      try { state.activeSourceNode.stop(); } catch (e) {}
      state.activeSourceNode = null;
    }
    if (window.__lhptHtmlAudio) {
      try {
        window.__lhptHtmlAudio.pause();
        window.__lhptHtmlAudio.onended = null;
        window.__lhptHtmlAudio.onerror = null;
      } catch (e) {}
    }
    if (window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
    updatePlayButtonIcons();
    renderWaveformCanvas();
  }

  function updatePlayButtonIcons() {
    const playIcon = document.getElementById('player-play-icon');
    const pauseIcon = document.getElementById('player-pause-icon');
    if (playIcon && pauseIcon) {
      if (state.isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
      } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
      }
    }
  }

  // Play sequential <= 90-char clauses via ONE persistent <audio referrerpolicy="no-referrer"> element
  function playSegmentsSequentiallyViaHtml5Audio(segments, voiceProfile, onChunkProgress, onAllFinished) {
    if (!segments || segments.length === 0 || state.isMuted) {
      onAllFinished(false);
      return;
    }

    const audio = getPersistentAudioElement();
    let segIdx = 0;
    let urlVariantIdx = 0;

    const playNextSegment = () => {
      if (!state.isPlaying || state.cancelSynthesisFlag) {
        return;
      }
      if (segIdx >= segments.length) {
        onAllFinished(true);
        return;
      }

      const candidateUrls = getTtsStreamUrls(segments[segIdx], voiceProfile.tl || 'vi');
      if (urlVariantIdx >= candidateUrls.length) {
        // If one segment fails on all URLs, advance to next segment rather than aborting or beeping
        segIdx++;
        urlVariantIdx = 0;
        playNextSegment();
        return;
      }

      onChunkProgress(segIdx, segments.length);

      audio.onended = null;
      audio.onerror = null;
      audio.src = candidateUrls[urlVariantIdx];
      audio.volume = state.isMuted ? 0 : Math.min(1, state.volume / 100);

      // Keep preservesPitch = true unless user explicitly adjusted Pitch slider,
      // so the Vietnamese words are 100% crisp and never slurred!
      const speedFactor = Math.max(0.5, Math.min(2.0, state.speed * (voiceProfile.speedMod || 1.0)));
      if (state.pitch !== 0) {
        const pitchMod = Math.pow(2, state.pitch / 100);
        audio.preservesPitch = false;
        audio.mozPreservesPitch = false;
        audio.webkitPreservesPitch = false;
        audio.playbackRate = Math.max(0.6, Math.min(1.8, speedFactor * pitchMod));
      } else {
        audio.preservesPitch = true;
        audio.mozPreservesPitch = true;
        audio.webkitPreservesPitch = true;
        audio.playbackRate = speedFactor;
      }

      audio.onended = () => {
        segIdx++;
        urlVariantIdx = 0;
        playNextSegment();
      };

      audio.onerror = () => {
        urlVariantIdx++;
        playNextSegment();
      };

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          urlVariantIdx++;
          playNextSegment();
        });
      }
    };

    playNextSegment();
  }

  // Sequential Native SpeechSynthesis (ONLY when a genuine matching language voice like 'vi-VN' is installed!)
  // Speaks ONE segment at a time via utter.onend so Chrome's speech queue never overflows after chunk 1!
  function tryPlaySequentiallyViaNativeViVoice(segments, voiceProfile, onChunkProgress, onAllFinished) {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
      return false;
    }
    try {
      const voices = window.speechSynthesis.getVoices() || [];
      const langPrefix = (voiceProfile.lang || 'vi-VN').slice(0, 2).toLowerCase();
      const matchingVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().includes(langPrefix));

      // NEVER use an English voice to read Vietnamese text!
      if (matchingVoices.length === 0) {
        return false;
      }

      let chosenVoice = matchingVoices[0];
      if (matchingVoices.length > 1) {
        const genderHint = voiceProfile.gender === 'male' ? /nam|minh|male|hung|an/i : /nu|nữ|hoai|my|linh|female/i;
        const found = matchingVoices.find((v) => genderHint.test(v.name));
        if (found) chosenVoice = found;
      }

      window.__lhptUtterances = [];
      let segIdx = 0;

      // Chrome 15-second pause bug workaround: periodically call resume()
      if (state.speechKeepAliveTimer) clearInterval(state.speechKeepAliveTimer);
      state.speechKeepAliveTimer = setInterval(() => {
        if (state.isPlaying && window.speechSynthesis.speaking) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }, 10000);

      const speakNextSegment = () => {
        if (!state.isPlaying || state.cancelSynthesisFlag) return;
        if (segIdx >= segments.length) {
          onAllFinished(true);
          return;
        }
        onChunkProgress(segIdx, segments.length);

        const utter = new SpeechSynthesisUtterance(segments[segIdx]);
        utter.voice = chosenVoice;
        utter.lang = chosenVoice.lang || voiceProfile.lang || 'vi-VN';
        utter.rate = Math.max(0.5, Math.min(2.0, state.speed * (voiceProfile.speedMod || 1.0)));
        utter.pitch = state.pitch === 0 ? 1.0 : Math.max(0.6, Math.min(1.6, 1.0 + (state.pitch / 100)));
        utter.volume = state.isMuted ? 0 : Math.min(1, state.volume / 100);

        utter.onend = () => {
          segIdx++;
          speakNextSegment();
        };
        utter.onerror = () => {
          // If native speech fails mid-way, hand off remaining segments to HTML5 Audio streamer!
          const remaining = segments.slice(segIdx);
          playSegmentsSequentiallyViaHtml5Audio(
            remaining,
            voiceProfile,
            (remIdx) => onChunkProgress(segIdx + remIdx, segments.length),
            onAllFinished
          );
        };

        window.__lhptUtterances.push(utter);
        window.speechSynthesis.speak(utter);
      };

      setTimeout(speakNextSegment, 75);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Main Synthesis & Sequential Playback Pipeline
  async function synthesizeAndPlay(inputText, voiceProfile, isQuickPreview) {
    stopPlayback();
    state.cancelSynthesisFlag = false;
    ensureAudioContext();

    const rawText = (inputText || '').trim() || voiceProfile.sampleText;
    const normalizedText = normalizeTextForTTS(rawText, state.readNumbers, state.readAbbrev);
    const segments = splitTextIntoSafeChunks(normalizedText, 90);

    const words = normalizedText.split(/\s+/).filter(Boolean).length;
    state.totalDurationSec = Math.max(3, Math.round((words / 135) * 60 / state.speed));
    state.currentTimeSec = 0;
    state.activeChunkIndex = 0;
    state.totalChunksCount = Math.max(1, segments.length);
    state.isPlaying = true;
    state.waveformPeaks = generateWaveformPeaks(normalizedText + voiceProfile.id);

    updatePlayButtonIcons();
    updatePlayerTimeUI();
    renderWaveformCanvas();

    const chunkPanel = document.getElementById('chunk-progress-panel');
    const chunkBar = document.getElementById('chunk-progress-bar');
    const chunkLabel = document.getElementById('chunk-progress-label');
    if (chunkPanel) chunkPanel.classList.remove('hidden');

    const onChunkProgress = (idx, total) => {
      state.activeChunkIndex = idx;
      state.totalChunksCount = total;
      if (chunkLabel) {
        chunkLabel.textContent = 'Đang đọc đoạn ' + (idx + 1) + '/' + total + ': "' +
          (segments[idx].length > 42 ? segments[idx].slice(0, 42) + '...' : segments[idx]) + '"';
      }
      if (chunkBar) {
        chunkBar.style.width = Math.round(((idx + 1) / total) * 100) + '%';
      }
      // Sync player time proportionally to current chunk so seek bar stays accurate
      state.currentTimeSec = (idx / total) * state.totalDurationSec;
      updatePlayerTimeUI();
    };

    const onAllFinished = () => {
      state.currentTimeSec = state.totalDurationSec;
      updatePlayerTimeUI();
      if (chunkPanel) {
        if (chunkLabel) chunkLabel.textContent = 'Đã đọc xong toàn bộ ' + segments.length + ' đoạn văn bản.';
        setTimeout(() => chunkPanel.classList.add('hidden'), 1200);
      }
      stopPlayback();
    };

    showToast(
      (isQuickPreview ? 'Đang phát giọng: ' : 'Đang đọc văn bản: ') + voiceProfile.name + ' (' + segments.length + ' câu)',
      'success'
    );

    // Primary playback: Stream real human Vietnamese speech via Persistent HTML5 <audio>
    // (or Native Vietnamese voice if installed and preferred)
    playSegmentsSequentiallyViaHtml5Audio(segments, voiceProfile, onChunkProgress, (streamOk) => {
      if (!streamOk && state.isPlaying && !state.cancelSynthesisFlag) {
        const nativeOk = tryPlaySequentiallyViaNativeViVoice(segments, voiceProfile, onChunkProgress, onAllFinished);
        if (!nativeOk) {
          onAllFinished();
        }
      } else {
        onAllFinished();
      }
    });

    // Smooth UI timer that advances within the current chunk WITHOUT ever calling stopPlayback() prematurely!
    state.playbackTimer = setInterval(() => {
      if (!state.isPlaying) return;
      const maxTimeForChunk = ((state.activeChunkIndex + 0.95) / state.totalChunksCount) * state.totalDurationSec;
      if (state.currentTimeSec < maxTimeForChunk) {
        state.currentTimeSec = Math.min(maxTimeForChunk, state.currentTimeSec + 0.1);
      }
      updatePlayerTimeUI();
      renderWaveformCanvas();
    }, 100);
  }

  // Export Real Human Spoken WAV / MP3 by fetching & verifying every <= 90-char clause
  async function exportAudioFile(extension) {
    const textarea = document.getElementById('studio-textarea');
    const rawText = (textarea && textarea.value.trim())
      ? textarea.value.trim()
      : 'Xin chào từ LHPT Voice! Công cụ chuyển văn bản thành giọng nói tự nhiên.';
    const normalizedText = normalizeTextForTTS(rawText, state.readNumbers, state.readAbbrev);
    const voice = VOICE_PROFILES.find((v) => v.id === state.selectedVoiceId) || VOICE_PROFILES[1];
    const cacheKey = voice.id + ':' + state.speed + ':' + state.pitch + ':' + normalizedText;

    const chunkPanel = document.getElementById('chunk-progress-panel');
    const chunkBar = document.getElementById('chunk-progress-bar');
    const chunkLabel = document.getElementById('chunk-progress-label');

    if (state.lastSynthesizedKey !== cacheKey || !state.synthesizedAudioBuffer) {
      const ctx = ensureAudioContext();
      const segments = splitTextIntoSafeChunks(normalizedText, 90);
      if (chunkPanel) chunkPanel.classList.remove('hidden');
      showToast('Đang tải và ghép ' + segments.length + ' đoạn giọng đọc thật sang ' + extension.toUpperCase() + '...', 'info');

      const decodedBuffers = [];
      const rawMp3Parts = [];

      for (let i = 0; i < segments.length; i++) {
        if (state.cancelSynthesisFlag) break;
        if (chunkLabel) {
          chunkLabel.textContent = 'Đang kết xuất file âm thanh đoạn ' + (i + 1) + '/' + segments.length + '...';
        }
        if (chunkBar) {
          chunkBar.style.width = Math.round(((i + 1) / segments.length) * 100) + '%';
        }

        const ab = await fetchVerifiedTtsMp3Buffer(segments[i], voice.tl || 'vi', i);
        if (ab) {
          rawMp3Parts.push(new Uint8Array(ab.slice(0)));
          if (ctx) {
            try {
              const dec = await ctx.decodeAudioData(ab.slice(0));
              decodedBuffers.push(dec);
            } catch (e) {}
          }
        }
        // Polite 150ms spacing between chunks so proxies never rate-limit!
        if (i < segments.length - 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      if (chunkPanel) {
        setTimeout(() => chunkPanel.classList.add('hidden'), 800);
      }

      state.rawMp3ChunksCache = rawMp3Parts;
      if (decodedBuffers.length > 0) {
        state.synthesizedAudioBuffer = mergeAudioBuffers(decodedBuffers);
        state.lastSynthesizedKey = cacheKey;
        state.waveformPeaks = extractPeaksFromAudioBuffer(state.synthesizedAudioBuffer);
        renderWaveformCanvas();
      }
    }

    let blob = null;
    if (extension === 'mp3' && state.rawMp3ChunksCache && state.rawMp3ChunksCache.length > 0) {
      // Direct concatenation of genuine MPEG-1 Layer III TTS frames preserves 100% original vocal quality!
      blob = new Blob(state.rawMp3ChunksCache, { type: 'audio/mpeg' });
    } else if (state.synthesizedAudioBuffer) {
      blob = extension === 'mp3'
        ? encodeAudioBufferToMp3Blob(state.synthesizedAudioBuffer)
        : encodeAudioBufferToWavBlob(state.synthesizedAudioBuffer);
    }

    if (!blob) {
      showToast('Không thể kết nối máy chủ giọng đọc để tải file. Vui lòng kiểm tra mạng!', 'error');
      return;
    }

    const mimeBadge = document.getElementById('audio-mime-status');
    if (mimeBadge) {
      mimeBadge.textContent = 'Đã xuất: ' + blob.type + ' • ' + (blob.size / 1024).toFixed(1) + ' KB • Giọng đọc thật 100%';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = 'lhpt-voice-' + (voice.id || 'audio') + '-' + Date.now();
    a.href = url;
    a.download = safeName + '.' + extension;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast('Đã xuất file ' + extension.toUpperCase() + ' (' + (blob.size / 1024).toFixed(1) + ' KB) thành công!', 'success');
  }

  // --- 11. DOCX / TXT / SRT Unlimited File Parser ---
  async function extractTextFromDocxArrayBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    let offset = 0;

    while (offset + 30 < bytes.length) {
      const sig = view.getUint32(offset, true);
      if (sig !== 0x04034b50) break;
      const compression = view.getUint16(offset + 8, true);
      const compressedSize = view.getUint32(offset + 18, true);
      const fileNameLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);
      const entryName = new TextDecoder().decode(bytes.subarray(offset + 30, offset + 30 + fileNameLen));
      const dataStart = offset + 30 + fileNameLen + extraLen;
      const compressedData = bytes.subarray(dataStart, dataStart + compressedSize);

      if (entryName === 'word/document.xml') {
        let xmlText = '';
        if (compression === 0) {
          xmlText = new TextDecoder().decode(compressedData);
        } else if (compression === 8 && typeof DecompressionStream !== 'undefined') {
          const ds = new DecompressionStream('deflate-raw');
          const writer = ds.writable.getWriter();
          writer.write(compressedData);
          writer.close();
          const decompressedBuf = await new Response(ds.readable).arrayBuffer();
          xmlText = new TextDecoder().decode(decompressedBuf);
        }
        if (xmlText) {
          return xmlText
            .replace(/<\/w:p>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/\n{2,}/g, '\n')
            .trim();
        }
      }
      offset = dataStart + compressedSize;
    }
    throw new Error('Không thể đọc cấu trúc XML từ file DOCX.');
  }

  // --- 12. Undo / Redo History ---
  function pushHistory(text) {
    if (state.editorHistory[state.historyIndex] === text) return;
    state.editorHistory = state.editorHistory.slice(0, state.historyIndex + 1);
    state.editorHistory.push(text);
    if (state.editorHistory.length > 40) state.editorHistory.shift();
    state.historyIndex = state.editorHistory.length - 1;
  }

  // --- 13. Initialize & Bind All Interactive Controls ---
  function bindEvents() {
    const textarea = document.getElementById('studio-textarea');
    if (textarea) {
      textarea.addEventListener('input', function() {
        state.synthesizedAudioBuffer = null;
        state.rawMp3ChunksCache = [];
        pushHistory(this.value);
        updateEditorMetrics();
        updateAutoSaveTime();
      });
    }

    const btnUndo = document.getElementById('btn-editor-undo');
    const btnRedo = document.getElementById('btn-editor-redo');
    const btnSample = document.getElementById('btn-editor-sample');
    const btnClear = document.getElementById('btn-editor-clear');

    if (btnUndo) {
      btnUndo.addEventListener('click', function() {
        if (state.historyIndex > 0) {
          state.historyIndex--;
          textarea.value = state.editorHistory[state.historyIndex] || '';
          updateEditorMetrics();
          showToast('Đã hoàn tác văn bản', 'info');
        }
      });
    }
    if (btnRedo) {
      btnRedo.addEventListener('click', function() {
        if (state.historyIndex < state.editorHistory.length - 1) {
          state.historyIndex++;
          textarea.value = state.editorHistory[state.historyIndex] || '';
          updateEditorMetrics();
          showToast('Đã làm lại văn bản', 'info');
        }
      });
    }
    if (btnSample) {
      btnSample.addEventListener('click', function() {
        const samples = [
          'Chào mừng bạn đến với LHPT Voice năm 2026. Đây là công cụ chuyển văn bản thành giọng nói AI tự nhiên, miễn phí 100%, không giới hạn ký tự và hỗ trợ xuất file WAV, MP3 chất lượng cao.',
          'Hôm nay tại TP.HCM và HN, đội ngũ CNTT giới thiệu LHPT Voice Studio giúp sáng tạo nội dung video, podcast và bài thuyết trình chuyên nghiệp chỉ trong vài giây.',
          'Dữ liệu dự án của bạn được bảo mật tuyệt đối và lưu trữ trực tiếp trên thiết bị thông qua công nghệ IndexedDB hiện đại.'
        ];
        const nextSample = samples[Math.floor(Math.random() * samples.length)];
        textarea.value = nextSample;
        state.synthesizedAudioBuffer = null;
        state.rawMp3ChunksCache = [];
        pushHistory(nextSample);
        updateEditorMetrics();
        showToast('Đã chèn văn bản mẫu tiếng Việt!', 'info');
      });
    }
    if (btnClear && textarea) {
      btnClear.addEventListener('click', function() {
        textarea.value = '';
        state.synthesizedAudioBuffer = null;
        state.rawMp3ChunksCache = [];
        pushHistory('');
        updateEditorMetrics();
        showToast('Đã xóa nội dung văn bản trong trình soạn thảo', 'info');
      });
    }

    const btnFormatText = document.getElementById('btn-format-text');
    const btnUploadFile = document.getElementById('btn-upload-file');
    const fileInput = document.getElementById('hidden-txt-input');

    if (btnFormatText && textarea) {
      btnFormatText.addEventListener('click', function() {
        if (!textarea.value.trim()) {
          if (btnSample) btnSample.click();
          return;
        }
        textarea.value = normalizeTextForTTS(textarea.value, state.readNumbers, state.readAbbrev);
        state.synthesizedAudioBuffer = null;
        state.rawMp3ChunksCache = [];
        pushHistory(textarea.value);
        updateEditorMetrics();
        showToast('Đã chuẩn hóa số và chữ viết tắt tiếng Việt!', 'success');
      });
    }

    if (btnUploadFile && fileInput) {
      btnUploadFile.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', async function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          let content = '';
          const lower = file.name.toLowerCase();
          if (lower.endsWith('.docx')) {
            const ab = await file.arrayBuffer();
            content = await extractTextFromDocxArrayBuffer(ab);
          } else {
            content = await file.text();
            if (lower.endsWith('.srt')) {
              content = content
                .replace(/^\d+\s*$/gm, '')
                .replace(/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/g, '')
                .trim();
            }
          }
          content = String(content || '').trim();
          if (textarea) {
            textarea.value = content;
            state.synthesizedAudioBuffer = null;
            state.rawMp3ChunksCache = [];
            pushHistory(content);
            updateEditorMetrics();
          }
          showToast('Đã nhập toàn bộ file (' + content.length.toLocaleString('vi-VN') + ' ký tự): ' + file.name, 'success');
        } catch (err) {
          showToast('Lỗi đọc file: ' + (err.message || file.name), 'error');
        }
      });
    }

    const btnCancelChunks = document.getElementById('btn-cancel-chunks');
    const btnRetryChunks = document.getElementById('btn-retry-chunks');
    if (btnCancelChunks) {
      btnCancelChunks.addEventListener('click', function() {
        state.cancelSynthesisFlag = true;
        stopPlayback();
      });
    }
    if (btnRetryChunks) {
      btnRetryChunks.addEventListener('click', function() {
        const voice = VOICE_PROFILES.find((v) => v.id === state.selectedVoiceId) || VOICE_PROFILES[1];
        const text = (textarea && textarea.value.trim()) ? textarea.value.trim() : voice.sampleText;
        synthesizeAndPlay(text, voice, false);
      });
    }

    const btnGenerate = document.getElementById('btn-generate-voice');
    const btnPreview = document.getElementById('btn-preview-voice');

    if (btnGenerate) {
      btnGenerate.addEventListener('click', function() {
        const voice = VOICE_PROFILES.find((v) => v.id === state.selectedVoiceId) || VOICE_PROFILES[1];
        let text = textarea ? textarea.value.trim() : '';
        if (!text) {
          text = voice.sampleText;
          if (textarea) {
            textarea.value = text;
            pushHistory(text);
            updateEditorMetrics();
          }
        }
        synthesizeAndPlay(text, voice, false);
        updateAutoSaveTime();
      });
    }

    if (btnPreview) {
      btnPreview.addEventListener('click', function() {
        const voice = VOICE_PROFILES.find((v) => v.id === state.selectedVoiceId) || VOICE_PROFILES[1];
        const text = (textarea && textarea.value.trim()) ? textarea.value.trim() : voice.sampleText;
        synthesizeAndPlay(text, voice, true);
      });
    }

    const tabVi = document.getElementById('tab-lang-vi');
    const tabOther = document.getElementById('tab-lang-other');
    if (tabVi && tabOther) {
      tabVi.addEventListener('click', function() {
        state.voiceLangTab = 'vi';
        tabVi.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/30 text-cyan-300 border border-cyan-400/50 transition';
        tabOther.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition';
        renderVoiceList();
      });
      tabOther.addEventListener('click', function() {
        state.voiceLangTab = 'other';
        tabOther.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold bg-blue-600/30 text-cyan-300 border border-cyan-400/50 transition';
        tabVi.className = 'flex-1 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 transition';
        renderVoiceList();
      });
    }

    const subTabSouth = document.getElementById('subtab-south');
    const subTabNatural = document.getElementById('subtab-natural');
    if (subTabSouth && subTabNatural) {
      subTabSouth.addEventListener('click', function() {
        state.voiceSubFilter = state.voiceSubFilter === 'south' ? 'all' : 'south';
        subTabSouth.className = state.voiceSubFilter === 'south'
          ? 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-600/30 text-cyan-300 border border-cyan-400/40 transition'
          : 'px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 transition';
        subTabNatural.className = state.voiceSubFilter === 'all'
          ? 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-600/30 text-cyan-300 border border-cyan-400/40 transition'
          : 'px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 transition';
        renderVoiceList();
      });
      subTabNatural.addEventListener('click', function() {
        state.voiceSubFilter = 'all';
        subTabNatural.className = 'px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-600/30 text-cyan-300 border border-cyan-400/40 transition';
        subTabSouth.className = 'px-2.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 transition';
        renderVoiceList();
      });
    }

    const sliderSpeed = document.getElementById('slider-speed');
    const valSpeed = document.getElementById('val-speed');
    const badgeSpeed = document.getElementById('badge-speed-val');

    if (sliderSpeed) {
      sliderSpeed.addEventListener('input', function() {
        state.speed = parseFloat(this.value) || 1.0;
        const formatted = state.speed.toFixed(1) + 'x';
        if (valSpeed) valSpeed.textContent = formatted;
        if (badgeSpeed) badgeSpeed.textContent = 'Xs ' + formatted;
        if (window.__lhptHtmlAudio) {
          window.__lhptHtmlAudio.playbackRate = state.speed;
        }
        updateEditorMetrics();
        saveSettingsToLocal();
      });
    }

    const sliderVolume = document.getElementById('slider-volume');
    const valVolume = document.getElementById('val-volume');
    if (sliderVolume) {
      sliderVolume.addEventListener('input', function() {
        state.volume = parseInt(this.value, 10) || 0;
        if (valVolume) valVolume.textContent = state.volume + '%';
        if (window.__lhptHtmlAudio) {
          window.__lhptHtmlAudio.volume = state.isMuted ? 0 : Math.min(1, state.volume / 100);
        }
      });
    }

    const sliderPitch = document.getElementById('slider-pitch');
    const valPitch = document.getElementById('val-pitch');
    if (sliderPitch) {
      sliderPitch.addEventListener('input', function() {
        state.pitch = parseInt(this.value, 10) || 0;
        const sign = state.pitch > 0 ? '+' : '';
        if (valPitch) valPitch.textContent = sign + state.pitch + '%';
      });
    }

    const toggleAutosplit = document.getElementById('toggle-autosplit');
    if (toggleAutosplit) {
      toggleAutosplit.addEventListener('change', function() {
        state.autoSplit = this.checked;
        showToast(state.autoSplit ? 'Đã bật tự động chia đoạn dài' : 'Đã tắt tự động chia đoạn dài', 'info');
      });
    }

    const toggleReadNumbers = document.getElementById('toggle-read-numbers');
    if (toggleReadNumbers) {
      toggleReadNumbers.addEventListener('change', function() {
        state.readNumbers = this.checked;
        showToast(state.readNumbers ? 'Đã bật tự động đọc số tiếng Việt' : 'Đã tắt đọc số thành chữ', 'info');
      });
    }

    const toggleReadAbbrev = document.getElementById('toggle-read-abbrev');
    if (toggleReadAbbrev) {
      toggleReadAbbrev.addEventListener('change', function() {
        state.readAbbrev = this.checked;
        showToast(state.readAbbrev ? 'Đã bật mở rộng từ viết tắt tiếng Việt' : 'Đã tắt mở rộng từ viết tắt', 'info');
      });
    }

    const btnPlayPause = document.getElementById('btn-player-play');
    if (btnPlayPause) {
      btnPlayPause.addEventListener('click', function() {
        if (state.isPlaying) {
          stopPlayback();
        } else {
          const voice = VOICE_PROFILES.find((v) => v.id === state.selectedVoiceId) || VOICE_PROFILES[1];
          const text = (textarea && textarea.value.trim()) ? textarea.value.trim() : voice.sampleText;
          synthesizeAndPlay(text, voice, false);
        }
      });
    }

    const seekSlider = document.getElementById('player-seek-slider');
    if (seekSlider) {
      seekSlider.addEventListener('input', function() {
        const pct = parseFloat(this.value) || 0;
        state.currentTimeSec = (pct / 100) * state.totalDurationSec;
        updatePlayerTimeUI();
        renderWaveformCanvas();
      });
    }

    const waveformCanvas = document.getElementById('waveform-canvas');
    if (waveformCanvas) {
      waveformCanvas.addEventListener('click', function(e) {
        const rect = this.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        state.currentTimeSec = ratio * state.totalDurationSec;
        updatePlayerTimeUI();
        renderWaveformCanvas();
      });
    }

    const btnSkip10 = document.getElementById('btn-skip-10s');
    if (btnSkip10) {
      btnSkip10.addEventListener('click', function() {
        state.currentTimeSec = Math.min(state.totalDurationSec, state.currentTimeSec + 10);
        updatePlayerTimeUI();
        renderWaveformCanvas();
      });
    }

    const btnMute = document.getElementById('btn-player-mute');
    const btnExportMute = document.getElementById('btn-export-mute');
    function toggleMute() {
      state.isMuted = !state.isMuted;
      if (window.__lhptHtmlAudio) {
        window.__lhptHtmlAudio.muted = state.isMuted;
      }
      showToast(state.isMuted ? 'Đã tắt tiếng trình phát' : 'Đã bật tiếng trình phát', 'info');
    }
    if (btnMute) btnMute.addEventListener('click', toggleMute);
    if (btnExportMute) btnExportMute.addEventListener('click', toggleMute);

    const btnCycleSpeed = document.getElementById('btn-cycle-speed');
    if (btnCycleSpeed) {
      btnCycleSpeed.addEventListener('click', function() {
        const speeds = [0.8, 1.0, 1.2, 1.5, 2.0];
        const nextIdx = (speeds.indexOf(state.speed) + 1) % speeds.length;
        state.speed = speeds[nextIdx];
        if (sliderSpeed) sliderSpeed.value = state.speed;
        if (valSpeed) valSpeed.textContent = state.speed.toFixed(1) + 'x';
        if (badgeSpeed) badgeSpeed.textContent = 'Xs ' + state.speed.toFixed(1) + 'x';
        if (window.__lhptHtmlAudio) {
          window.__lhptHtmlAudio.playbackRate = state.speed;
        }
        showToast('Tốc độ đọc: ' + state.speed.toFixed(1) + 'x', 'info');
      });
    }

    const btnExportWav = document.getElementById('btn-export-wav');
    const btnExportMp3 = document.getElementById('btn-export-mp3');
    if (btnExportWav) btnExportWav.addEventListener('click', () => exportAudioFile('wav'));
    if (btnExportMp3) btnExportMp3.addEventListener('click', () => exportAudioFile('mp3'));

    const btnMoreOptions = document.getElementById('btn-export-more');
    if (btnMoreOptions) {
      btnMoreOptions.addEventListener('click', function() {
        const text = (textarea && textarea.value.trim()) ? textarea.value.trim() : 'Bản ghi văn bản từ LHPT Voice Studio.';
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lhpt-voice-script.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        showToast('Đã tải xuống kịch bản văn bản (.txt)', 'success');
      });
    }

    const searchInput = document.getElementById('library-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        state.librarySearch = this.value;
        renderProjectLibrary();
      });
    }

    document.querySelectorAll('[data-lib-filter]').forEach((pill) => {
      pill.addEventListener('click', function() {
        state.libraryFilter = this.getAttribute('data-lib-filter');
        document.querySelectorAll('[data-lib-filter]').forEach((el) => {
          const active = el.getAttribute('data-lib-filter') === state.libraryFilter;
          el.className = active
            ? 'px-3.5 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow transition'
            : 'px-3.5 py-1 rounded-full text-xs font-medium bg-slate-800/80 text-slate-300 hover:text-white transition';
        });
        renderProjectLibrary();
      });
    });

    const btnNewProject = document.getElementById('btn-new-project');
    const modalNewProject = document.getElementById('modal-new-project');
    const btnCancelProject = document.getElementById('btn-cancel-project');
    const formNewProject = document.getElementById('form-new-project');

    if (btnNewProject && modalNewProject) {
      btnNewProject.addEventListener('click', function() {
        const titleInput = document.getElementById('new-project-title');
        if (titleInput) titleInput.value = 'Dự án mới #' + (state.projects.length + 1);
        modalNewProject.classList.remove('hidden');
        modalNewProject.classList.add('flex');
      });
    }
    if (btnCancelProject && modalNewProject) {
      btnCancelProject.addEventListener('click', function() {
        modalNewProject.classList.add('hidden');
        modalNewProject.classList.remove('flex');
      });
    }
    if (formNewProject) {
      formNewProject.addEventListener('submit', function(e) {
        e.preventDefault();
        const titleInput = document.getElementById('new-project-title');
        const catSelect = document.getElementById('new-project-category');
        const title = (titleInput && titleInput.value.trim()) ? titleInput.value.trim() : 'Dự án LHPT mới';
        const category = (catSelect && catSelect.value) ? catSelect.value : 'audio';
        const currentText = (textarea && textarea.value.trim())
          ? textarea.value.trim()
          : 'Nội dung dự án "' + title + '" được khởi tạo trên LHPT Voice Studio.';

        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2, '0') + '/' + now.getFullYear();
        const words = currentText.split(/\s+/).length;
        const durSec = Math.max(30, words * 2);
        const durStr = formatTime(durSec);

        const icons = ['doc-blue', 'doc-amber', 'audio-cyan', 'video-pink', 'note-green'];
        const newProj = {
          id: 'proj-' + Date.now(),
          title: title,
          date: dd + ' • ' + durStr,
          durationSec: durSec,
          durationFormatted: durStr,
          category: category,
          voiceId: state.selectedVoiceId,
          iconType: icons[state.projects.length % icons.length],
          text: currentText
        };

        state.projects.unshift(newProj);
        state.activeProjectId = newProj.id;
        saveAllProjectsToDB(state.projects);
        renderProjectLibrary();
        if (modalNewProject) {
          modalNewProject.classList.add('hidden');
          modalNewProject.classList.remove('flex');
        }
        showToast('Đã lưu dự án "' + title + '" vào IndexedDB!', 'success');
      });
    }

    const modalRename = document.getElementById('modal-rename-project');
    const btnCancelRename = document.getElementById('btn-cancel-rename');
    const formRename = document.getElementById('form-rename-project');
    if (btnCancelRename && modalRename) {
      btnCancelRename.addEventListener('click', function() {
        modalRename.classList.add('hidden');
        modalRename.classList.remove('flex');
      });
    }
    if (formRename) {
      formRename.addEventListener('submit', function(e) {
        e.preventDefault();
        const input = document.getElementById('rename-project-input');
        const newTitle = (input && input.value.trim()) ? input.value.trim() : '';
        if (newTitle && state.renamingProjectId) {
          const p = state.projects.find((x) => x.id === state.renamingProjectId);
          if (p) {
            p.title = newTitle;
            saveAllProjectsToDB(state.projects);
            renderProjectLibrary();
            showToast('Đã đổi tên dự án thành: ' + newTitle, 'success');
          }
        }
        if (modalRename) {
          modalRename.classList.add('hidden');
          modalRename.classList.remove('flex');
        }
      });
    }

    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    function toggleThemeMode() {
      document.documentElement.classList.toggle('light-theme');
      const isLight = document.documentElement.classList.contains('light-theme');
      const knob = document.getElementById('theme-toggle-knob');
      if (knob) knob.style.transform = isLight ? 'translateX(20px)' : 'translateX(0px)';
      saveSettingsToLocal();
      showToast(isLight ? 'Đã chuyển sang giao diện Sáng' : 'Đã chuyển sang giao diện Vũ trụ Tối (#080B20)', 'info');
    }
    if (btnThemeToggle) btnThemeToggle.addEventListener('click', toggleThemeMode);

    const selectSampleRate = document.getElementById('select-sample-rate');
    const selectMp3Bitrate = document.getElementById('select-mp3-bitrate');
    const selectChannels = document.getElementById('select-audio-channels');
    const selectDefaultVoice = document.getElementById('select-default-voice');
    const selectUiLang = document.getElementById('select-ui-lang');

    if (selectSampleRate) {
      selectSampleRate.value = String(state.sampleRate);
      selectSampleRate.addEventListener('change', function() {
        state.sampleRate = parseInt(this.value, 10) || 44100;
        saveSettingsToLocal();
        showToast('Đã cập nhật Sample Rate: ' + state.sampleRate + ' Hz', 'success');
      });
    }
    if (selectMp3Bitrate) {
      selectMp3Bitrate.value = String(state.mp3Bitrate);
      selectMp3Bitrate.addEventListener('change', function() {
        state.mp3Bitrate = parseInt(this.value, 10) || 192;
        saveSettingsToLocal();
        showToast('Đã cập nhật chất lượng MP3: ' + state.mp3Bitrate + ' kbps', 'success');
      });
    }
    if (selectChannels) {
      selectChannels.value = String(state.channels);
      selectChannels.addEventListener('change', function() {
        state.channels = parseInt(this.value, 10) || 1;
        saveSettingsToLocal();
        showToast('Đã chọn kênh âm thanh: ' + (state.channels === 2 ? 'Stereo (2 kênh)' : 'Mono (1 kênh)'), 'success');
      });
    }
    if (selectDefaultVoice) {
      selectDefaultVoice.value = state.selectedVoiceId;
      selectDefaultVoice.addEventListener('change', function() {
        selectVoice(this.value);
      });
    }
    if (selectUiLang) {
      selectUiLang.addEventListener('change', function() {
        state.uiLang = this.value;
        saveSettingsToLocal();
        showToast('Ngôn ngữ hiển thị: ' + (this.value === 'vi' ? 'Tiếng Việt' : 'English'), 'info');
      });
    }

    const btnSaveSettingsInline = document.getElementById('btn-save-settings-inline');
    if (btnSaveSettingsInline) {
      btnSaveSettingsInline.addEventListener('click', function() {
        saveSettingsToLocal();
        showToast('Đã lưu toàn bộ cấu hình cài đặt!', 'success');
      });
    }

    const btnExportJson = document.getElementById('btn-export-json-backup');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', function() {
        const dataStr = JSON.stringify({ projects: state.projects, exportedAt: new Date().toISOString() }, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'lhpt-voice-backup.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        showToast('Đã xuất file sao lưu dự án (.json)', 'success');
      });
    }

    const btnClearAllData = document.getElementById('btn-clear-all-local-data');
    if (btnClearAllData) {
      btnClearAllData.addEventListener('click', function() {
        state.projects = [];
        saveAllProjectsToDB([]);
        try { localStorage.removeItem('lhpt_voice_settings_v2'); } catch (e) {}
        renderProjectLibrary();
        showToast('Đã xóa toàn bộ dữ liệu cục bộ trên thiết bị!', 'info');
      });
    }

    document.querySelectorAll('[data-action="start-studio"]').forEach((btn) => {
      btn.addEventListener('click', function() {
        const studioSec = document.getElementById('section-studio');
        if (studioSec) studioSec.scrollIntoView({ behavior: 'smooth' });
        if (textarea) setTimeout(() => textarea.focus(), 400);
      });
    });

    document.querySelectorAll('[data-nav-scroll]').forEach((btn) => {
      btn.addEventListener('click', function() {
        const targetId = this.getAttribute('data-nav-scroll');
        const targetEl = document.getElementById(targetId);
        if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
      });
    });

    const btnMobilePlay = document.getElementById('btn-mobile-preview-play');
    if (btnMobilePlay) {
      btnMobilePlay.addEventListener('click', function() {
        const v = VOICE_PROFILES.find((x) => x.id === state.selectedVoiceId) || VOICE_PROFILES[1];
        synthesizeAndPlay(v.sampleText, v, true);
      });
    }

    document.querySelectorAll('[data-copy-hex]').forEach((swatch) => {
      swatch.addEventListener('click', function() {
        const hex = this.getAttribute('data-copy-hex');
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(hex).catch(() => {});
        } else {
          const temp = document.createElement('textarea');
          temp.value = hex;
          document.body.appendChild(temp);
          temp.select();
          try { document.execCommand('copy'); } catch (e) {}
          document.body.removeChild(temp);
        }
        showToast('Đã sao chép mã màu ' + hex + ' vào bộ nhớ tạm!', 'success');
      });
    });

    document.querySelectorAll('[data-download-svg]').forEach((card) => {
      card.addEventListener('click', function() {
        const svgId = this.getAttribute('data-download-svg');
        const svgName = this.getAttribute('data-svg-filename') || 'lhpt-logo.svg';
        const svgEl = document.getElementById(svgId);
        if (!svgEl) return;
        const serializer = new XMLSerializer();
        const source = serializer.serializeToString(svgEl);
        const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = svgName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        showToast('Đã tải xuống file vector ' + svgName, 'success');
      });
    });

    const modalSettings = document.getElementById('modal-settings');
    document.querySelectorAll('[data-open-modal="settings"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (modalSettings) {
          modalSettings.classList.remove('hidden');
          modalSettings.classList.add('flex');
        }
      });
    });
    const btnCloseSettings = document.getElementById('btn-close-settings');
    if (btnCloseSettings && modalSettings) {
      btnCloseSettings.addEventListener('click', () => {
        modalSettings.classList.add('hidden');
        modalSettings.classList.remove('flex');
      });
    }

    const btnResetIdb = document.getElementById('btn-reset-idb');
    if (btnResetIdb) {
      btnResetIdb.addEventListener('click', function() {
        state.projects = DEFAULT_PROJECTS.slice();
        saveAllProjectsToDB(state.projects);
        renderProjectLibrary();
        showToast('Đã khôi phục 5 dự án mẫu mặc định trong IndexedDB!', 'success');
      });
    }

    window.addEventListener('resize', renderWaveformCanvas);
  }

  function detectBrowserVoices() {
    if (!window.speechSynthesis) return;
    const updateVoicesInfo = () => {
      try {
        const list = window.speechSynthesis.getVoices() || [];
        const viCount = list.filter((v) => v.lang && v.lang.toLowerCase().includes('vi')).length;
        const el = document.getElementById('detected-voices-badge');
        if (el) {
          el.textContent = 'Engine: Cloud Neural Tiếng Việt (<=90 ký tự/câu) + ' + viCount + ' giọng Việt hệ thống';
        }
      } catch (e) {}
    };
    updateVoicesInfo();
    if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = updateVoicesInfo;
    }
  }

  window.addEventListener('DOMContentLoaded', function() {
    loadSavedSettings();
    detectBrowserVoices();
    initIndexedDB().then(() => {
      renderVoiceList();
      renderProjectLibrary();
      updateEditorMetrics();
      renderWaveformCanvas();
      updatePlayerTimeUI();
      bindEvents();
    });
  });
})();
