import { useEffect, useState } from 'react'

/** useState backed by sessionStorage, so state survives in-app navigation (unmount/remount)
 * and only resets when the tab/browser is closed — unlike plain component state, which is
 * lost the moment React Router unmounts the page. */
export function useSessionState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state))
    } catch {
      // storage full or unavailable (e.g. private browsing) — state just won't persist
    }
  }, [key, state])

  return [state, setState] as const
}
