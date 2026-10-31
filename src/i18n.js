import { useSyncExternalStore } from 'react'
import en from './en.js'

let idioma = 'es'
try { if (localStorage.getItem('idioma') === 'en') idioma = 'en' } catch { /* sin almacenamiento: español */ }

const oyentes = new Set()
const suscribir = (f) => { oyentes.add(f); return () => oyentes.delete(f) }

export const idiomaActual = () => idioma

export function cambiarIdioma(nuevo) {
  idioma = nuevo
  document.documentElement.lang = nuevo
  try { localStorage.setItem('idioma', nuevo) } catch { /* el idioma dura hasta recargar */ }
  oyentes.forEach((f) => f())
}

// Solo App lo usa: al cambiar de idioma App se vuelve a pintar y con él toda la app
export const useIdioma = () => useSyncExternalStore(suscribir, idiomaActual)

// El texto en español es la clave; sin traducción se muestra el español. {nombre} se reemplaza con vars.nombre
export function t(texto, vars) {
  const s = (idioma === 'en' && en[texto]) || texto
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k]) : s
}
