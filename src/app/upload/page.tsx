'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type UploadState = 'idle' | 'analyzing' | 'done'

export default function UploadPage() {
  const router = useRouter()
  const [state, setState] = useState<UploadState>('idle')
  const [urlValue, setUrlValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function simulateUpload() {
    if (state !== 'idle') return
    setState('analyzing')
    setTimeout(() => setState('done'), 2000)
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">📁 기획 입력</div>
        <div className="page-subtitle">기획서를 업로드하면 AI가 자동 분석 후 TC를 생성합니다</div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          {/* Upload zone */}
          <div
            className="upload-zone"
            onClick={simulateUpload}
            style={
              state === 'done' ? { borderColor: 'var(--success)', background: '#F0FDF4' }
              : state === 'analyzing' ? { borderColor: 'var(--primary)', background: 'var(--primary-light)' }
              : undefined
            }
          >
            {state === 'idle' && (
              <>
                <div className="upload-icon">📄</div>
                <div className="upload-title">파일을 드래그하거나 클릭하여 업로드</div>
                <div className="upload-sub">또는 Notion / Confluence URL을 붙여넣으세요</div>
                <div className="upload-formats">
                  {['PDF','DOCX','XLSX','Notion','Confluence'].map((f) => (
                    <span key={f} className="format-tag">{f}</span>
                  ))}
                </div>
              </>
            )}
            {state === 'analyzing' && (
              <>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>⏳</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>AI 분석 중...</div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>기획서를 분석하고 있어요</div>
              </>
            )}
            {state === 'done' && (
              <>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>✅</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)' }}>분석 완료!</div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>아래 결과를 확인하세요</div>
              </>
            )}
          </div>

          {/* URL input */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <input
              className="form-input"
              placeholder="https://notion.so/..."
              style={{ flex: 1 }}
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.doc,.pptx,.ppt,.txt,.md"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files?.[0]) simulateUpload()
              }}
            />
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              불러오기
            </button>
          </div>

          {/* Analysis result — shown after upload */}
          {state === 'done' && (
            <div>
              <div className="alert alert-success">✅ 분석 완료! 기획서에서 기능을 감지했습니다.</div>
              <div className="analysis-result">
                <div className="result-card"><div className="num" style={{ color: 'var(--primary)' }}>—</div><div className="lbl">감지 기능</div></div>
                <div className="result-card"><div className="num" style={{ color: 'var(--danger)' }}>—</div><div className="lbl">Critical 누락</div></div>
                <div className="result-card"><div className="num" style={{ color: 'var(--warning)' }}>—</div><div className="lbl">High 누락</div></div>
                <div className="result-card"><div className="num" style={{ color: 'var(--info)' }}>—</div><div className="lbl">예상 TC</div></div>
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={() => router.push('/form')}>
                📋 누락 항목 보완하기 →
              </button>
            </div>
          )}
        </div>

        {/* Recent uploads */}
        <div className="card">
          <div className="card-header"><div className="card-title">📂 최근 업로드</div></div>
          <div className="empty-state">
            <div className="empty-state-icon">📂</div>
            <div className="empty-state-text">업로드 내역 없음</div>
            <div className="empty-state-sub">업로드한 기획서가 여기에 표시됩니다</div>
          </div>
        </div>
      </div>
    </>
  )
}
