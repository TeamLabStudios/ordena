// Categorías por defecto. La clave es el nombre de la subcarpeta.
// El usuario puede editarlas desde Ajustes (se guardan en config.json).
const DEFAULT_CATEGORIES = {
  'Imágenes': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'heic', 'heif', 'avif', 'jfif', 'raw', 'cr2', 'cr3', 'nef', 'arw', 'dng', 'orf', 'rw2'],
  'Vídeos': ['mp4', 'mkv', 'mov', 'avi', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'mts', 'm2ts', 'vob', 'srt', 'ass', 'ssa', 'vtt', 'sub'],
  'Audio': ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'aiff', 'aif', 'mid', 'midi', 'amr'],
  'Documentos': ['pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages', 'tex', 'xps', 'oxps', 'wpd'],
  'Libros': ['epub', 'mobi', 'azw', 'azw3', 'fb2', 'djvu', 'cbz', 'cbr', 'cb7'],
  'Hojas de cálculo': ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'csv', 'tsv', 'numbers'],
  'Presentaciones': ['ppt', 'pptx', 'pps', 'ppsx', 'odp'],
  'Comprimidos': ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'zst', 'cab', 'lz', 'lzma'],
  'Programas': ['exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'bat', 'cmd', 'ps1', 'vbs', 'reg', 'apk', 'xapk', 'aab', 'jar', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'],
  'Código': ['js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'java', 'kt', 'c', 'cpp', 'h', 'hpp', 'cs', 'vb', 'php', 'rb', 'swift', 'dart', 'lua', 'r', 'html', 'htm', 'css', 'scss', 'json', 'xml', 'yml', 'yaml', 'toml', 'ini', 'sql', 'sh', 'ipynb', 'vue', 'svelte'],
  'Diseño': ['psd', 'ai', 'xd', 'fig', 'sketch', 'indd', 'eps', 'afdesign', 'afphoto', 'afpub', 'cdr', 'xcf', 'kra', 'procreate'],
  '3D': ['stl', '3mf', 'gcode', 'obj', 'fbx', 'blend', 'gltf', 'glb', 'step', 'stp', 'dae', 'ply', 'skp', 'f3d', 'dwg', 'dxf'],
  'Fuentes': ['ttf', 'otf', 'woff', 'woff2', 'fon'],
  'Certificados': ['p12', 'pfx', 'cer', 'crt', 'pem', 'der', 'key', 'csr', 'p7b', 'p7s', 'p7m', 'xsig', 'csig', 'sig', 'asc', 'gpg'],
  'Modelos IA': ['gguf', 'ggml', 'safetensors', 'ckpt', 'onnx', 'pt', 'pth', 'tflite', 'mlmodel', 'h5', 'pb'],
  'Bases de datos': ['db', 'sqlite', 'sqlite3', 'db3', 'mdb', 'accdb', 'dbf', 'frm', 'ibd', 'dump'],
  'Correo': ['eml', 'msg', 'vcf', 'ics', 'mbox', 'pst', 'ost'],
  'Máquinas virtuales': ['vhd', 'vhdx', 'vmdk', 'ova', 'ovf', 'qcow2', 'vdi', 'iso', 'img'],
  'Torrents': ['torrent'],
  'Accesos directos': ['lnk', 'url', 'webloc', 'desktop'],
}

// Extensiones y nombres que nunca se tocan (descargas a medias, archivos de sistema…)
const DEFAULT_IGNORED = ['crdownload', 'part', 'partial', 'tmp', 'temp', 'download', 'opdownload', '!ut', 'aria2', 'lock']
const IGNORED_NAMES = new Set(['desktop.ini', 'thumbs.db', '.ds_store'])

const OTHER = 'Otros'
const FOLDERS = 'Carpetas'
const PROJECTS = 'Proyectos'
const DUPLICATES = 'Duplicados'
const PRIVATE = 'Privado'

const extOf = (name) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

function buildIndex(categories) {
  const idx = {}
  for (const [cat, exts] of Object.entries(categories)) for (const e of exts) idx[e.toLowerCase().replace(/^\./, '')] = cat
  return idx
}

function isIgnored(name, ignored) {
  const lower = name.toLowerCase()
  if (IGNORED_NAMES.has(lower) || lower.startsWith('~$') || lower.startsWith('.~lock')) return true
  return ignored.includes(extOf(name))
}

module.exports = { DEFAULT_CATEGORIES, DEFAULT_IGNORED, OTHER, FOLDERS, PROJECTS, DUPLICATES, PRIVATE, extOf, buildIndex, isIgnored }
