'use client'

import Link from 'next/link'

export default function IssueDetailPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Link href="/tc-list" className="btn btn-secondary btn-sm">← 뒤로</Link>
        <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>이슈 등록 상세</span>
      </div>

      <div className="auto-banner">✨ AI가 TC를 기반으로 자동 입력합니다. 내용을 검토 후 수정하세요.</div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left */}
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title">📝 기본 정보</div></div>

            <div className="form-group">
              <label className="form-label">제목 <span className="req">*</span></label>
              <input className="form-input" placeholder="이슈 제목을 입력하세요" />
            </div>

            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">이슈 타입 <span className="req">*</span></label>
                <select className="form-select">
                  <option>🧪 Test Case</option><option>🐛 Bug</option><option>📋 Task</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">우선순위 <span className="req">*</span></label>
                <select className="form-select">
                  <option>🔴 Critical</option><option>🟠 High</option><option>🟡 Medium</option><option>🟢 Low</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">모듈 <span className="req">*</span></label>
                <select className="form-select">
                  <option>모듈 선택</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">담당자</label>
                <select className="form-select">
                  <option>담당자 선택</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">설명</label>
              <textarea className="form-textarea" style={{ minHeight: '140px' }} placeholder="이슈 설명을 입력하세요" />
            </div>

            <div className="form-group">
              <label className="form-label">태그</label>
              <div>
                <button className="btn btn-secondary btn-sm">+ 추가</button>
              </div>
            </div>
          </div>
        </div>

        {/* Right */}
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title">🔗 연결 정보</div></div>
            <div className="empty-state">
              <div className="empty-state-icon">🔗</div>
              <div className="empty-state-text">연결된 TC 없음</div>
              <div className="empty-state-sub">TC에서 이슈 등록 시 자동 연결됩니다</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title">📊 실행 유형</div></div>
            <span className="badge badge-pending" style={{ fontSize: '12px', padding: '5px 10px' }}>— 미연결</span>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">⚙️ 등록 액션</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button className="btn btn-success btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                ✅ 이슈 등록 승인
              </button>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>💾 임시저장</button>
              <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>🗑️ 취소</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
