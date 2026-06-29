'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type TCType     = 'auto' | 'manual' | 'mixed'
type TCPriority = 'critical' | 'high' | 'medium' | 'low'
type TCStatus   = 'pending' | 'pass' | 'fail'

interface TestCase {
  id: number
  title: string
  module: string
  type: TCType
  priority: TCPriority
  status: TCStatus
  steps: string[] | string | null
  expected: string[] | string | null  // JSON 배열 or 구형 문자열
}

const TYPE_META: Record<TCType, { label: string; icon: string; color: string; bg: string; border: string }> = {
  auto:   { label: '자동', icon: '🤖', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
  manual: { label: '수동', icon: '👤', color: '#0891B2', bg: '#E0F2FE', border: '#BAE6FD' },
  mixed:  { label: '혼합', icon: '🔀', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
}

const PRIORITY_META: Record<TCPriority, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'Critical', color: '#EF4444', bg: '#FEF2F2', dot: '🔴' },
  high:     { label: 'High',     color: '#F97316', bg: '#FFF7ED', dot: '🟠' },
  medium:   { label: 'Medium',   color: '#F59E0B', bg: '#FFFBEB', dot: '🟡' },
  low:      { label: 'Low',      color: '#6B7280', bg: '#F9FAFB', dot: '⚪' },
}

const STATUS_META: Record<TCStatus, { label: string; color: string; bg: string }> = {
  pending: { label: '대기', color: '#6B7280', bg: '#F3F4F6' },
  pass:    { label: 'Pass', color: '#059669', bg: '#D1FAE5' },
  fail:    { label: 'Fail', color: '#DC2626', bg: '#FEE2E2' },
}

function parseSteps(raw: string[] | string | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [String(raw)] }
}

/** expected를 배열로 파싱. 구형 단일 문자열이면 steps 길이만큼 마지막에만 채움 */
function parseExpected(raw: string[] | string | null, stepCount: number): string[] {
  let arr: string[] = []
  if (!raw) {
    arr = []
  } else if (Array.isArray(raw)) {
    arr = raw
  } else {
    try {
      const parsed = JSON.parse(raw)
      arr = Array.isArray(parsed) ? parsed : [String(parsed)]
    } catch {
      arr = [String(raw)]
    }
  }
  // 스텝 수와 길이 맞추기 (부족하면 빈 문자열로 패딩)
  const result = Array.from({ length: stepCount }, (_, i) => arr[i] ?? '')
  return result
}

/** "로그인 - 이메일 입력 유효성" → { parent: "로그인", sub: "이메일 입력 유효성" } */
function splitModule(module: string): { parent: string; sub: string } {
  for (const sep of [' - ', ' – ', ' — ']) {
    const idx = module.indexOf(sep)
    if (idx > 0) return { parent: module.slice(0, idx).trim(), sub: module.slice(idx + sep.length).trim() }
  }
  return { parent: module, sub: '' }
}

