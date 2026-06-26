'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { savePipeline, loadPipeline, clearPipeline, timeAgo, type StepState } from '@/lib/pipelineStore'

type RunStatus = 'idle' | 'running' | 'paused' | 'done'

const STEPS: {
  icon: string; label: string
  type: 'api' | 'user_input' | 'auto'
  runDetail?: string; doneTag?: string
  logs?: { t: string; m: string }[]; dur?: number
}[] = [
  {
    type: 'api',
    icon: '📄', label: '기획서 분석',
    runDetail: '파일 업로드 및 AI 분석 중...',
    doneTag: '분석 완료',
  },
  {
    type: 'user_input',
    icon: '🔍', label: '누락 항목 보완',
    doneTag: '보완 완료',
  },
  {
    type: 'auto',
    icon: '🧪', label: 'TC 생성',
    runDetail: '테스트 케이스 생성 중...',
    doneTag: 'TC 24개 생성',
    logs: [
      { t: 'info', m: '🧪 TC 생성 시작...' },
      { t: 'ok',   m: '✅ 자동 TC 18개 생성' },
      { t: 'ok',   m: '✅ 수동 TC 6개 생성 · 총 24개 완료' },
    ],
    dur: 2000,
  },
  {
    type: 'auto',
    icon: '💻', label: '테스트 코드 생성',
    runDetail: 'Playwright 코드 생성 중...',
    doneTag: '.spec.ts 3파일',
    logs: [
      { t: 'info', m: '💻 코드 생성 시작...' },
      { t: 'ok',   m: '✅ login.spec.ts · payment.spec.ts · mypage.spec.ts' },
    ],
    dur: 1600,
  },
  {
    type: 'auto',
    icon: '▶️', label: '테스트 수행',
    runDetail: '자동화 테스트 실행 중...',
    doneTag: '21 Pass / 3 Fail',
    logs: [
      { t: 'info', m: '▶️  Playwright 실행...' },
      { t: 'ok',   m: '✅ TC-001 ~ TC-003 Pass' },
      { t: 'warn', m: '❌ TC-004 Fail — 계정 잠금 미동작' },
      { t: 'ok',   m: '✅ TC-005 ~ TC-021 Pass' },
      { t: 'warn', m: '❌ TC-006, TC-009 Fail' },
    ],
    dur: 2800,
  },
  {
    type: 'auto',
    icon: '📌', label: '이슈 등록 준비',
    runDetail: '실패 항목을 이슈로 정리 중...',
    doneTag: '이슈 3건 검토 대기',
    logs: [
      { t: 'info', m: '📌 이슈 자동 생성 중...' },
      { t: 'ok',   m: '✅ 이슈 3건 생성 완료' },
      { t: 'ok',   m: '📬 검토 준비 완료 — 승인 후 등록됩니다' },
    ],
    dur: 1000,
  },
]

const MOCK_RESULTS = { tcCount: 24, passCount: 21, failCount: 3, issueCount: 3 }

