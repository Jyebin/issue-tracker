export default function SpecManagerPage() {
  return (
    <>
      <div className="page-header">
        <div className="page-title">📑 기능명세서 관리</div>
        <div className="page-subtitle">AI가 버전별 변경사항을 분석하고 영향받는 TC를 알려줍니다</div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          {/* Version history */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header">
              <div className="card-title">📂 버전 히스토리</div>
              <button className="btn btn-primary btn-sm">+ 새 버전 업로드</button>
            </div>
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <div className="empty-state-text">버전 없음</div>
              <div className="empty-state-sub">기능명세서를 업로드하면 버전이 관리됩니다</div>
            </div>
          </div>

          {/* Diff */}
          <div className="card">
            <div className="card-header"><div className="card-title">🔍 변경사항</div></div>
            <div className="empty-state">
              <div className="empty-state-icon">🔍</div>
              <div className="empty-state-text">변경사항 없음</div>
              <div className="empty-state-sub">두 버전을 선택하면 변경사항이 표시됩니다</div>
            </div>
          </div>
        </div>

        <div>
          {/* Affected TCs */}
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-header">
              <div className="card-title">⚠️ 영향받는 TC</div>
            </div>
            <div className="empty-state">
              <div className="empty-state-icon">⚠️</div>
              <div className="empty-state-text">영향받는 TC 없음</div>
              <div className="empty-state-sub">명세서 변경 시 영향받는 TC가 표시됩니다</div>
            </div>
            <div style={{ marginTop: '12px' }}>
              <button className="btn btn-primary" style={{ width: '100%' }}>🤖 영향받는 TC 재생성</button>
            </div>
          </div>

          {/* Coverage */}
          <div className="card">
            <div className="card-header"><div className="card-title">📊 명세서 커버리지</div></div>
            {[
              { label: '기능 커버리지', color: 'var(--success)' },
              { label: '엣지케이스 커버리지', color: 'var(--warning)' },
              { label: '자동화 커버리지', color: 'var(--info)' },
            ].map((c) => (
              <div className="mod-row" key={c.label}>
                <div className="mod-row-header">
                  <span className="mod-name">{c.label}</span>
                  <span className="mod-pct">—</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: '0%', background: c.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
