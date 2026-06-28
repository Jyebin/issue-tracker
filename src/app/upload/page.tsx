'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const STEPS = ['파일 읽는 중...', '기획서 분석 중...', '누락 항목 감지 중...', 'AI 검토 중...']

function AnalyzingDots() {
  const [stepIdx, setStepIdx] = useState(0)
  const [dots, setDots]       = useState('')

  useEffect(() => {
    const dotsTimer = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.')
    }, 400)
    const stepTimer = setInterval(() => {
      setStepIdx(i => (i + 1) % STEPS.length)
    }, 2200)
    return () => { clearInterval(dotsTimer); clearInterval(stepTimer) }
  }, [])

  return (
    <div style={{ fontSize: '12px', color: 'var(--primary)', minHeight: '18px', fontWeight: 500 }}>
      {STEPS[stepIdx]}{dots}
    </div>
  )
}

type UploadState = 'idle' | 'analyzing' | 'done' | 'error'

interface AnalysisResult {
  projectId: number
  featureCount: number
  missingCount: number
}

export default function UploadPage() {
  const router = useRouter()
  const [state, setState] = useState<UploadState>('idle')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    if (state === 'analyzing') return
    setFileName(file.name)
    setState('analyzing')
    setErrorMsg('')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '업로드 실패')
      setResult(data)
      localStorage.setItem('testflow_project_id', String(data.projectId))
      setState('done')
    } catch (err) {
      setErrorMsg(String(err))
      setState('error')
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) uploadFile(file)
    e.target.value = ''
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) uploadFile(file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  function onZoneClick() {
    if (state === 'analyzing') return
    fileInputRef.current?.click()
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
            onClick={onZoneClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            style={
              state === 'done'        ? { borderColor: 'var(--success)', background: '#F0FDF4' }
              : state === 'analyzing' ? { borderColor: 'var(--primary)', background: 'var(--primary-light)', cursor: 'default' }
              : state === 'error'     ? { borderColor: 'var(--danger)', background: '#FEF2F2' }
              : dragging              ? { borderColor: 'var(--primary)', background: 'var(--primary-light)' }
              : undefined
            }
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.doc,.pptx,.ppt,.txt,.md,.png"
              style={{ display: 'none' }}
              onChange={onFileChange}
            />

            {state === 'idle' && (
              <>
                <div className="upload-icon">📄</div>
                <div className="upload-title">
                  {dragging ? '여기에 놓으세요' : '파일을 드래그하거나 클릭하여 업로드'}
                </div>
                <div className="upload-sub">또는 Notion / Confluence URL을 붙여넣으세요</div>
                <div className="upload-formats">
                  {['PDF', 'DOCX', 'XLSX', 'PNG', 'Notion', 'Confluence'].map((f) => (
                    <span key={f} className="format-tag">{f}</span>
                  ))}
                </div>
              </>
            )}
            {state === 'analyzing' && (
              <>
                <div style={{ position: 'relative', width: '56px', height: '56px', margin: '0 auto 16px' }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '50%',
                    border: '4px solid var(--primary-light)',
                    borderTopColor: 'var(--primary)',
                    animation: 'spin 0.9s linear infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px',
                  }}>🤖</div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>AI 분석 중</div>
                <AnalyzingDots />
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '8px' }}>{fileName}</div>
              </>
            )}
            {state === 'done' && (
              <>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>✅</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)' }}>분석 완료!</div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>{fileName}</div>
              </>
            )}
            {state === 'error' && (
              <>
                <div style={{ fontSize: '36px', marginBottom: '10px' }}>❌</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--danger)' }}>업로드 실패</div>
                <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginTop: '6px' }}>클릭하여 다시 시도</div>
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
            <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
              불러오기
            </button>
          </div>

          {state === 'error' && errorMsg && (
            <div className="alert alert-error" style={{ marginBottom: '12px' }}>❌ {errorMsg}</div>
          )}

          {/* Analysis result */}
          {state === 'done' && result && (
            <div>
              <div className="alert alert-success">✅ 분석 완료! 기획서에서 기능을 감지했습니다.</div>
              <div className="analysis-result">
                <div className="result-card">
                  <div className="num" style={{ color: 'var(--primary)' }}>{result.featureCount}</div>
                  <div className="lbl">감지 기능</div>
                </div>
                <div className="result-card">
                  <div className="num" style={{ color: 'var(--danger)' }}>{result.missingCount}</div>
                  <div className="lbl">누락 항목</div>
                </div>
              </div>
              <button
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
                onClick={() => router.push(`/form?projectId=${result.projectId}`)}
              >
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