function spawnConfetti(origin: HTMLElement) {
  const rect = origin.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const colors = ['#4F46E5', '#7C3AED', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#fff']
  for (let i = 0; i < 60; i++) {
    const el = document.createElement('div')
    const size = Math.random() * 8 + 4
    const angle = Math.random() * Math.PI * 2
    const speed = Math.random() * 220 + 80
    el.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random() * colors.length)]};border-radius:${Math.random() > 0.4 ? '50%' : '2px'};pointer-events:none;z-index:9999;`
    document.body.appendChild(el)
    el.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(${Math.cos(angle) * speed}px - 50%),calc(${Math.sin(angle) * speed - 130 + 270}px - 50%)) scale(0.3) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: Math.random() * 700 + 600, easing: 'cubic-bezier(0,.9,.57,1)', fill: 'forwards' }
    ).onfinish = () => el.remove()
  }
}

export default function DashboardPage() {
  const runBtnRef      = useRef<HTMLButtonElement>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const logRef         = useRef<HTMLDivElement>(null)
  const runIdRef       = useRef(0)
  const startTimeRef   = useRef<number | null>(null)
  const logsRef        = useRef<{ m: string; t: string }[]>([])
  const projectIdRef   = useRef<number | null>(null)

  const [status, setStatus]         = useState<RunStatus>('idle')
  const [selectedFile, setSelected] = useState<File | null>(null)
  const [stepStates, setStepStates] = useState<StepState[]>(STEPS.map(() => 'idle'))
  const [logs, setLogs]             = useState<{ m: string; t: string }[]>([])
  const [elapsed, setElapsed]       = useState(0)
  const [savedAt, setSavedAt]       = useState<number | null>(null)
  const [missingCount, setMissingCount] = useState(0)
  const [featureCount, setFeatureCount] = useState(0)
  const [error, setError]           = useState<string | null>(null)

  // 마운트: localStorage 복원 또는 ?resume=1 처리
  useEffect(() => {
    const params       = new URLSearchParams(window.location.search)
    const shouldResume = params.get('resume') === '1'
    if (shouldResume) window.history.replaceState({}, '', '/dashboard')

    const saved = loadPipeline()
    if (!saved) return

    projectIdRef.current = saved.projectId
    logsRef.current      = saved.logs
    setLogs(saved.logs)
    setElapsed(saved.elapsed)
    setSavedAt(saved.savedAt)
    setStepStates(saved.stepStates)

    if (shouldResume && saved.status === 'paused') {
      const myId = ++runIdRef.current
      startTimeRef.current = Date.now() - saved.elapsed * 1000
      setStatus('running')
      runSteps(2, myId)
    } else {
      setStatus(saved.status === 'done' ? 'done' : 'paused')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  useEffect(() => {
    if (status !== 'running') return
    const t = setInterval(() => {
      if (startTimeRef.current) setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [status])

  function appendLog(m: string, t: string, id: number) {
    if (runIdRef.current !== id) return
    const e = { m, t }
    logsRef.current = [...logsRef.current, e]
    setLogs([...logsRef.current])
  }

  // ── 파이프라인 코어 ──────────────────────────────────────────────
  async function runSteps(startFrom: number, myId: number) {
    for (let i = startFrom; i < STEPS.length; i++) {
      if (runIdRef.current !== myId) return
      const step = STEPS[i]

      // 사용자 입력 필요 → pause
      if (step.type === 'user_input') {
        const pausedStates = STEPS.map((_, j) =>
          j < i ? 'done' : j === i ? 'needs_input' : 'idle'
        ) as StepState[]
        setStepStates(pausedStates)
        setStatus('paused')
        const el = Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000)
        savePipeline({
          status: 'paused', fileName: selectedFile?.name ?? '',
          projectId: projectIdRef.current,
          stepStates: pausedStates, logs: logsRef.current,
          elapsed: el, savedAt: Date.now(),
        })
        return
      }

      // API 호출 (기획서 분석)
      if (step.type === 'api') {
        setStepStates(prev => prev.map((_, j) => j === i ? 'running' : 'idle'))
        appendLog('📄 파일 업로드 중...', 'info', myId)
        try {
          const fd = new FormData()
          fd.append('file', selectedFile!)
          const res  = await fetch('/api/upload', { method: 'POST', body: fd })
          if (!res.ok) throw new Error((await res.json()).error ?? '서버 오류')
          const data = await res.json() as { projectId: number; featureCount: number; missingCount: number }
          projectIdRef.current = data.projectId
          setFeatureCount(data.featureCount)
          setMissingCount(data.missingCount)
          appendLog(`✅ 기능 ${data.featureCount}개 감지`, 'ok', myId)
          if (data.missingCount > 0) {
            appendLog(`⚠️  누락 항목 ${data.missingCount}건 발견`, 'warn', myId)
          }
        } catch (e) {
          appendLog(`❌ 분석 실패: ${String(e)}`, 'warn', myId)
          runIdRef.current++
          setStatus('idle')
          setError(String(e))
          return
        }
        setStepStates(prev => prev.map((_, j) => j <= i ? 'done' : 'idle'))
        continue
      }

      // 자동 단계
      setStepStates(prev => prev.map((_, j) => j < i ? 'done' : j === i ? 'running' : 'idle'))
      const slot = (step.dur ?? 1000) / ((step.logs?.length ?? 0) + 1)
      const stepLogs = step.logs ?? []
      for (let li = 0; li < stepLogs.length; li++) {
        await new Promise<void>(res => setTimeout(res, li === 0 ? slot * 0.5 : slot))
        appendLog(stepLogs[li].m, stepLogs[li].t, myId)
      }
      await new Promise<void>(res => setTimeout(res, slot))
      if (runIdRef.current !== myId) return
      setStepStates(prev => prev.map((_, j) => j <= i ? 'done' : 'idle'))
    }

    if (runIdRef.current !== myId) return
    const finalElapsed = Math.floor((Date.now() - (startTimeRef.current ?? Date.now())) / 1000)
    const now          = Date.now()
    const finalStates  = STEPS.map(() => 'done') as StepState[]
    setStepStates(finalStates)
    savePipeline({
      status: 'done', fileName: selectedFile?.name ?? '',
      projectId: projectIdRef.current,
      stepStates: finalStates, logs: logsRef.current,
      elapsed: finalElapsed, savedAt: now, results: MOCK_RESULTS,
    })
    setElapsed(finalElapsed)
    setSavedAt(now)
    setStatus('done')
  }

  async function startRun() {
    if (!selectedFile) return
    if (runBtnRef.current) spawnConfetti(runBtnRef.current)
    setError(null)
    const myId = ++runIdRef.current
    startTimeRef.current = Date.now()
    logsRef.current      = []
    projectIdRef.current = null
    setStatus('running')
    setStepStates(STEPS.map(() => 'idle'))
    setLogs([])
    setElapsed(0)
    setSavedAt(null)
    await runSteps(0, myId)
  }

  function stopRun() {
    if (!window.confirm('진행 중인 자동 실행을 중단하시겠습니까?')) return
    runIdRef.current++
    setStatus('idle')
    setStepStates(STEPS.map(() => 'idle'))
    setLogs([])
    setElapsed(0)
  }

  function reset() {
    runIdRef.current++
    clearPipeline()
    projectIdRef.current = null
    setStatus('idle')
    setStepStates(STEPS.map(() => 'idle'))
    setLogs([])
    setSelected(null)
    setElapsed(0)
    setSavedAt(null)
    setError(null)
  }

  const fileName  = selectedFile?.name ?? loadPipeline()?.fileName ?? null
  const doneCount = stepStates.filter(s => s === 'done').length
  const isRunning = status === 'running'
  const isPaused  = status === 'paused'
  const isDone    = status === 'done'

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontSize: '17px', fontWeight: 700 }}>🚀 자동 실행 모드</span>
          {isPaused && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: '#FEF3C7', color: '#92400E' }}>⏸ 사용자 확인 필요</span>}
          {isDone   && <span style={{ fontSize: '10px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', background: '#DCFCE7', color: 'var(--success)' }}>✅ 완료 {savedAt ? `· ${timeAgo(savedAt)}` : ''}</span>}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
          기획서 업로드 한 번으로 분석 → TC 생성 → 테스트 수행 → 이슈 등록까지 자동으로 진행됩니다
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start', gap: '20px' }}>
        {/* ── LEFT ── */}
        <div>
          {/* 파일 업로드 또는 file bar */}
          {!fileName ? (
            <>
              <div className="upload-zone" onClick={() => fileInputRef.current?.click()}
                style={{ marginBottom: '14px', minHeight: '110px' }}>
                <div className="upload-icon" style={{ fontSize: '26px' }}>📄</div>
                <div className="upload-title" style={{ fontSize: '13px' }}>기획서 업로드</div>
                <div className="upload-sub">클릭하거나 파일을 드래그하세요</div>
                <div className="upload-formats" style={{ marginTop: '8px' }}>
                  {['PDF', 'DOCX', 'XLSX', 'TXT', 'MD'].map(f => <span key={f} className="format-tag">{f}</span>)}
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.doc,.txt,.md"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) setSelected(f) }}
              />
            </>
          ) : (
            <div className="file-bar">
              <span style={{ fontSize: '18px' }}>📄</span>
              <span className="file-bar-name">{fileName}</span>
              {!isRunning && !isPaused && <button className="file-bar-x" onClick={reset}>×</button>}
            </div>
          )}

          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '10px' }}>❌ {error}</div>
          )}

          {/* CTA */}
          {status === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button ref={runBtnRef} className="run-cta" disabled={!selectedFile} onClick={startRun}>
                🚀 자동 실행 시작
              </button>
              {!selectedFile && <p style={{ fontSize: '11px', color: 'var(--gray-400)', textAlign: 'center' }}>먼저 기획서를 업로드해주세요</p>}
            </div>
          )}

          {isRunning && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: 'var(--primary-light)', border: '1px solid #C7D2FE', borderRadius: '10px', padding: '14px', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', animation: 'pipe-pulse 1.2s ease-in-out infinite' }} />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)' }}>실행 중... {elapsed}s</span>
                </div>
                <div style={{ background: '#C7D2FE', borderRadius: '4px', height: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '4px', background: 'var(--primary)', width: `${(doneCount / STEPS.length) * 100}%`, transition: 'width .5s' }} />
                </div>
                <div style={{ fontSize: '10px', color: 'var(--primary)', marginTop: '6px', fontWeight: 600 }}>{doneCount} / {STEPS.length} 단계 완료</div>
              </div>
              <button className="stop-cta" onClick={stopRun}>⏹ 중단</button>
            </div>
          )}

          {isPaused && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px' }}>⏸</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400E' }}>사용자 입력 필요</span>
                </div>
                <p style={{ fontSize: '12px', color: '#78350F', lineHeight: 1.7, marginBottom: '14px' }}>
                  기획서 분석에서 <strong>누락 항목 {missingCount || ''}건</strong>이 감지되었습니다.
                  {featureCount > 0 && ` (감지 기능 ${featureCount}개)`}<br />
                  누락 항목 탭에서 직접 확인·보완한 후 파이프라인을 계속합니다.
                </p>
                <Link href="/form" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '13px', borderRadius: '10px', textDecoration: 'none',
                  background: 'linear-gradient(135deg,#F59E0B,#D97706)', color: 'white',
                  fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 14px rgba(245,158,11,.35)',
                }}>
                  📋 누락 항목 보완하러 가기 →
                </Link>
              </div>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--gray-400)', textDecoration: 'underline', padding: '4px', textAlign: 'center' }} onClick={reset}>
                🗑 처음부터 다시 시작
              </button>
            </div>
          )}

          {isDone && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="result-grid">
                <div className="result-tile"><div className="big" style={{ color: 'var(--primary)' }}>{MOCK_RESULTS.tcCount}</div><div className="sm">TC 생성</div></div>
                <div className="result-tile"><div className="big" style={{ color: 'var(--success)' }}>{MOCK_RESULTS.passCount}</div><div className="sm">Pass</div></div>
                <div className="result-tile"><div className="big" style={{ color: 'var(--danger)' }}>{MOCK_RESULTS.failCount}</div><div className="sm">Fail</div></div>
                <div className="result-tile"><div className="big" style={{ color: 'var(--warning)' }}>{MOCK_RESULTS.issueCount}</div><div className="sm">이슈 대기</div></div>
              </div>
              <Link href="/board" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                padding: '16px', borderRadius: '12px', textDecoration: 'none',
                background: 'linear-gradient(135deg,var(--success),#059669)', color: 'white',
                fontWeight: 700, fontSize: '15px', boxShadow: '0 4px 20px rgba(16,185,129,.35)',
              }}>
                🔍 이슈 확인 및 승인 →
              </Link>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--gray-400)', textDecoration: 'underline' }} onClick={() => { setStatus('idle'); setStepStates(STEPS.map(() => 'idle')); setLogs([]) }}>↺ 새 버전으로 재실행</button>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--gray-400)', textDecoration: 'underline' }} onClick={reset}>🗑 초기화</button>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Pipeline + Log ── */}
        <div>
          <div className="card" style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '14px' }}>실행 파이프라인</div>
            <div className="pipeline">
              {STEPS.map((step, i) => {
                const state = stepStates[i]
                const dot = state === 'done' ? '✓' : state === 'running' ? '⟳' : state === 'needs_input' ? '⏸' : step.icon
                return (
                  <div key={step.label}>
                    <div className={`pipe-step ${state}`}>
                      <div className={`pipe-dot ${state}`}>{dot}</div>
                      <div className="pipe-body">
                        <div className="pipe-label">{step.label}</div>
                        <div className="pipe-detail">
                          {state === 'running' ? step.runDetail
                           : state === 'needs_input' ? '직접 확인 필요 — 아래 버튼을 눌러 보완하세요'
                           : state === 'idle' ? '대기 중' : ''}
                        </div>
                        {state === 'done' && <div className="pipe-tag">{step.doneTag}</div>}
                      </div>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`pipe-connector ${state === 'done' ? 'done' : state === 'running' ? 'running' : 'idle'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {(isRunning || isDone) && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '5px' }}>실행 로그</div>
              <div className="log-stream" ref={logRef}>
                {logs.length === 0
                  ? <span style={{ color: '#313244' }}>로그 대기 중...</span>
                  : logs.map((l, i) => <div key={i} className={`log-line-${l.t}`}>{l.m}</div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
