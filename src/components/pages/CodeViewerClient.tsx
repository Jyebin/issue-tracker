'use client'

import { useState } from 'react'

export default function CodeViewerClient() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">💻 테스트 코드</div>
        <div className="page-subtitle">AI가 생성한 Playwright 자동화 코드입니다</div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* File list */}
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)' }}>
              생성된 파일 목록
            </div>
            <div className="empty-state" style={{ padding: '32px 16px' }}>
              <div className="empty-state-icon">💻</div>
              <div className="empty-state-text">생성된 파일 없음</div>
              <div className="empty-state-sub">TC를 생성하면 코드 파일이 표시됩니다</div>
            </div>
          </div>
          <button className="btn btn-secondary" style={{ width: '100%' }}>📦 전체 코드 다운로드 (.zip)</button>
        </div>

        {/* Code block placeholder */}
        <div style={{ background: '#1E1E2E', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #313244' }}>
            <span style={{ color: '#CDD6F4', fontSize: '12px', fontFamily: 'monospace' }}>파일을 선택하세요</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button className="btn btn-sm" style={{ background: '#313244', color: '#CDD6F4', border: 'none' }} onClick={handleCopy}>
                {copied ? '✅ 복사됨' : '복사'}
              </button>
              <button className="btn btn-sm" style={{ background: '#313244', color: '#CDD6F4', border: 'none' }}>다운로드</button>
            </div>
          </div>
          <div className="code-block" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
            <div style={{ textAlign: 'center', color: '#585B70' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>💻</div>
              <div style={{ fontSize: '12px' }}>파일을 선택하면 코드가 표시됩니다</div>
            </div>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid #313244', background: '#181825' }}>
            <span style={{ fontSize: '10px', color: '#585B70' }}>⚠️ data-testid 없을 경우 선택자 수동 수정 필요</span>
          </div>
        </div>
      </div>
    </>
  )
}
