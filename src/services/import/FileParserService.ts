export async function parseImportedFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.srt')) {
    const raw = await file.text();
    if (name.endsWith('.srt')) {
      return raw
        .replace(/^\d+\s*$/gm, '')
        .replace(/\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}/g, '')
        .replace(/\n{2,}/g, '\n')
        .trim();
    }
    return raw.trim();
  }

  if (name.endsWith('.docx')) {
    return extractTextFromDocxBuffer(await file.arrayBuffer());
  }

  throw new Error('Định dạng file chưa được hỗ trợ. Vui lòng chọn file .txt, .docx, .md hoặc .srt.');
}

async function extractTextFromDocxBuffer(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
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
  throw new Error('Không thể giải nén nội dung văn bản từ file DOCX này.');
}
