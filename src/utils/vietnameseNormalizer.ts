const DIGITS_VI = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

const ABBREVIATIONS_VI: Record<string, string> = {
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
  'WAV': 'định dạng âm thanh uây',
  'MP3': 'em pi ba',
  'TW': 'Trung ương',
  'UBND': 'Ủy ban nhân dân',
  'HĐND': 'Hội đồng nhân dân',
  'BGDĐT': 'Bộ Giáo dục và Đào tạo',
  'CLB': 'Câu lạc bộ'
};

export function readThreeDigitsVi(num: number, showZeroHundred: boolean): string {
  const tram = Math.floor(num / 100);
  const chuc = Math.floor((num % 100) / 10);
  const donvi = num % 10;
  const parts: string[] = [];

  if (tram > 0 || showZeroHundred) {
    parts.push(DIGITS_VI[tram] + ' trăm');
  }
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

export function numberToVietnameseWords(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'không';
  if (n < 0) return 'âm ' + numberToVietnameseWords(Math.abs(n));

  let remaining = Math.floor(n);
  const units = ['', 'nghìn', 'triệu', 'tỷ'];
  const groups: number[] = [];

  while (remaining > 0) {
    groups.push(remaining % 1000);
    remaining = Math.floor(remaining / 1000);
  }

  const out: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i];
    if (g > 0) {
      const showZero = i < groups.length - 1;
      const text = readThreeDigitsVi(g, showZero);
      const unitName = units[i % 4];
      out.push(unitName ? `${text} ${unitName}` : text);
    }
  }
  return out.join(' ').trim();
}

export function normalizeVietnameseText(
  rawText: string,
  readNumbers: boolean,
  readAbbreviations: boolean
): string {
  let result = rawText || '';

  if (readAbbreviations) {
    Object.keys(ABBREVIATIONS_VI).forEach((abbr) => {
      const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      result = result.replace(regex, ABBREVIATIONS_VI[abbr]);
    });
  }

  if (readNumbers) {
    result = result.replace(/(\d+)%/g, (_, d) => `${numberToVietnameseWords(parseInt(d, 10))} phần trăm`);
    result = result.replace(/\b(\d{1,9})\b/g, (_, d) => numberToVietnameseWords(parseInt(d, 10)));
  }

  return result.replace(/\s+/g, ' ').trim();
}

export function splitTextIntoSafeChunks(text: string, maxChunkLength = 220): string[] {
  const cleaned = (text || '').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkLength) return [cleaned];

  const sentences = cleaned.split(/(?<=[.!?।;\n])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length <= maxChunkLength) {
      current = (current + ' ' + sentence).trim();
    } else {
      if (current) chunks.push(current);
      if (sentence.length <= maxChunkLength) {
        current = sentence;
      } else {
        const words = sentence.split(/\s+/);
        let sub = '';
        for (const w of words) {
          if ((sub + ' ' + w).trim().length <= maxChunkLength) {
            sub = (sub + ' ' + w).trim();
          } else {
            if (sub) chunks.push(sub);
            sub = w;
          }
        }
        current = sub;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
