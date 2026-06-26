export default function BoardPage() {
  const COLUMNS = [
    { title: '📋 대기', count: 0 },
    { title: '🔄 진행중', count: 0 },
    { title: '🔍 검토중', count: 0 },
    { title: '✅ 완료', count: 0 },
  ]

  return (
    <>
      <div className="page-header">
        <div className="page-title">📌 이슈 보드</div>
        <div className="page-subtitle">TC 실행 현황을 칸반 보드로 확인하세요</div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select className="form-select" style={{ width: 'auto', fontSize: '11px' }}>
          <option>전체 스프린트</option>
        </select>
        <select className="form-select" style={{ width: 'auto', fontSize: '11px' }}>
          <option>전체 담당자</option>
        </select>
        <select className="form-select" style={{ width: 'auto', fontSize: '11px' }}>
          <option>전체 모듈</option>
        </select>
      </div>

      <div className="board-wrap">
        {COLUMNS.map((col) => (
          <div className="board-col" key={col.title}>
            <div className="board-col-header">
              <div className="board-col-title">
                {col.title} <span className="board-col-count">{col.count}</span>
              </div>
            </div>
            <div className="empty-state" style={{ padding: '32px 12px' }}>
              <div className="empty-state-icon" style={{ fontSize: '20px' }}>📭</div>
              <div className="empty-state-sub">항목 없음</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
