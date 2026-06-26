'use client'

import { useState } from 'react'
import ApproveAllModal from '@/components/modals/ApproveAllModal'

export default function TCListPage() {
  const [bulkOpen, setBulkOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <>
      <div className="page-header">
        <div className="page-title">🧪 TC 목록</div>
        <div className="page-subtitle">AI가 생성한 테스트 케이스 목록입니다</div>
      </div>

      <div className="alert alert-info">💡 배경색으로 실행 유형을 구분합니다.</div>

      <div className="legend">
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--tc-auto-bg)', border: '1px solid var(--tc-auto-border)' }} /> 🤖 자동 실행 (Playwright)</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--tc-manual-bg)', border: '1px solid var(--tc-manual-border)' }} /> 👤 수동 실행</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--tc-mixed-bg)', border: '1px solid var(--tc-mixed-border)' }} /> 🔀 혼합</div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input className="form-input" placeholder="🔍 TC 검색..." style={{ width: '200px', fontSize: '11px' }} />
          <select className="form-select" style={{ width: 'auto', fontSize: '11px' }}>
            <option>전체 유형</option><option>🤖 자동</option><option>👤 수동</option><option>🔀 혼합</option>
          </select>
          <select className="form-select" style={{ width: 'auto', fontSize: '11px' }}>
            <option>전체 우선순위</option><option>🔴 Critical</option><option>🟠 High</option><option>🟡 Medium</option>
          </select>
          <select className="form-select" style={{ width: 'auto', fontSize: '11px' }}>
            <option>전체 모듈</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '7px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setBulkOpen(true)}>전체선택</button>
            <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>전체 이슈 등록</button>
          </div>
        </div>

        {/* Bulk bar */}
        {bulkOpen && (
          <div className="bulk-bar">
            <input type="checkbox" defaultChecked />
            <span>0개 선택됨</span>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModalOpen(true)}>
              선택 이슈 등록
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setBulkOpen(false)}>취소</button>
          </div>
        )}

        {/* Table */}
        <table className="tc-table">
          <thead>
            <tr>
              <th><input type="checkbox" /></th>
              <th>ID</th><th>제목</th><th>모듈</th><th>유형</th><th>우선순위</th><th>상태</th><th>액션</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={8}>
                <div className="empty-state">
                  <div className="empty-state-icon">🧪</div>
                  <div className="empty-state-text">TC 없음</div>
                  <div className="empty-state-sub">기획서를 분석하면 TC가 자동 생성됩니다</div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ApproveAllModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
