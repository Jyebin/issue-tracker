'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const SCREEN_NAMES: Record<string, string> = {
  '/dashboard':   '대시보드',
  '/upload':      '기획서 업로드',
  '/form':        '누락 항목 보완',
  '/tc-list':     'TC 목록',
  '/tc-detail':   '테스트 수행',
  '/code-viewer': '테스트 코드',
  '/board':       '이슈 보드',
  '/issue-detail':'이슈 상세',
  '/spec-manager':'기능명세서 관리',
}

export default function Topbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const current  = SCREEN_NAMES[pathname] ?? '대시보드'

  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting]     = useState(false)
  const [resetError, setResetError]   = useState('')

  async function handleReset() {
    const pid = localStorage.getItem('testflow_project_id')
    if (!pid) {
      setShowConfirm(false)
      router.push('/upload')
      return
    }
    setResetting(true)
    setResetError('')
    try {
      const res = await fetch(`/api/projects/${pid}/reset`, { method: 'DELETE' })
      if (!res.ok) throw new Error('초기화 실패')
      localStorage.removeItem('testflow_project_id')
      localStorage.removeItem('testflow_pipeline')
      setShowConfirm(false)
      router.push('/upload')
    } catch (e) {
      setResetError(String(e))
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div className="breadcrumb">
          <span>TestFlow</span>
          <span>›</span>
          <span className="current">{current}</span>
        </div>
        <div className="topbar-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setShowConfirm(true); setResetError('') }}
            title="워크플로우 초기화"
            style={{ color: '#EF4444', borderColor: '#FCA5A5' }}
          >
            🔄 초기화
          </button>
          <Link href="/upload" className="btn btn-primary btn-sm">+ 새 기획서</Link>
        </div>
      </div>

      {/* 확인 모달 */}
      {showConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'white', borderRadius: '12px', padding: '28px 24px',
            width: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ fontSize: '24px', textAlign: 'center', marginBottom: '10px' }}>⚠️</div>
            <div style={{ fontSize: '15px', fontWeight: 700, textAlign: 'center', marginBottom: '8px' }}>
              워크플로우 초기화
            </div>
            <div style={{ fontSize: '12px', color: '#6B7280', textAlign: 'center', lineHeight: 1.6, marginBottom: '20px' }}>
              현재 프로젝트의 모든 데이터가 삭제됩니다.<br />
              <strong style={{ color: '#374151' }}>누락 항목 · TC · 테스트 코드 · 이슈</strong><br />
              이 작업은 되돌릴 수 없습니다.
            </div>
            {resetError && (
              <div style={{ padding: '8px 10px', background: '#FEE2E2', borderRadius: '6px', fontSize: '11px', color: '#DC2626', marginBottom: '12px' }}>
                {resetError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowConfirm(false)}
                disabled={resetting}
              >
                취소
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: '#EF4444', color: 'white', border: 'none' }}
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? '초기화 중...' : '🔄 초기화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
