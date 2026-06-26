'use client'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ApproveAllModal({ open, onClose }: Props) {
  if (!open) return null

  function handleConfirm() {
    onClose()
    alert('✅ 24건 이슈 등록 완료!')
  }

  return (
    <div className={`modal-overlay${open ? ' open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">⚠️ 전체 이슈 등록</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-warning">미검토 이슈 3건이 포함되어 있습니다.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--tc-auto-bg)', border: '1px solid var(--tc-auto-border)', borderRadius: '7px' }}>
              <span>🤖 자동 TC</span><strong>18건</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--tc-manual-bg)', border: '1px solid var(--tc-manual-border)', borderRadius: '7px' }}>
              <span>👤 수동 TC</span><strong>6건</strong>
            </div>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--gray-600)', lineHeight: 1.7 }}>
            총 <strong>24개</strong>의 이슈를 등록합니다. 계속하시겠습니까?
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-success" onClick={handleConfirm}>전체 등록 확인</button>
        </div>
      </div>
    </div>
  )
}
