type GaugeLevel = 'danger' | 'warning' | 'success'

interface RiskGaugeProps {
  score: number
  level: GaugeLevel
  size?: number
  strokeWidth?: number
}

const levelStrokeColor: Record<GaugeLevel, string> = {
  danger: '#E5484D',
  warning: '#E8912A',
  success: '#12A150',
}

export default function RiskGauge({ score, level, size = 140, strokeWidth = 12 }: RiskGaugeProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  const offset = circumference * (1 - clamped / 100)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#F1EFEB" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={levelStrokeColor[level]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold text-primary">{clamped}점</span>
      </div>
    </div>
  )
}
