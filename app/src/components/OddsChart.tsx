import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import type { TrajPoint } from '../lib/domain'

export default function OddsChart({ data }: { data: TrajPoint[] }) {
  const rows = data.map((p) => ({
    time: new Date(p.t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    Home: +p.home.toFixed(1), Draw: +p.draw.toFixed(1), Away: +p.away.toFixed(1),
  }))
  if (!rows.length) return <div className="h-72 grid place-items-center text-slate-400 text-sm">No pre-match odds trajectory.</div>
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="oc-home" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E3A5F" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#1E3A5F" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef2f6" vertical={false} />
          <XAxis dataKey="time" tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#e2e8f0" minTickGap={28} />
          <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} stroke="#e2e8f0" unit="%" domain={['auto', 'auto']} />
          <Tooltip
            cursor={{ stroke: '#FF6B35', strokeWidth: 1, strokeDasharray: '4 4' }}
            contentStyle={{ background: '#ffffff', border: 'none', borderRadius: 12, fontSize: 12, boxShadow: '0 24px 44px -18px rgba(30,58,95,0.28)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
          <Area type="monotone" dataKey="Home" stroke="#1E3A5F" strokeWidth={3} fill="url(#oc-home)"
            dot={false} activeDot={{ r: 5, fill: '#1E3A5F', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive animationDuration={1400} animationEasing="ease-out" />
          <Line type="monotone" dataKey="Draw" stroke="#94a3b8" strokeWidth={1.5} dot={false}
            activeDot={{ r: 4, fill: '#94a3b8', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive animationDuration={1400} animationEasing="ease-out" />
          <Line type="monotone" dataKey="Away" stroke="#FF6B35" strokeWidth={2.5} dot={false}
            activeDot={{ r: 5, fill: '#FF6B35', stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive animationDuration={1400} animationEasing="ease-out" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
