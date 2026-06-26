'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SCREEN_NAMES: Record<string, string> = {
  '/dashboard': '대시보드',
  '/upload': '기획서 업로드',
  '/form': '누락 항목 보완',
  '/tc-list': 'TC 목록',
  '/tc-detail': 'TC 상세',
  '/code-viewer': '테스트 코드',
  '/board': '이슈 보드',
  '/issue-detail': '이슈 상세',
  '/spec-manager': '기능명세서 관리',
}

export default function Topbar() {
  const pathname = usePathname()
  const current = SCREEN_NAMES[pathname] ?? '대시보드'

  return (
    <div className="topbar">
      <div className="breadcrumb">
        <span>TestFlow</span>
        <span>›</span>
        <span className="current">{current}</span>
      </div>
      <div className="topbar-actions">
        <button className="btn btn-secondary btn-sm">🔔</button>
        <Link href="/upload" className="btn btn-primary btn-sm">+ 새 기획서</Link>
      </div>
    </div>
  )
}