export default function TCListPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [projectId, setProjectId]   = useState<number | null>(null)
  const [tcs, setTcs]               = useState<TestCase[]>([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState('')

  // Navigation stack
  const [selectedParent, setSelectedParent]   = useState<string | null>(null)
  const [selectedSub, setSelectedSub]         = useState<string | null>(null)
  const [selectedTC, setSelectedTC]           = useState<TestCase | null>(null)

  useEffect(() => {
    const urlPid = searchParams.get('projectId')
    const pid = urlPid
      ? Number(urlPid)
      : localStorage.getItem('testflow_project_id')
        ? Number(localStorage.getItem('testflow_project_id'))
        : null
    setProjectId(pid)
    if (!pid) { setLoading(false); return }
    fetchTCs(pid)
  }, [])

  async function fetchTCs(pid: number) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/projects/${pid}/test-cases`)
      const data = await res.json()
      setTcs(data.testCases ?? [])
    } catch {
      setError('TC 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  async function generateTCs() {
    if (!projectId) return
    setGenerating(true); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-tc`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'TC 생성 실패')
      await fetchTCs(projectId)
    } catch (e) { setError(String(e)) }
    finally { setGenerating(false) }
  }

  // ── 데이터 계층 구조 파싱 ──
  // parentMap: { "로그인": { "이메일 입력 유효성": [TC, ...], ... }, ... }
  const parentMap: Record<string, Record<string, TestCase[]>> = {}
  for (const tc of tcs) {
    const { parent, sub } = splitModule(tc.module || '기타')
    const subKey = sub || '일반'
    if (!parentMap[parent]) parentMap[parent] = {}
    if (!parentMap[parent][subKey]) parentMap[parent][subKey] = []
    parentMap[parent][subKey].push(tc)
  }
  const parentList = Object.keys(parentMap)

  // ── 브레드크럼 ──
  const Breadcrumb = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
      <button
        onClick={() => { setSelectedParent(null); setSelectedSub(null); setSelectedTC(null) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}
      >
        🧪 TC 목록
      </button>
      {selectedParent && (
        <>
          <span style={{ color: '#CBD5E1' }}>›</span>
          <button
            onClick={() => { setSelectedSub(null); setSelectedTC(null) }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: selectedSub ? 'pointer' : 'default', color: selectedSub ? 'var(--primary)' : '#1E293B', fontWeight: 600 }}
          >
            📁 {selectedParent}
          </button>
        </>
      )}
      {selectedSub && (
        <>
          <span style={{ color: '#CBD5E1' }}>›</span>
          <button
            onClick={() => setSelectedTC(null)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: selectedTC ? 'pointer' : 'default', color: selectedTC ? 'var(--primary)' : '#1E293B', fontWeight: 600 }}
          >
            📋 {selectedSub}
          </button>
        </>
      )}
      {selectedTC && (
        <>
          <span style={{ color: '#CBD5E1' }}>›</span>
          <span style={{ color: '#1E293B', fontWeight: 600 }}>📄 {selectedTC.title}</span>
        </>
      )}
    </div>
  )

  // ════════════════════════════════════════════════════
  // LEVEL 1 — 부모 모듈 목록
  // ════════════════════════════════════════════════════
  if (!selectedParent) return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '18px' }}>
        <div>
          <div className="page-title">🧪 TC 목록</div>
          <div className="page-subtitle">모듈을 선택하세요</div>
        </div>
        {projectId && (
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={generateTCs} disabled={generating}>
            {generating ? '⏳ 생성 중...' : '🔄 TC 재생성'}
          </button>
        )}
      </div>

      {tcs.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: '#F3F4F6', color: '#374151' }}>전체 {tcs.length}개</span>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', background: '#F3F4F6', color: '#6B7280' }}>{parentList.length}개 모듈</span>
          {tcs.filter(t => t.status === 'pass').length > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: '#D1FAE5', color: '#059669' }}>Pass {tcs.filter(t => t.status === 'pass').length}</span>}
          {tcs.filter(t => t.status === 'fail').length > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: '#FEE2E2', color: '#DC2626' }}>Fail {tcs.filter(t => t.status === 'fail').length}</span>}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>❌ {error}</div>}

      {loading ? (
        <div className="card"><div className="empty-state" style={{ padding: '60px 24px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div className="empty-state-text">불러오는 중...</div>
        </div></div>
      ) : !projectId ? (
        <div className="card"><div className="empty-state" style={{ padding: '60px 24px' }}>
          <div className="empty-state-icon">📄</div>
          <div className="empty-state-text">기획서가 없습니다</div>
          <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={() => router.push('/upload')}>기획서 업로드 →</button>
        </div></div>
      ) : tcs.length === 0 ? (
        <div className="card"><div className="empty-state" style={{ padding: '60px 24px' }}>
          <div className="empty-state-icon">🧪</div>
          <div className="empty-state-text">TC가 없습니다</div>
          <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={generateTCs} disabled={generating}>
            {generating ? '⏳ 생성 중...' : '🧪 TC 생성하기'}
          </button>
        </div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {parentList.map(parent => {
            const subs    = parentMap[parent]
            const subList = Object.keys(subs)
            const allTCs  = subList.flatMap(s => subs[s])
            const passN   = allTCs.filter(t => t.status === 'pass').length
            const failN   = allTCs.filter(t => t.status === 'fail').length
            const autoN   = allTCs.filter(t => t.type === 'auto').length
            const manualN = allTCs.filter(t => t.type === 'manual').length

            return (
              <div
                key={parent}
                onClick={() => setSelectedParent(parent)}
                style={{ border: '1px solid var(--gray-200)', borderRadius: '12px', padding: '16px 18px', background: 'white', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '14px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(79,70,229,.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray-200)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}
              >
                <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', flexShrink: 0 }}>📁</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: '#1E293B', marginBottom: '5px' }}>{parent}</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#6B7280' }}>하위 {subList.length}개 · TC {allTCs.length}개</span>
                    {autoN   > 0 && <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '8px', background: '#EEF2FF', color: '#4F46E5', fontWeight: 600 }}>🤖 {autoN}</span>}
                    {manualN > 0 && <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '8px', background: '#E0F2FE', color: '#0891B2', fontWeight: 600 }}>👤 {manualN}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {passN > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#D1FAE5', color: '#059669' }}>Pass {passN}</span>}
                  {failN > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#FEE2E2', color: '#DC2626' }}>Fail {failN}</span>}
                </div>
                <span style={{ fontSize: '18px', color: '#CBD5E1' }}>›</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )

  // ════════════════════════════════════════════════════
  // LEVEL 2 — 서브모듈 목록
  // ════════════════════════════════════════════════════
  if (selectedParent && !selectedSub) {
    const subs    = parentMap[selectedParent] ?? {}
    const subList = Object.keys(subs)

    return (
      <>
        <Breadcrumb />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>📁 {selectedParent}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>세부 항목을 선택하세요 · {subList.length}개</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelectedParent(null)}>← 뒤로</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {subList.map(sub => {
            const subTCs  = subs[sub]
            const passN   = subTCs.filter(t => t.status === 'pass').length
            const failN   = subTCs.filter(t => t.status === 'fail').length
            const autoN   = subTCs.filter(t => t.type === 'auto').length
            const manualN = subTCs.filter(t => t.type === 'manual').length
            const critN   = subTCs.filter(t => t.priority === 'critical').length

            return (
              <div
                key={sub}
                onClick={() => setSelectedSub(sub)}
                style={{ border: '1px solid var(--gray-200)', borderRadius: '10px', padding: '14px 18px', background: 'white', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '12px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.background = '#FAFBFF' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray-200)'; (e.currentTarget as HTMLElement).style.background = 'white' }}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>📋</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#1E293B', marginBottom: '4px' }}>{sub}</div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#6B7280' }}>TC {subTCs.length}개</span>
                    {autoN   > 0 && <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '8px', background: '#EEF2FF', color: '#4F46E5', fontWeight: 600 }}>🤖 {autoN}</span>}
                    {manualN > 0 && <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '8px', background: '#E0F2FE', color: '#0891B2', fontWeight: 600 }}>👤 {manualN}</span>}
                    {critN   > 0 && <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '8px', background: '#FEF2F2', color: '#EF4444', fontWeight: 600 }}>🔴 {critN}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {passN > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#D1FAE5', color: '#059669' }}>Pass {passN}</span>}
                  {failN > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '12px', background: '#FEE2E2', color: '#DC2626' }}>Fail {failN}</span>}
                </div>
                <span style={{ fontSize: '16px', color: '#CBD5E1' }}>›</span>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // ════════════════════════════════════════════════════
  // LEVEL 3 — TC 목록 (스텝 인라인 펼침)
  // ════════════════════════════════════════════════════
  if (selectedParent && selectedSub && !selectedTC) {
    const subTCs = (parentMap[selectedParent]?.[selectedSub] ?? [])

    return (
      <>
        <Breadcrumb />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '18px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>📁 {selectedParent}</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>📋 {selectedSub}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>TC를 클릭해 단계를 확인하세요 · {subTCs.length}개</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelectedSub(null)}>← 뒤로</button>
        </div>

        <div style={{ border: '1px solid var(--gray-200)', borderRadius: '10px', overflow: 'hidden' }}>
          {subTCs.map((tc, idx) => {
            const typeMeta = TYPE_META[tc.type]         ?? TYPE_META.manual
            const priMeta  = PRIORITY_META[tc.priority] ?? PRIORITY_META.medium
            const statMeta = STATUS_META[tc.status]     ?? STATUS_META.pending
            const isLast   = idx === subTCs.length - 1

            return (
              <div
                key={tc.id}
                onClick={() => setSelectedTC(tc)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', cursor: 'pointer', background: 'white', transition: 'background .1s', borderBottom: isLast ? 'none' : '1px solid #F1F5F9' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}
              >
                <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#64748B', flexShrink: 0 }}>
                  {parseSteps(tc.steps).length}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B' }}>{tc.title}</div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px', fontFamily: 'monospace' }}>TC-{String(tc.id).padStart(3, '0')}</div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', background: typeMeta.bg, color: typeMeta.color, border: `1px solid ${typeMeta.border}`, flexShrink: 0 }}>{typeMeta.icon} {typeMeta.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: priMeta.color, flexShrink: 0 }}>{priMeta.dot} {priMeta.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', background: statMeta.bg, color: statMeta.color, flexShrink: 0 }}>{statMeta.label}</span>
                <span style={{ fontSize: '16px', color: '#CBD5E1', flexShrink: 0 }}>›</span>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // ════════════════════════════════════════════════════
  // LEVEL 4 — TC 스텝 상세 (Zephyr Scale 스타일)
  // ════════════════════════════════════════════════════
  if (selectedTC) {
    return <TCStepDetail
      tc={selectedTC}
      onBack={() => setSelectedTC(null)}
      onStatusChange={newStatus => {
        setTcs(prev => prev.map(t => t.id === selectedTC.id ? { ...t, status: newStatus } : t))
        setSelectedTC(prev => prev ? { ...prev, status: newStatus } : prev)
      }}
      breadcrumb={<Breadcrumb />}
      selectedParent={selectedParent ?? ''}
      selectedSub={selectedSub ?? ''}
    />
  }

  return null
}

// ────────────────────────────────────────────────────
// TC Step Detail Component (Zephyr Scale style)
// ────────────────────────────────────────────────────
type StepStatus = 'pending' | 'pass' | 'fail' | 'na'

const STEP_STYLE: Record<StepStatus, { bg: string; border: string; leftBorder: string; numBg: string }> = {
  pending: { bg: 'white',   border: '#E2E8F0', leftBorder: '#94A3B8', numBg: '#94A3B8' },
  pass:    { bg: '#F0FDF4', border: '#86EFAC', leftBorder: '#16A34A', numBg: '#16A34A' },
  fail:    { bg: '#FFF1F2', border: '#FCA5A5', leftBorder: '#DC2626', numBg: '#DC2626' },
  na:      { bg: '#F8FAFC', border: '#CBD5E1', leftBorder: '#94A3B8', numBg: '#CBD5E1' },
}

const STEP_BTNS = [
  { val: 'pass' as StepStatus, icon: '✓', label: 'Pass', color: '#16A34A', bg: '#DCFCE7' },
  { val: 'fail' as StepStatus, icon: '✗', label: 'Fail', color: '#DC2626', bg: '#FEE2E2' },
  { val: 'na'   as StepStatus, icon: '—', label: 'N/A',  color: '#64748B', bg: '#F1F5F9' },
]

function TCStepDetail({
  tc, onBack, onStatusChange, breadcrumb, selectedParent, selectedSub,
}: {
  tc: TestCase
  onBack: () => void
  onStatusChange: (s: TCStatus) => void
  breadcrumb: ReactNode
  selectedParent: string
  selectedSub: string
}) {
  const steps    = parseSteps(tc.steps)
  const initExp  = parseExpected(tc.expected, steps.length)

  const [stepStatuses,  setStepStatuses]  = useState<StepStatus[]>(() => steps.map(() => 'pending'))
  const [expectedTexts, setExpectedTexts] = useState<string[]>(initExp)
  const [editingIdx,    setEditingIdx]    = useState<number | null>(null)
  const [editingVal,    setEditingVal]    = useState('')
  const [savingStatus,  setSavingStatus]  = useState(false)
  const [savingExp,     setSavingExp]     = useState(false)

  const typeMeta   = TYPE_META[tc.type]         ?? TYPE_META.manual
  const priMeta    = PRIORITY_META[tc.priority] ?? PRIORITY_META.medium

  const passN  = stepStatuses.filter(s => s === 'pass').length
  const failN  = stepStatuses.filter(s => s === 'fail').length
  const naN    = stepStatuses.filter(s => s === 'na').length
  const doneN  = passN + failN + naN

  const calcTCStatus = (ss: StepStatus[]): TCStatus => {
    if (ss.some(s => s === 'fail')) return 'fail'
    if (ss.every(s => s === 'pass' || s === 'na') && ss.some(s => s === 'pass')) return 'pass'
    return 'pending'
  }

  async function setStep(idx: number, val: StepStatus) {
    const next = stepStatuses.map((s, i) => i === idx ? (s === val ? 'pending' : val) : s)
    setStepStatuses(next)
    const tcStatus = calcTCStatus(next)
    setSavingStatus(true)
    try {
      await fetch(`/api/tc/${tc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: tcStatus }) })
      onStatusChange(tcStatus)
    } finally { setSavingStatus(false) }
  }

  async function saveExpected(idx: number, val: string) {
    const next = expectedTexts.map((e, i) => i === idx ? val : e)
    setExpectedTexts(next)
    setEditingIdx(null)
    setSavingExp(true)
    try {
      await fetch(`/api/tc/${tc.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expected: next }) })
    } finally { setSavingExp(false) }
  }

  const tcStatus   = calcTCStatus(stepStatuses)
  const tcStatMeta = STATUS_META[tcStatus] ?? STATUS_META.pending

  return (
    <>
      {breadcrumb}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '14px', gap: '12px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '3px' }}>📁 {selectedParent} · 📋 {selectedSub}</div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>{tc.title}</div>
          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '3px', fontFamily: 'monospace' }}>TC-{String(tc.id).padStart(3, '0')}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← 뒤로</button>
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, padding: '4px 12px', borderRadius: '10px', background: typeMeta.bg, color: typeMeta.color, border: `1px solid ${typeMeta.border}` }}>{typeMeta.icon} {typeMeta.label}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '10px', background: priMeta.bg, color: priMeta.color }}>{priMeta.dot} {priMeta.label}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, padding: '4px 12px', borderRadius: '10px', background: tcStatMeta.bg, color: tcStatMeta.color }}>
          {tcStatus === 'pass' ? '✅' : tcStatus === 'fail' ? '❌' : '⏳'} {tcStatMeta.label}
          {(savingStatus || savingExp) && <span style={{ marginLeft: '6px', fontSize: '10px', opacity: 0.6 }}>저장 중...</span>}
        </span>
      </div>

      {/* Progress bar */}
      {steps.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '5px' }}>
            <span>수행 진행률</span>
            <span style={{ fontWeight: 700 }}>{doneN}/{steps.length} · Pass {passN} · Fail {failN} · N/A {naN}</span>
          </div>
          <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', background: '#16A34A', width: `${(passN/steps.length)*100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#DC2626', width: `${(failN/steps.length)*100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#94A3B8', width: `${(naN/steps.length)*100}%`,   transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {/* 컬럼 헤더 */}
      {steps.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '6px', padding: '0 4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.07em' }}>테스트 단계</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.07em', paddingLeft: '14px' }}>기대 결과 <span style={{ fontSize: '10px', fontWeight: 400, color: '#94A3B8' }}>(✏️ 클릭하여 편집)</span></div>
        </div>
      )}

      {/* Step rows — 1:1 대응 2컬럼 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {steps.map((step, si) => {
          const ss  = stepStatuses[si]
          const st  = STEP_STYLE[ss]
          const exp = expectedTexts[si] ?? ''
          const isEditing = editingIdx === si

          return (
            <div key={si} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${st.border}` }}>

              {/* 좌: 단계 */}
              <div style={{ background: st.bg, borderLeft: `4px solid ${st.leftBorder}`, padding: '12px 14px', transition: 'background .15s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: st.numBg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                    {si + 1}
                  </div>
                  <div style={{ fontSize: '12px', color: '#1E293B', lineHeight: 1.6 }}>{step}</div>
                </div>
                {/* P / F / N/A 버튼 */}
                <div style={{ display: 'flex', gap: '5px', paddingLeft: '32px' }}>
                  {STEP_BTNS.map(btn => {
                    const active = ss === btn.val
                    return (
                      <button key={btn.val} onClick={() => setStep(si, btn.val)}
                        style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all .1s', border: `1.5px solid ${active ? btn.color : '#E2E8F0'}`, background: active ? btn.bg : 'white', color: active ? btn.color : '#94A3B8' }}
                      >
                        <span>{btn.icon}</span><span>{btn.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 우: 기대 결과 */}
              <div style={{ background: ss === 'pending' ? '#FAFBFF' : st.bg, borderLeft: `1px solid ${st.border}`, padding: '12px 14px', transition: 'background .15s' }}>
                {isEditing ? (
                  <div>
                    <textarea
                      autoFocus
                      value={editingVal}
                      onChange={e => setEditingVal(e.target.value)}
                      rows={4}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', lineHeight: 1.6, padding: '8px 10px', borderRadius: '6px', border: '2px solid var(--primary)', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingIdx(null)} className="btn btn-secondary btn-sm">취소</button>
                      <button onClick={() => saveExpected(si, editingVal)} className="btn btn-primary btn-sm">저장</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => { setEditingIdx(si); setEditingVal(exp) }}
                    style={{ cursor: 'text', minHeight: '48px', fontSize: '12px', color: exp ? '#1E293B' : '#94A3B8', lineHeight: 1.6, borderRadius: '6px', padding: '4px 6px', border: '1.5px dashed transparent', transition: 'border .1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'transparent'}
                  >
                    {exp || '기대 결과를 입력하세요...'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 결과 요약 */}
      {doneN > 0 && (
        <div style={{ marginTop: '16px', background: tcStatus === 'pass' ? '#F0FDF4' : tcStatus === 'fail' ? '#FFF1F2' : '#F8FAFC', border: `1px solid ${tcStatus === 'pass' ? '#86EFAC' : tcStatus === 'fail' ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: '10px', padding: '14px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '.06em' }}>수행 결과 요약</div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {[
              { label: 'Pass',   n: passN,               color: '#16A34A', bg: '#DCFCE7' },
              { label: 'Fail',   n: failN,               color: '#DC2626', bg: '#FEE2E2' },
              { label: 'N/A',    n: naN,                 color: '#64748B', bg: '#F1F5F9' },
              { label: '미수행', n: steps.length - doneN, color: '#94A3B8', bg: '#F8FAFC' },
            ].filter(r => r.n > 0).map(r => (
              <div key={r.label} style={{ textAlign: 'center', padding: '8px 12px', background: r.bg, borderRadius: '8px', flex: 1 }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: r.color }}>{r.n}</div>
                <div style={{ fontSize: '10px', color: r.color, marginTop: '2px', fontWeight: 600 }}>{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
