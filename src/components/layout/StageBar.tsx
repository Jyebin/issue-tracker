'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const STEPS = [
  { label: '기획 입력',   href: '/upload' },
  { label: '누락 보완',   href: '/form' },
  { label: 'TC 생성',     href: '/tc-list' },
  { label: '테스트 코드', href: '/code-viewer' },
  { label: '수행 · 증적', href: '/tc-detail' },
  { label: '이슈 등록',   href: '/issue-detail' },
]

const WORKFLOW_PATHS = new Set(STEPS.map((s) => s.href))

export default function StageBar() {
  const pathname = usePathname()
  if (!WORKFLOW_PATHS.has(pathname)) return null

  const currentIdx = STEPS.findIndex((s) => s.href === pathname)

  return (
    <div className="stagebar">
      {STEPS.map((step, i) => {
        const isActive    = i === currentIdx
        const isCompleted = i < currentIdx
        return (
          <Link
            key={step.href}
            href={step.href}
            className={`stab${isActive ? ' active' : ''}${isCompleted ? ' completed' : ''}`}
          >
            <span className="num">{isCompleted ? '✓' : i + 1}</span>
            {step.label}
          </Link>
        )
      })}
    </div>
  )
}
