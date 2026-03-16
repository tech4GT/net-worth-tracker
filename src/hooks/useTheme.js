import { useEffect } from 'react'
import useStore from '../store/store'

export default function useTheme() {
  const theme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  useEffect(() => {
    const root = document.documentElement

    function applyTheme(mode) {
      if (mode === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
    }

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches ? 'dark' : 'light')
      const handler = (e) => applyTheme(e.matches ? 'dark' : 'light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }

    applyTheme(theme)
  }, [theme])

  return { theme, setTheme }
}
