'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'

// ── 타입 ──────────────────────────────────────────────
type Phase =
  | 'idle'
  | 'uploading'       // 0: 기획서 분석
  | 'missing_items'   // 1: 누락 항목 보완 (사람)
  | 'generating_tc'   // 2: TC 생성
  | 'generating_code' // 3: 테스트 코드 생성
  | 'running_tests'   // 4: 테스트 수행
  | 'done'

interface MissingItem {
  id: number
  question: string
  description: string
  priority: string
  suggestions: string[]
  answer?: string
}

interface DoneResult {
  tcCount: number
  codeCount: number
  passCount: number
  failCount: number
  issueCount: number
  videoUrls: string[]
}

const PIPELINE_STEPS = [
  { icon: '📄', label: '기획서 분석',      phase: 'uploading' },
  { icon: '🔍', label: '누락 항목 보완',   phase: 'missing_items' },
  { icon: '🧪', label: 'TC 생성',          phase: 'generating_tc' },
  { icon: '💻', label: '테스트 코드 생성', phase: 'generating_code' },
  { icon: '▶️', label: '테스트 수행',       phase: 'running_tests' },
  { icon: '📌', label: '이슈 자동 등록',   phase: 'done' },
]

function phaseToStep(phase: Phase): number {
  const map: Partial<Record<Phase, number>> = {
    uploading: 0, missing_items: 1, generating_tc: 2,
    generating_code: 3, running_tests: 4, done: 5,
  }
  return map[phase] ?? -1
}

