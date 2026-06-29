'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { loadPipeline, clearPipeline, savePipeline } from '@/lib/pipelineStore'

interface RecentProject {
  id: number
  title: string
  status: string
  created_at: string
  file_name: string | null
  file_type: string | null
  missing_count: number
  tc_count: number
}

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

function NotSpecModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '36px 32px',
        maxWidth: '400px', width: '90%', textAlign: 'center',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚫</div>
        <div style={{ fontSize: '18px', fontWeight: 700, color: '#111', marginBottom: '10px' }}>
          기획서가 아닙니다
        </div>
        <div style={{ fontSize: '14px', color: '#666', lineHeight: 1.6, marginBottom: '24px' }}>
          업로드한 파일이 소프트웨어/서비스 기획서로 인식되지 않았습니다.<br />
          기능 요구사항, 화면 설계, 사용자 시나리오 등이 포함된 기획서를 업로드해 주세요.
        </div>
        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={onClose}
        >
          다시 업로드하기
        </button>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const router = useRouter()
  const [state, setState] = useState<UploadState>('idle')
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [showNotSpecModal, setShowNotSpecModal] = useState(false)
  const [linkedProject, setLinkedProject] = useState<{ id: number; fileName: string } | null>(null)
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const pipeline = loadPipeline()
    const storedId = localStorage.getItem('testflow_project_id')
    const projectId = pipeline?.projectId ?? (storedId ? Number(storedId) : null)
    if (projectId) {
      setLinkedProject({ id: projectId, fileName: pipeline?.fileName ?? '' })
    } else if (pipeline?.phase === 'uploading' && pipeline.fileName) {
      setLinkedProject({ id: 0, fileName: pipeline.fileName })
    }
  }, [])

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => setRecentProjects(data.projects ?? []))
      .catch(() => {})
      .finally(() => setLoadingRecent(false))
  }, [state]) // state가 'done'으로 바뀔 때 목록 새로고침

  function openProject(project: RecentProject) {
    const fileName = project.file_name ?? project.title
    localStorage.setItem('testflow_project_id', String(project.id))
    savePipeline({
      status: project.tc_count > 0 ? 'done' : 'paused',
      phase:  project.tc_count > 0 ? 'done' : 'missing_items',
      fileName, projectId: project.id,
      stepStates: [], logs: [], elapsed: 0, savedAt: Date.now(),
      tcCount: project.tc_count,
    })
    setLinkedProject({ id: project.id, fileName })
    if (project.tc_count > 0) {
      router.push('/tc-list')
    } else {
      router.push(`/form?projectId=${project.id}`)
    }
  }

  function resetUpload() {
    setState('idle')
    setFileName('')
    setResult(null)
    setErrorMsg('')
  }

  async function uploadFile(file: File) {
    if (state === 'analyzing') return
    setFileName(file.name)
    setState('analyzing')
    setErrorMsg('')
    setResult(null)
    setLinkedProject(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '업로드 실패')
      if (data.isSpec === false) {
        setState('idle')
        setShowNotSpecModal(true)
        return
      }
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
      {showNotSpecModal && (
        <NotSpecModal onClose={() => setShowNotSpecModal(false)} />
      )}

      {/* 파이프라인 연동 배너 */}
      {linkedProject && state === 'idle' && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          background: 'linear-gradient(135deg,#EFF6FF,#DBEAFE)',
          border: '1px solid #93C5FD', borderRadius: '12px',
          padding: '14px 16px', marginBottom: '16px',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>🔗</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1D4ED8', marginBottom: '3px' }}>
              연동된 프로젝트가 있습니다
            </div>
            <div style={{ fontSize: '11px', color: '#1E40AF', marginBottom: '10px' }}>
              {linkedProject.id === 0
                ? `"${linkedProject.fileName}" 파이프라인 실행 중 — 분석이 완료되면 누락 항목 보완으로 이어집니다.`
                : `"${linkedProject.fileName || `프로젝트 #${linkedProject.id}`}" 분석 완료 — 누락 항목 보완을 이어서 진행할 수 있습니다.`}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {linkedProject.id === 0 ? (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '6px 14px' }}
                  onClick={() => router.push('/dashboard')}
                >
                  파이프라인으로 돌아가기 →
                </button>
              ) : (
              <button
                className="btn btn-primary"
                style={{ fontSize: '12px', padding: '6px 14px' }}
                onClick={() => router.push(`/form?projectId=${linkedProject.id}`)}
              >
                누락 항목 보완 계속 →
              </button>
              )}
              <button
                className="btn btn-secondary"
                style={{ fontSize: '12px', padding: '6px 14px' }}
                onClick={() => {
                  setLinkedProject(null)
                  clearPipeline()
                  localStorage.removeItem('testflow_project_id')
                }}
              >
                새 기획서 업로드
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div style={{ position: 'relative', width: '48px', height: '48px', margin: '0 auto 14px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    border: '4px solid var(--primary-light)',
                    borderTopColor: 'var(--primary)',
                    animation: 'spin 0.9s linear infinite',
                  }} />
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px',
                  }}>🤖</div>
                </div>
                <div style={{
                  fontSize: '13px', fontWeight: 700, color: '#1F2937',
                  maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  marginBottom: '6px',
                }}>
                  {fileName}
                </div>
                <AnalyzingDots />
              </>
            )}
            {state === 'done' && (
              <div style={{ position: 'relative', width: '100%', textAlign: 'center' }}>
                {/* 초기화 버튼 */}
                <button
                  onClick={e => { e.stopPropagation(); resetUpload() }}
                  title="초기화"
                  style={{
                    position: 'absolute', top: '-4px', right: '0',
                    background: 'none', border: '1px solid #E5E7EB', borderRadius: '50%',
                    width: '22px', height: '22px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', color: '#9CA3AF', lineHeight: 1,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#EF4444'; (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E5E7EB'; (e.currentTarget as HTMLButtonElement).style.color = '#9CA3AF' }}
                >
                  ×
                </button>

                <div style={{ fontSize: '28px', marginBottom: '10px' }}>
                  {fileName.endsWith('.pdf') ? '📄' : fileName.match(/\.(docx?|doc)$/i) ? '📝' : fileName.match(/\.(png|jpe?g)$/i) ? '🖼️' : '📄'}
                </div>
                <div style={{
                  fontSize: '13px', fontWeight: 700, color: '#1F2937',
                  maxWidth: '200px', margin: '0 auto 8px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {fileName}
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                  borderRadius: '20px', background: '#DCFCE7', color: '#059669',
                }}>
                  ✅ 분석 완료
                </span>
                <div style={{ fontSize: '10px', color: '#9CA3AF', marginTop: '10px' }}>
                  클릭하여 다른 파일 업로드
                </div>
              </div>
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
          <div className="card-header"><div className="card-title">📂 최근 파일</div></div>

          {loadingRecent && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
            </div>
          )}

          {!loadingRecent && recentProjects.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">📂</div>
              <div className="empty-state-text">업로드 내역 없음</div>
              <div className="empty-state-sub">업로드한 기획서가 여기에 표시됩니다</div>
            </div>
          )}

          {!loadingRecent && recentProjects.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {recentProjects.map(p => {
                const fileName = p.file_name ?? p.title
                const ext = p.file_type?.toUpperCase() ?? ''
                const isActive = linkedProject?.id === p.id
                const statusMeta = p.tc_count > 0
                  ? { label: `TC ${p.tc_count}개`, color: '#059669', bg: '#DCFCE7' }
                  : p.status === 'needs_input'
                    ? { label: '보완 필요', color: '#D97706', bg: '#FEF3C7' }
                    : p.status === 'analyzing'
                      ? { label: '분석 중', color: '#4F46E5', bg: '#EEF2FF' }
                      : { label: p.status, color: '#6B7280', bg: '#F3F4F6' }
                const fileIcon = ext === 'PDF' ? '📄' : (ext === 'DOCX' || ext === 'DOC') ? '📝' : (ext === 'PNG' || ext === 'JPG' || ext === 'JPEG') ? '🖼️' : '📄'
                const date = new Date(p.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

                return (
                  <button
                    key={p.id}
                    onClick={() => openProject(p)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '10px 12px', borderRadius: '8px', textAlign: 'left',
                      cursor: 'pointer', transition: 'all .15s', width: '100%',
                      border: isActive ? '2px solid var(--primary)' : '1px solid #E5E7EB',
                      background: isActive ? 'var(--primary-light)' : 'white',
                      boxShadow: isActive ? '0 0 0 3px rgba(99,102,241,.1)' : 'none',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--primary)'
                        ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--primary-light)'
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#E5E7EB'
                        ;(e.currentTarget as HTMLButtonElement).style.background = 'white'
                      }
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{fileIcon}</span>

                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '12px', fontWeight: isActive ? 700 : 600, color: isActive ? 'var(--primary)' : '#1F2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {fileName}
                        </span>
                        {isActive && (
                          <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', flexShrink: 0, background: 'var(--primary)', color: 'white', letterSpacing: '.03em' }}>
                            현재
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: '#9CA3AF' }}>{date}</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '20px', color: statusMeta.color, background: statusMeta.bg }}>
                          {statusMeta.label}
                        </span>
                      </div>
                    </div>

                    <span style={{ fontSize: '14px', color: isActive ? 'var(--primary)' : '#D1D5DB', flexShrink: 0 }}>›</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
