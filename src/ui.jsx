import {
  Image, Film, Music, FileText, Sheet, Presentation, Archive, AppWindow, Code, PenTool, Type, File, Folder,
  Boxes, BookOpen, Box, ShieldCheck, Cpu, Database, Mail, HardDrive, Magnet, Link2, Copy, Lock,
} from 'lucide-react'

export const api = window.ordena

export const META = {
  'Proyectos': { icon: Boxes, color: '#4f6bed' },
  'Imágenes': { icon: Image, color: '#e7795b' },
  'Vídeos': { icon: Film, color: '#d9578a' },
  'Audio': { icon: Music, color: '#a46be0' },
  'Documentos': { icon: FileText, color: '#5b8def' },
  'Libros': { icon: BookOpen, color: '#c0773f' },
  'Hojas de cálculo': { icon: Sheet, color: '#3fae7a' },
  'Presentaciones': { icon: Presentation, color: '#e0a93b' },
  'Comprimidos': { icon: Archive, color: '#8a8f98' },
  'Programas': { icon: AppWindow, color: '#4bb3c8' },
  'Código': { icon: Code, color: '#7c86f2' },
  'Diseño': { icon: PenTool, color: '#e86b6b' },
  '3D': { icon: Box, color: '#5fa8a0' },
  'Fuentes': { icon: Type, color: '#b59a6a' },
  'Certificados': { icon: ShieldCheck, color: '#2f9e6b' },
  'Modelos IA': { icon: Cpu, color: '#9b6bf2' },
  'Bases de datos': { icon: Database, color: '#3f8fbf' },
  'Correo': { icon: Mail, color: '#e06a4f' },
  'Máquinas virtuales': { icon: HardDrive, color: '#6f7a8a' },
  'Torrents': { icon: Magnet, color: '#d64f7a' },
  'Accesos directos': { icon: Link2, color: '#8a8f98' },
  'Otros': { icon: File, color: '#9a9aa3' },
  'Carpetas': { icon: Folder, color: '#c9a54a' },
  'Duplicados': { icon: Copy, color: '#b46a6a' },
  'Privado': { icon: Lock, color: '#8b5cf6' },
}
const PALETTE = ['#e7795b', '#5b8def', '#3fae7a', '#a46be0', '#e0a93b', '#4bb3c8', '#d9578a', '#7c86f2']
export function meta(cat) {
  if (META[cat]) return META[cat]
  let h = 0
  for (const ch of cat || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return { icon: Folder, color: PALETTE[h % PALETTE.length] }
}

export function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`switch ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track"><span className="thumb" /></span>
      <span className="switch-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </label>
  )
}

export function CatIcon({ cat, size = 16 }) {
  const { icon: Icon, color } = meta(cat)
  return <span className="cat-icon" style={{ color, background: color + '1f' }}><Icon size={size} /></span>
}

export function bytes(n) {
  if (n == null) return ''
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n < 10 && i ? n.toFixed(1) : Math.round(n)} ${u[i]}`
}

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
export function ago(iso) {
  const s = (new Date(iso) - Date.now()) / 1000
  const a = Math.abs(s)
  if (a < 60) return 'ahora mismo'
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  if (a < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day')
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}
