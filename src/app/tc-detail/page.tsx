import Link from 'next/link'

export default function TCDetailPage() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <Link href="/tc-list" className="btn btn-secondary btn-sm">← TC 목록</Link>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left column */}
        <div>
          {/* Header */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="tc-id-label">TC-— · —</div>
            <div className="tc-detail-title">TC를 선택하세요</div>
            <div className="tc-meta">
              <div className="tc-meta-item"><div className="tc-meta-lbl">모듈</div><div className="tc-meta-val">—</div></div>
              <div className="tc-meta-item"><div className="tc-meta-lbl">유형</div><div className="tc-meta-val">—</div></div>
              <div className="tc-meta-item"><div className="tc-meta-lbl">우선순위</div><div className="tc-meta-val">—</div></div>
              <div className="tc-meta-item"><div className="tc-meta-lbl">상태</div><div className="tc-meta-val">—</div></div>
            </div>
          </div>

          {/* Preconditions */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title">📌 사전 조건</div></div>
            <div className="empty-state">
              <div className="empty-state-icon">📌</div>
              <div className="empty-state-text">사전 조건 없음</div>
              <div className="empty-state-sub">TC를 선택하면 사전 조건이 표시됩니다</div>
            </div>
          </div>

          {/* Test steps */}
          <div className="card">
            <div className="card-header"><div className="card-title">📝 테스트 단계</div></div>
            <table className="steps-table">
              <thead>
                <tr><th style={{ width: '40px' }}>#</th><th>액션</th><th>기대 결과</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state" style={{ padding: '24px' }}>
                      <div className="empty-state-text">단계 없음</div>
                      <div className="empty-state-sub">TC를 선택하면 단계가 표시됩니다</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="divider" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>실행 결과:</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}><input type="radio" name="result" /> Pass</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}><input type="radio" name="result" /> Fail</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}><input type="radio" name="result" /> Block</label>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title">🏷️ 태그</div></div>
            <div>
              <button className="btn btn-secondary btn-sm">+ 추가</button>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header"><div className="card-title">🔗 연결된 코드</div></div>
            <div className="empty-state">
              <div className="empty-state-icon">💻</div>
              <div className="empty-state-text">연결된 코드 없음</div>
              <div className="empty-state-sub">TC 코드가 생성되면 여기에 표시됩니다</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="card-title">📎 이슈 등록</div></div>
            <Link href="/issue-detail" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
              🔍 이슈 상세 보기 / 등록
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
