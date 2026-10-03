// Reconoce el tipo real de un archivo leyendo sus primeros bytes ("firma").
// Se usa cuando el archivo no tiene extensión o la extensión es desconocida.
const fsp = require('fs').promises

const starts = (b, sig, off = 0) => sig.every((v, i) => b[off + i] === v)
const ascii = (b, s, off = 0) => b.slice(off, off + s.length).toString('latin1') === s

async function sniff(file) {
  let fh
  try {
    fh = await fsp.open(file, 'r')
    const b = Buffer.alloc(64)
    const { bytesRead } = await fh.read(b, 0, 64, 0)
    if (bytesRead < 4) return null
    if (starts(b, [0xff, 0xd8, 0xff])) return { ext: 'jpg' }
    if (starts(b, [0x89, 0x50, 0x4e, 0x47])) return { ext: 'png' }
    if (ascii(b, 'GIF8')) return { ext: 'gif' }
    if (ascii(b, 'RIFF') && ascii(b, 'WEBP', 8)) return { ext: 'webp' }
    if (ascii(b, 'RIFF') && ascii(b, 'WAVE', 8)) return { ext: 'wav' }
    if (ascii(b, 'RIFF') && ascii(b, 'AVI ', 8)) return { ext: 'avi' }
    if (ascii(b, 'ftyp', 4)) {
      const brand = b.slice(8, 12).toString('latin1')
      if (/heic|heix|mif1|msf1/.test(brand)) return { ext: 'heic' }
      if (/avif/.test(brand)) return { ext: 'avif' }
      if (/M4A /.test(brand)) return { ext: 'm4a' }
      if (/qt  /.test(brand)) return { ext: 'mov' }
      return { ext: 'mp4' }
    }
    if (starts(b, [0x1a, 0x45, 0xdf, 0xa3])) return { ext: 'mkv' }
    if (ascii(b, 'ID3') || starts(b, [0xff, 0xfb]) || starts(b, [0xff, 0xf3])) return { ext: 'mp3' }
    if (ascii(b, 'fLaC')) return { ext: 'flac' }
    if (ascii(b, 'OggS')) return { ext: 'ogg' }
    if (ascii(b, '%PDF')) return { ext: 'pdf' }
    if (ascii(b, 'PK\x03\x04')) {
      // ZIP: puede ser un Office/EPUB/APK. Miramos el nombre del primer archivo interno.
      const inner = b.slice(30, 64).toString('latin1')
      if (inner.startsWith('mimetypeapplication/epub')) return { ext: 'epub' }
      if (inner.startsWith('[Content_Types].xml') || inner.startsWith('word/')) return { ext: 'docx' }
      if (inner.startsWith('xl/')) return { ext: 'xlsx' }
      if (inner.startsWith('ppt/')) return { ext: 'pptx' }
      if (inner.startsWith('AndroidManifest') || inner.startsWith('classes.dex')) return { ext: 'apk' }
      if (inner.startsWith('META-INF/')) return { ext: 'jar' }
      return { ext: 'zip' }
    }
    if (ascii(b, 'Rar!')) return { ext: 'rar' }
    if (starts(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return { ext: '7z' }
    if (starts(b, [0x1f, 0x8b])) return { ext: 'gz' }
    if (ascii(b, 'MZ')) return { ext: 'exe' }
    if (ascii(b, 'SQLite format 3')) return { ext: 'sqlite' }
    if (ascii(b, 'GGUF')) return { ext: 'gguf' }
    if (starts(b, [0xd0, 0xcf, 0x11, 0xe0])) return { ext: 'doc' } // Office antiguo (doc/xls/ppt/msg)
    if (ascii(b, '{\\rtf')) return { ext: 'rtf' }
    if (ascii(b, 'BEGIN:VCARD')) return { ext: 'vcf' }
    if (ascii(b, 'BEGIN:VCALENDAR')) return { ext: 'ics' }
    if (ascii(b, 'd8:announce')) return { ext: 'torrent' }
    if (ascii(b, 'wOFF')) return { ext: 'woff' }
    if (ascii(b, 'wOF2')) return { ext: 'woff2' }
    if (ascii(b, '8BPS')) return { ext: 'psd' }
    if (ascii(b, '-----BEGIN')) return { ext: 'pem' }
    if (ascii(b, 'BM') && bytesRead > 14 && starts(b, [0, 0, 0, 0], 6)) return { ext: 'bmp' }
    return null
  } catch {
    return null
  } finally {
    await fh?.close().catch(() => {})
  }
}

module.exports = { sniff }
