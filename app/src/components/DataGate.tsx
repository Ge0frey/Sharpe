import { Link } from 'react-router-dom'
import { useAuth } from '../state/auth'
import { Card, Button } from './ui'
import Icon from './Icon'

/**
 * Every TxLINE call needs the wallet's own JWT + api token. Nothing is shipped
 * with the app, so a fresh visitor has no credentials until they onboard. Render
 * this instead of a wall of failed queries.
 */
export default function DataGate({ children }: { children: React.ReactNode }) {
  const { ready } = useAuth()
  if (ready) return <>{children}</>
  return (
    <Card className="p-12 text-center max-w-lg mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-[#FF6B35]/10 mx-auto flex items-center justify-center mb-4">
        <Icon icon="lucide:key-round" className="text-[#FF6B35] text-2xl" />
      </div>
      <h2 className="text-xl font-display font-extrabold text-ink">Data access needed</h2>
      <p className="text-sm text-slate-500 mt-2 leading-relaxed">
        Sharpe ships with no credentials. Provision TxLINE's free World Cup tier to your
        own wallet — it takes one click, costs nothing, and stays in your browser.
      </p>
      <Link to="/onboard" className="inline-block mt-5"><Button>Get data access →</Button></Link>
    </Card>
  )
}
