import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Reset scroll to the top on every route change (SPA nav keeps scroll otherwise). */
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
