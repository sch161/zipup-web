import { Link } from 'react-router-dom'

interface PlaceholderProps {
  title: string
  emoji: string
  description: string
}

export default function Placeholder({ title, emoji, description }: PlaceholderProps) {
  return (
    <div className="flex flex-col items-center px-6 pt-24 text-center">
      <div className="mb-4 text-4xl">{emoji}</div>
      <h1 className="text-lg font-bold text-primary">{title}</h1>
      <p className="mt-2 text-sm text-text-gray">{description}</p>
      <Link to="/home" className="mt-6 text-sm font-bold text-primary">
        홈으로 돌아가기
      </Link>
    </div>
  )
}
