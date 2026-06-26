'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV = [
  {
    section: '자동 실행',
    mode: 'auto',
    items: [
      { href: '/dashboard', icon: '🚀', label: '파이프라인 실행' },
    ],
  },
  {
    section: '수동 워크플로우',
    mode: 'manual',
    items: [
      { href: '/upload',      icon: '📁', label: '기획서 업로드' },
      { href: '/form',        icon: '📋', label: '누락 항목 보완' },
      { href: '/tc-list',     icon: '🧪', label: 'TC 목록' },
      { href: '/code-viewer', icon: '💻', label: '테스트 코드' },
      { href: '/tc-detail',  icon: '▶️', label: '테스트 수행' },
      { href: '/issue-detail', icon: '🔍', label: '이슈 상세' },
    ],
  },
  {
    section: '이슈 관리',
    mode: 'manual',
    items: [
      { href: '/board', icon: '📌', label: '이슈 보드', badgeKey: 'issues' },
    ],
  },
  {
    section: '기획 관리',
    mode: 'manual',
    items: [
      { href: '/spec-manager', icon: '📑', label: '기능명세서 관리' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [pendingIssues, setPendingIssues] = useState(0)

  useEffect(() => {
    fetch('/api/issues/count')
      .then(r => r.json())
      .then(data => setPendingIssues(data.count ?? 0))
      .catch(() => setPendingIssues(0))
  }, [])

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <h1>⚡ TestFlow <span className="logo-badge">Beta</span></h1>
      </div>

      {NAV.map((section) => (
        <div className="sidebar-section" key={section.section}>
          <div className={`sidebar-section-label${section.mode === 'auto' ? ' sidebar-section-auto' : ''}`}>
            {section.mode === 'auto' ? '⚡ ' : ''}{section.section}
          </div>
          {section.items.map((item) => {
            const isActive = pathname === item.href
            const isAutoItem = section.mode === 'auto'
            const badge = 'badgeKey' in item && item.badgeKey === 'issues' && pendingIssues > 0
              ? pendingIssues
              : null
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item${isAutoItem ? ' auto-entry' : ''}${isActive ? ' active' : ''}`}
              >
                <span className="icon">{item.icon}</span>
                {item.label}
                {badge !== null && (
                  <span className="sidebar-badge">{badge}</span>
                )}
              </Link>
            )
          })}
        </div>
      ))}

      <div style={{ margin: '8px 12px' }}>
        <div style={{ borderTop: '1px solid var(--gray-700)', padding: '10px 4px 6px', fontSize: '10px', color: 'var(--gray-600)' }}>
          💡 <strong style={{ color: 'var(--gray-500)' }}>자동 실행</strong>은 원클릭으로 전체 파이프라인을,<br />
          <strong style={{ color: 'var(--gray-500)' }}>수동 워크플로우</strong>는 단계별 직접 작업을 합니다.
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="user-profile">
          <div className="avatar">김Q</div>
          <div>
            <div className="user-name">김테스트</div>
            <div className="user-role">QA Engineer</div>
          </div>
        </div>
      </div>
    </nav>
  )
}