// ── 메인 컴포넌트 ──────────────────────────────────────
export default function DashboardPage() {
  const fileInputRef  = useRef<HTMLInputElement>(null)
  const logRef        = useRef<HTMLDivElement>(null)
  const projectIdRef  = useRef<number | null>(null)

  const [phase, setPhase]           = useState<Phase>('idle')
  const [file, setFile]             = useState<File | null>(null)
  const [dragging, setDragging]     = useState(false)
  const [logs, setLogs]             = useState<{ t: string; m: string }[]>([])
  const [error, setError]           = useState('')

  // 분석 결과
  const [featureCount, setFeatureCount] = useState(0)

  // 누락 항목
  const [missingItems, setMissingItems] = useState<MissingItem[]>([])
  const [answers, setAnswers]           = useState<Record<number, string>>({})
  const [customOpen, setCustomOpen]     = useState<Record<number, boolean>>({})
  const [submitting, setSubmitting]     = useState(false)

  // 진행 결과
  const [tcCount, setTcCount]           = useState(0)
  const [codeCount, setCodeCount]       = useState(0)
  const [testLogs, setTestLogs]         = useState<{ t: string; m: string }[]>([])
  const [done, setDone]                 = useState<DoneResult | null>(null)

  const addLog = useCallback((m: string, t = 'info') => {
    setLogs(prev => [...prev, { m, t }])
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs, testLogs])

  // ── 파일 선택 ──────────────────────────────────────
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setFile(f)
    e.target.value = ''
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) setFile(f)
  }

  // ── STEP 0: 기획서 업로드 & 분석 ──────────────────
  async function startPipeline() {
    if (!file) return
    setError('')
    setPhase('uploading')
    setLogs([])
    setDone(null)
    projectIdRef.current = null
    addLog('📄 기획서 업로드 중...')

    const fd = new FormData()
    fd.append('file', file)
    try {
      const res  = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '업로드 실패')

      projectIdRef.current = data.projectId
      setFeatureCount(data.featureCount)
      addLog(`✅ 기능 ${data.featureCount}개 감지`, 'ok')

      if (data.missingCount > 0) {
        addLog(`⚠️ 누락 항목 ${data.missingCount}건 발견 — 보완이 필요합니다`, 'warn')
        await loadMissingItems(data.projectId)
        setPhase('missing_items')
      } else {
        addLog('✅ 누락 항목 없음 — TC 생성 시작', 'ok')
        setPhase('generating_tc')
        await runGenerateTc()
      }
    } catch (e) {
      setError(String(e))
      setPhase('idle')
    }
  }

  // ── 누락 항목 로드 ────────────────────────────────
  async function loadMissingItems(pid: number) {
    const res  = await fetch(`/api/projects/${pid}/missing-items`)
    const data = await res.json()
    const items: MissingItem[] = (data.items ?? []).map((it: MissingItem & { suggestions?: string | string[] }) => ({
      ...it,
      suggestions: typeof it.suggestions === 'string'
        ? (() => { try { return JSON.parse(it.suggestions as string) } catch { return [] } })()
        : it.suggestions ?? [],
      answer: undefined,
    }))
    setMissingItems(items)
    setAnswers({})
    setCustomOpen({})
  }

  // ── STEP 1: 누락 항목 답변 제출 ──────────────────
  async function submitAnswers() {
    const pid = projectIdRef.current
    if (!pid) return
    setSubmitting(true)
    try {
      for (const item of missingItems) {
        const ans = answers[item.id]?.trim()
        if (!ans) continue
        await fetch(`/api/missing-items/${item.id}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer: ans }),
        })
        addLog(`✅ "${item.question.slice(0, 30)}..." → ${ans}`, 'ok')
      }
      setPhase('generating_tc')
      await runGenerateTc()
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  function setAnswer(itemId: number, value: string) {
    setAnswers(prev => ({ ...prev, [itemId]: value }))
  }

  const answeredCount = missingItems.filter(it => answers[it.id]?.trim()).length
  const allAnswered   = missingItems.length > 0 && answeredCount === missingItems.length

  // ── STEP 2: TC 생성 ───────────────────────────────
  async function runGenerateTc() {
    const pid = projectIdRef.current
    if (!pid) return
    setPhase('generating_tc')
    addLog('🧪 TC 생성 중...')
    try {
      const res  = await fetch(`/api/projects/${pid}/generate-tc`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'TC 생성 실패')
      setTcCount(data.count)
      addLog(`✅ TC ${data.count}개 생성 완료`, 'ok')
      setPhase('generating_code')
      await runGenerateCode()
    } catch (e) {
      setError(String(e))
      setPhase('idle')
    }
  }

  // ── STEP 3: 테스트 코드 생성 ──────────────────────
  async function runGenerateCode() {
    const pid = projectIdRef.current
    if (!pid) return
    setPhase('generating_code')
    addLog('💻 Playwright 코드 생성 중...')
    try {
      const res  = await fetch(`/api/projects/${pid}/generate-code`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '코드 생성 실패')
      setCodeCount(data.count)
      addLog(`✅ 코드 파일 ${data.count}개 생성 완료`, 'ok')
      setPhase('running_tests')
      await runAllTests()
    } catch (e) {
      setError(String(e))
      setPhase('idle')
    }
  }

  // ── STEP 4: 전체 테스트 수행 (SSE) ────────────────
  async function runAllTests() {
    const pid = projectIdRef.current
    if (!pid) return
    setPhase('running_tests')
    setTestLogs([])
    addLog('▶️ Playwright 테스트 실행 중...')

    const addTestLog = (m: string, t = 'info') =>
      setTestLogs(prev => [...prev, { m, t }])

    try {
      const res = await fetch(`/api/projects/${pid}/run-all`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '테스트 실행 실패')
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      let finalPassCount  = 0
      let finalFailCount  = 0
      let finalIssueCount = 0
      let finalVideoUrls: string[] = []

      while (true) {
        const { done: rDone, value } = await reader.read()
        if (rDone) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.replace(/^data: /, '').trim()
          if (!line) continue
          try {
            const ev = JSON.parse(line) as {
              type: string; message?: string
              passed?: boolean; passCount?: number; failCount?: number
              issueCount?: number; videoUrls?: string[]; total?: number
            }
            if (ev.type === 'done') {
              finalPassCount  = ev.passCount  ?? 0
              finalFailCount  = ev.failCount  ?? 0
              finalIssueCount = ev.issueCount ?? 0
              finalVideoUrls  = ev.videoUrls  ?? []
            } else if (ev.type === 'pass') {
              addTestLog(ev.message ?? '', 'ok')
            } else if (ev.type === 'fail') {
              addTestLog(ev.message ?? '', 'warn')
            } else if (ev.message) {
              addTestLog(ev.message, ev.type === 'err' ? 'warn' : 'info')
            }
          } catch { /* ignore */ }
        }
      }

      addLog(`▶️ 수행 완료 — ${finalPassCount} Pass / ${finalFailCount} Fail`, finalFailCount > 0 ? 'warn' : 'ok')
      if (finalIssueCount > 0) addLog(`📌 이슈 ${finalIssueCount}건 자동 등록`, 'ok')

      setDone({
        tcCount,
        codeCount,
        passCount: finalPassCount,
        failCount: finalFailCount,
        issueCount: finalIssueCount,
        videoUrls: finalVideoUrls,
      })
      setPhase('done')
    } catch (e) {
      addLog(`❌ 테스트 실행 실패: ${String(e)}`, 'warn')
      setError(String(e))
      setPhase('idle')
    }
  }

  function reset() {
    setPhase('idle'); setFile(null); setLogs([]); setTestLogs([])
    setError(''); setDone(null); setMissingItems([]); setAnswers({})
    setFeatureCount(0); setTcCount(0); setCodeCount(0)
    projectIdRef.current = null
  }

  const currentStep = phaseToStep(phase)
  const isRunning   = ['uploading', 'generating_tc', 'generating_code', 'running_tests'].includes(phase)

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700 }}>🚀 자동 실행 모드</span>
          {phase === 'missing_items' && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: '#FEF3C7', color: '#92400E' }}>⏸ 누락 항목 입력 필요</span>}
          {phase === 'done'          && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: '#DCFCE7', color: '#065F46' }}>✅ 파이프라인 완료</span>}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--gray-400)', margin: 0 }}>
          기획서 업로드 한 번으로 분석 → 누락보완 → TC 생성 → 코드 생성 → 테스트 수행 → 이슈 등록까지 자동 진행
        </p>
      </div>

      <div className="grid-2" style={{ alignItems: 'start', gap: '20px' }}>

        {/* ── 좌측 ── */}
        <div>
          {/* 파일 */}
          {!file ? (
            <div
              className="upload-zone"
              style={{ marginBottom: '14px', minHeight: '110px', ...(dragging ? { borderColor: 'var(--primary)', background: 'var(--primary-light)' } : {}) }}
              onClick={() => fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
            >
              <div className="upload-icon" style={{ fontSize: '26px' }}>📄</div>
              <div className="upload-title" style={{ fontSize: '13px' }}>{dragging ? '여기에 놓으세요' : '기획서 업로드'}</div>
              <div className="upload-sub">클릭하거나 파일을 드래그하세요</div>
              <div className="upload-formats" style={{ marginTop: '8px' }}>
                {['PDF', 'DOCX', 'XLSX', 'PNG', 'TXT'].map(f => <span key={f} className="format-tag">{f}</span>)}
              </div>
            </div>
          ) : (
            <div className="file-bar" style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '18px' }}>📄</span>
              <span className="file-bar-name">{file.name}</span>
              {!isRunning && <button className="file-bar-x" onClick={reset}>×</button>}
            </div>
          )}
          <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.doc,.txt,.md,.png"
            style={{ display: 'none' }} onChange={onFileChange} />

          {error && <div className="alert alert-error" style={{ marginBottom: '10px' }}>❌ {error}</div>}

          {/* ── IDLE ── */}
          {phase === 'idle' && (
            <button className="run-cta" disabled={!file} onClick={startPipeline}>
              🚀 자동 실행 시작
            </button>
          )}

          {/* ── UPLOADING / GENERATING (spinner) ── */}
          {isRunning && (
            <div style={{ background: 'var(--primary-light)', border: '1px solid #C7D2FE', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--primary)', animation: 'pipe-pulse 1.2s ease-in-out infinite' }} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>
                  {phase === 'uploading'       ? '📄 기획서 분석 중...'
                  : phase === 'generating_tc'  ? '🧪 TC 생성 중...'
                  : phase === 'generating_code'? '💻 테스트 코드 생성 중...'
                  : '▶️ 테스트 수행 중...'}
                </span>
              </div>
              <div style={{ background: '#C7D2FE', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--primary)', borderRadius: '4px', width: `${((currentStep) / (PIPELINE_STEPS.length - 1)) * 100}%`, transition: 'width .6s' }} />
              </div>
              <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px' }}>{currentStep} / {PIPELINE_STEPS.length - 1} 단계</div>

              {/* 테스트 수행 중: 실시간 로그 */}
              {phase === 'running_tests' && testLogs.length > 0 && (
                <div style={{ marginTop: '12px', background: '#1E1E2E', borderRadius: '8px', padding: '10px 12px', textAlign: 'left', maxHeight: '160px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '10px' }}>
                  {testLogs.slice(-20).map((l, i) => (
                    <div key={i} style={{ color: l.t === 'ok' ? '#10B981' : l.t === 'warn' ? '#EF4444' : '#9CA3AF', lineHeight: 1.6 }}>{l.m}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── MISSING ITEMS (사람 입력) ── */}
          {phase === 'missing_items' && (
            <div>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '14px 16px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '15px' }}>⏸</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>누락 항목 보완</span>
                  <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#78350F' }}>{answeredCount}/{missingItems.length} 완료</span>
                </div>
                <p style={{ fontSize: '11px', color: '#78350F', margin: 0 }}>
                  아래 항목을 모두 입력하면 TC 생성이 자동으로 이어집니다
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '14px', maxHeight: '420px', overflowY: 'auto' }}>
                {missingItems.map((item) => {
                  const answered = !!answers[item.id]?.trim()
                  return (
                    <div key={item.id} className="card" style={{ padding: '12px 14px', border: `1.5px solid ${answered ? '#6EE7B7' : 'var(--gray-200)'}`, transition: 'border-color .2s' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {answered ? '✅' : '❓'} {item.question}
                      </div>
                      {item.description && (
                        <div style={{ fontSize: '11px', color: 'var(--gray-400)', marginBottom: '8px' }}>{item.description}</div>
                      )}
                      {/* 제안 칩 */}
                      {item.suggestions?.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                          {item.suggestions.map((s) => (
                            <button key={s} onClick={() => { setAnswer(item.id, s); setCustomOpen(p => ({ ...p, [item.id]: false })) }}
                              style={{
                                padding: '4px 10px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer',
                                border: `1.5px solid ${answers[item.id] === s ? 'var(--primary)' : 'var(--gray-200)'}`,
                                background: answers[item.id] === s ? 'var(--primary)' : 'white',
                                color: answers[item.id] === s ? 'white' : '#374151',
                                fontWeight: answers[item.id] === s ? 600 : 400,
                              }}>
                              {s}
                            </button>
                          ))}
                          <button onClick={() => setCustomOpen(p => ({ ...p, [item.id]: !p[item.id] }))}
                            style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', border: '1.5px solid var(--gray-200)', background: customOpen[item.id] ? 'var(--gray-100)' : 'white', color: '#374151' }}>
                            ✏️ 기타
                          </button>
                        </div>
                      )}
                      {/* 직접 입력 */}
                      {(customOpen[item.id] || !item.suggestions?.length) && (
                        <textarea
                          className="form-textarea"
                          style={{ minHeight: '60px', fontSize: '12px' }}
                          placeholder="직접 입력하세요..."
                          value={customOpen[item.id] ? (answers[item.id] ?? '') : (answers[item.id] ?? '')}
                          onChange={e => setAnswer(item.id, e.target.value)}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              <button
                className="btn btn-primary"
                style={{ width: '100%', padding: '13px', fontSize: '14px', fontWeight: 700, opacity: allAnswered ? 1 : 0.5 }}
                disabled={!allAnswered || submitting}
                onClick={submitAnswers}
              >
                {submitting ? '저장 중...' : `✅ 보완 완료 (${answeredCount}/${missingItems.length}) — TC 생성 시작 →`}
              </button>
            </div>
          )}

          {/* ── DONE ── */}
          {phase === 'done' && done && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {[
                  { n: done.tcCount,    label: 'TC 생성',  color: 'var(--primary)' },
                  { n: done.passCount,  label: 'Pass',     color: '#059669' },
                  { n: done.failCount,  label: 'Fail',     color: '#DC2626' },
                  { n: done.issueCount, label: '이슈 등록', color: '#D97706' },
                  { n: done.codeCount,  label: '코드 파일', color: '#7C3AED' },
                  { n: done.videoUrls.length, label: '녹화 영상', color: '#0891B2' },
                ].map(({ n, label, color }) => (
                  <div key={label} style={{ background: 'var(--gray-50)', borderRadius: '8px', padding: '12px 8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: 800, color }}>{n}</div>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* 녹화 영상 */}
              {done.videoUrls.length > 0 && (
                <div style={{ background: '#1E1E2E', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', fontSize: '11px', color: '#CDD6F4', fontWeight: 600, borderBottom: '1px solid #313244' }}>
                    🎬 테스트 녹화 영상 ({done.videoUrls.length}개)
                  </div>
                  {done.videoUrls.slice(0, 3).map((url, i) => (
                    <video key={i} src={url} controls style={{ width: '100%', display: 'block', borderTop: i > 0 ? '1px solid #313244' : 'none', maxHeight: '200px' }} />
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <Link href="/board" className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  📌 이슈 보드 확인 →
                </Link>
                <Link href="/tc-detail" className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                  ▶️ 테스트 수행 보기
                </Link>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--gray-400)', textDecoration: 'underline' }} onClick={reset}>
                🔄 처음부터 다시 실행
              </button>
            </div>
          )}
        </div>

        {/* ── 우측: 파이프라인 + 로그 ── */}
        <div>
          <div className="card" style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '14px' }}>
              실행 파이프라인
            </div>
            <div className="pipeline">
              {PIPELINE_STEPS.map((step, i) => {
                const isDone    = phase === 'done' || currentStep > i
                const isActive  = currentStep === i && phase !== 'done'
                const isInput   = phase === 'missing_items' && i === 1
                const stepState = isDone ? 'done' : isActive ? (isInput ? 'needs_input' : 'running') : 'idle'

                return (
                  <div key={step.label}>
                    <div className={`pipe-step ${stepState}`}>
                      <div className={`pipe-dot ${stepState}`}>
                        {isDone ? '✓' : isInput ? '⏸' : isActive ? '⟳' : step.icon}
                      </div>
                      <div className="pipe-body">
                        <div className="pipe-label">{step.label}</div>
                        <div className="pipe-detail">
                          {isInput   ? '입력 대기 중 — 좌측 폼을 작성하세요'
                          : isActive ? '진행 중...'
                          : isDone   ? ''
                          : '대기'}
                        </div>
                        {isDone && i === 0 && featureCount > 0 && <div className="pipe-tag">기능 {featureCount}개 감지</div>}
                        {isDone && i === 1 && <div className="pipe-tag">보완 {missingItems.length}건 완료</div>}
                        {isDone && i === 2 && tcCount > 0   && <div className="pipe-tag">TC {tcCount}개 생성</div>}
                        {isDone && i === 3 && codeCount > 0 && <div className="pipe-tag">{codeCount}개 파일</div>}
                        {isDone && i === 4 && done && <div className="pipe-tag">{done.passCount}P / {done.failCount}F</div>}
                        {isDone && i === 5 && done && <div className="pipe-tag">이슈 {done.issueCount}건</div>}
                      </div>
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className={`pipe-connector ${isDone ? 'done' : isActive ? 'running' : 'idle'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 실행 로그 */}
          {logs.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '5px' }}>실행 로그</div>
              <div className="log-stream" ref={logRef}>
                {logs.map((l, i) => (
                  <div key={i} className={`log-line-${l.t}`}>{l.m}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
