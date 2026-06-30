'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────
type TCType      = 'auto' | 'manual' | 'mixed'
type TCPriority  = 'critical' | 'high' | 'medium' | 'low'
type TCStatus    = 'pending' | 'pass' | 'fail'
type StepStatus  = 'pending' | 'pass' | 'fail' | 'na'
type CycleStatus = 'not_started' | 'in_progress' | 'done'

interface TestCase {
  id: number; title: string; module: string
  type: TCType; priority: TCPriority; status: TCStatus
  steps: string[] | string | null
  expected: string[] | string | null
}

interface TestCycle {
  id: number; plan_id: number; name: string; status: CycleStatus
  tcCount: number; passCount: number; failCount: number
}

interface TestPlan {
  id: number; name: string; cycles: TestCycle[]
}

interface CycleCase {
  id: number; test_case_id: number; cycle_status: StepStatus
  title: string; module: string
  type: TCType; priority: TCPriority
  steps: string[] | string | null
  expected: string[] | string | null
}

// ── Constants ───────────────────────────────────────────────────────────
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

const CYCLE_STATUS_META: Record<CycleStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  not_started: { label: '미시작', color: '#6B7280', bg: '#F3F4F6', border: '#D1D5DB', dot: '⚪' },
  in_progress: { label: '진행중', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', dot: '🔵' },
  done:        { label: '완료',   color: '#059669', bg: '#D1FAE5', border: '#6EE7B7', dot: '🟢' },
}

const CYCLE_CASE_META: Record<StepStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: '미수행', color: '#6B7280', bg: '#F3F4F6', icon: '○'  },
  pass:    { label: 'Pass',   color: '#059669', bg: '#D1FAE5', icon: '✓'  },
  fail:    { label: 'Fail',   color: '#DC2626', bg: '#FEE2E2', icon: '✗'  },
  na:      { label: 'N/A',    color: '#94A3B8', bg: '#F1F5F9', icon: '—'  },
}

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

// ── Helpers ─────────────────────────────────────────────────────────────
function parseSteps(raw: string[] | string | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [String(raw)] }
}

function parseExpected(raw: string[] | string | null, stepCount: number): string[] {
  let arr: string[] = []
  if (!raw) arr = []
  else if (Array.isArray(raw)) arr = raw
  else {
    try {
      const parsed = JSON.parse(raw)
      arr = Array.isArray(parsed) ? parsed : [String(parsed)]
    } catch { arr = [String(raw)] }
  }
  return Array.from({ length: stepCount }, (_, i) => arr[i] ?? '')
}

function splitModule(module: string): { parent: string; sub: string } {
  for (const sep of [' - ', ' – ', ' — ']) {
    const idx = module.indexOf(sep)
    if (idx > 0) return { parent: module.slice(0, idx).trim(), sub: module.slice(idx + sep.length).trim() }
  }
  return { parent: module, sub: '' }
}

// ── Main Page ────────────────────────────────────────────────────────────
export default function TCListPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // Base data
  const [projectId, setProjectId]   = useState<number | null>(null)
  const [tcs, setTcs]               = useState<TestCase[]>([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState('')

  // Library navigation
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [selectedSub, setSelectedSub]       = useState<string | null>(null)
  const [selectedTC, setSelectedTC]         = useState<TestCase | null>(null)

  // TC multi-select (for adding to cycle)
  const [selectedTCIds, setSelectedTCIds]   = useState<Set<number>>(new Set())
  const [showAddDropdown, setShowAddDropdown] = useState(false)
  const [addingToCycle, setAddingToCycle]   = useState(false)

  // Test plans & cycles
  const [testPlans, setTestPlans]             = useState<TestPlan[]>([])
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<number>>(new Set())
  const [showNewPlan, setShowNewPlan]         = useState(false)
  const [newPlanName, setNewPlanName]         = useState('')
  const [showNewCycleFor, setShowNewCycleFor] = useState<number | null>(null)
  const [newCycleName, setNewCycleName]       = useState('')
  const [planSaving, setPlanSaving]           = useState(false)

  // Cycle execution view
  const [activeCycle, setActiveCycle] = useState<TestCycle | null>(null)
  const [cycleItems, setCycleItems]   = useState<CycleCase[]>([])
  const [cycleLoading, setCycleLoading] = useState(false)
  const [cycleTC, setCycleTC]         = useState<CycleCase | null>(null)

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
    fetchPlans(pid)
  }, [])

  async function fetchTCs(pid: number) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/projects/${pid}/test-cases`)
      const data = await res.json()
      setTcs(data.testCases ?? [])
    } catch { setError('TC 불러오기 실패') }
    finally { setLoading(false) }
  }

  async function fetchPlans(pid: number) {
    try {
      const res  = await fetch(`/api/projects/${pid}/test-plans`)
      const data = await res.json()
      setTestPlans(data.plans ?? [])
    } catch {}
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

  async function createPlan() {
    if (!projectId || !newPlanName.trim()) return
    setPlanSaving(true)
    try {
      const res  = await fetch(`/api/projects/${projectId}/test-plans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlanName.trim() }),
      })
      const data = await res.json()
      setTestPlans(prev => [...prev, data.plan])
      setExpandedPlanIds(prev => new Set(Array.from(prev).concat(data.plan.id)))
      setNewPlanName(''); setShowNewPlan(false)
    } finally { setPlanSaving(false) }
  }

  async function createCycle(planId: number) {
    if (!projectId || !newCycleName.trim()) return
    setPlanSaving(true)
    try {
      const res  = await fetch(`/api/test-plans/${planId}/cycles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCycleName.trim(), projectId }),
      })
      const data = await res.json()
      setTestPlans(prev => prev.map(p =>
        p.id === planId ? { ...p, cycles: [...p.cycles, data.cycle] } : p
      ))
      setNewCycleName(''); setShowNewCycleFor(null)
    } finally { setPlanSaving(false) }
  }

  async function addToCycle(cycleId: number) {
    if (!selectedTCIds.size) return
    setAddingToCycle(true)
    try {
      await fetch(`/api/test-cycles/${cycleId}/cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tcIds: Array.from(selectedTCIds as Set<number>) }),
      })
      setSelectedTCIds(new Set())
      setShowAddDropdown(false)
      if (projectId) await fetchPlans(projectId)
    } finally { setAddingToCycle(false) }
  }

  async function openCycleRun(cycle: TestCycle) {
    setActiveCycle(cycle)
    setCycleLoading(true)
    try {
      const res  = await fetch(`/api/test-cycles/${cycle.id}/cases`)
      const data = await res.json()
      setCycleItems(data.cases ?? [])
    } finally { setCycleLoading(false) }
  }

  function toggleTC(tcId: number) {
    setSelectedTCIds(prev => {
      const next = new Set(prev)
      if (next.has(tcId)) next.delete(tcId); else next.add(tcId)
      return next
    })
  }

  // Derived data
  const parentMap: Record<string, Record<string, TestCase[]>> = {}
  for (const tc of tcs) {
    const { parent, sub } = splitModule(tc.module || '기타')
    const subKey = sub || '일반'
    if (!parentMap[parent]) parentMap[parent] = {}
    if (!parentMap[parent][subKey]) parentMap[parent][subKey] = []
    parentMap[parent][subKey].push(tc)
  }
  const parentList = Object.keys(parentMap)
  const allCycles  = testPlans.flatMap(p => p.cycles.map(c => ({ ...c, planName: p.name })))

  // ─── Library Breadcrumb ─────────────────────────────────────────────
  const LibBreadcrumb = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
      <button onClick={() => { setSelectedParent(null); setSelectedSub(null); setSelectedTC(null) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>
        🧪 TC 목록
      </button>
      {selectedParent && (
        <><span style={{ color: '#CBD5E1' }}>›</span>
          <button onClick={() => { setSelectedSub(null); setSelectedTC(null) }}
            style={{ background: 'none', border: 'none', padding: 0, cursor: selectedSub ? 'pointer' : 'default', color: selectedSub ? 'var(--primary)' : '#1E293B', fontWeight: 600 }}>
            📁 {selectedParent}
          </button>
        </>
      )}
      {selectedSub && (
        <><span style={{ color: '#CBD5E1' }}>›</span>
          <button onClick={() => setSelectedTC(null)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: selectedTC ? 'pointer' : 'default', color: selectedTC ? 'var(--primary)' : '#1E293B', fontWeight: 600 }}>
            📋 {selectedSub}
          </button>
        </>
      )}
      {selectedTC && (
        <><span style={{ color: '#CBD5E1' }}>›</span>
          <span style={{ color: '#1E293B', fontWeight: 600 }}>📄 {selectedTC.title}</span>
        </>
      )}
    </div>
  )

  // ─── "Add to Cycle" floating bar ────────────────────────────────────
  const SelectionBar = () => selectedTCIds.size > 0 ? (
    <div style={{
      position: 'sticky', top: '8px', zIndex: 10,
      background: '#1E293B', color: 'white', borderRadius: '10px',
      padding: '10px 16px', marginBottom: '12px',
      display: 'flex', alignItems: 'center', gap: '10px',
      boxShadow: '0 4px 24px rgba(0,0,0,.28)',
    }}>
      <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>✓ {selectedTCIds.size}개 선택됨</span>
      <div style={{ position: 'relative' }}>
        <button onClick={() => setShowAddDropdown(v => !v)} disabled={addingToCycle}
          style={{ fontSize: '12px', fontWeight: 700, padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#3B82F6', color: 'white', cursor: 'pointer' }}>
          {addingToCycle ? '추가 중...' : '사이클에 추가 ▾'}
        </button>
        {showAddDropdown && (
          <div style={{ position: 'absolute', top: '110%', right: 0, background: 'white', borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,.18)', border: '1px solid #E2E8F0', minWidth: '200px', zIndex: 20, overflow: 'hidden' }}>
            {allCycles.length === 0
              ? <div style={{ padding: '14px', fontSize: '12px', color: '#94A3B8', textAlign: 'center' }}>사이클이 없습니다<br/><span style={{ fontSize: '11px' }}>먼저 플랜과 사이클을 추가하세요</span></div>
              : allCycles.map(c => (
                <div key={c.id} onClick={() => addToCycle(c.id)}
                  style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#EFF6FF'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>{c.name}</div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{c.planName}</div>
                </div>
              ))
            }
          </div>
        )}
      </div>
      <button onClick={() => { setSelectedTCIds(new Set()); setShowAddDropdown(false) }}
        style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.3)', background: 'transparent', color: 'rgba(255,255,255,.8)', cursor: 'pointer' }}>
        선택 해제
      </button>
    </div>
  ) : null

  // ─── Test Plan Section ──────────────────────────────────────────────
  const PlanSection = () => (
    <div style={{ marginBottom: '18px', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', background: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', background: '#F8FAFC', borderBottom: testPlans.length > 0 ? '1px solid #E2E8F0' : 'none' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', letterSpacing: '.04em' }}>📐 테스트 플랜</div>
        <button onClick={() => setShowNewPlan(v => !v)}
          style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', background: 'white', cursor: 'pointer', color: '#374151' }}>
          + 새 플랜
        </button>
      </div>

      {/* New plan input */}
      {showNewPlan && (
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #E2E8F0', background: '#F0F9FF', display: 'flex', gap: '7px', alignItems: 'center' }}>
          <input autoFocus placeholder="플랜 이름 입력..." value={newPlanName}
            onChange={e => setNewPlanName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createPlan(); if (e.key === 'Escape') { setShowNewPlan(false); setNewPlanName('') } }}
            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1.5px solid #93C5FD', outline: 'none', fontSize: '13px' }}
          />
          <button onClick={createPlan} disabled={planSaving || !newPlanName.trim()} className="btn btn-primary btn-sm">확인</button>
          <button onClick={() => { setShowNewPlan(false); setNewPlanName('') }} className="btn btn-secondary btn-sm">취소</button>
        </div>
      )}

      {testPlans.length === 0 && !showNewPlan && (
        <div style={{ padding: '18px', textAlign: 'center', fontSize: '12px', color: '#9CA3AF' }}>
          테스트 플랜을 추가하면 사이클을 만들어 TC를 실행할 수 있습니다
        </div>
      )}

      {/* Plan accordion items */}
      {testPlans.map((plan, pi) => {
        const isExpanded = expandedPlanIds.has(plan.id)
        const isLast = pi === testPlans.length - 1
        return (
          <div key={plan.id} style={{ borderBottom: isLast && !isExpanded ? 'none' : '1px solid #F1F5F9' }}>
            {/* Plan header row */}
            <div onClick={() => setExpandedPlanIds(prev => { const n = new Set(prev); n.has(plan.id) ? n.delete(plan.id) : n.add(plan.id); return n })}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', cursor: 'pointer', background: isExpanded ? '#F0F9FF' : 'white', transition: 'background .12s', userSelect: 'none' }}>
              <span style={{ fontSize: '9px', color: '#94A3B8', transition: 'transform .18s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: '#1E293B' }}>{plan.name}</span>
              <span style={{ fontSize: '11px', color: '#94A3B8' }}>{plan.cycles.length}개 사이클</span>
              <button onClick={e => { e.stopPropagation(); setShowNewCycleFor(plan.id); setExpandedPlanIds(prev => new Set(Array.from(prev).concat(plan.id))) }}
                style={{ fontSize: '10px', fontWeight: 600, padding: '3px 9px', borderRadius: '5px', border: '1px solid #D1D5DB', background: 'white', cursor: 'pointer', color: '#6B7280', flexShrink: 0 }}>
                + 사이클
              </button>
            </div>

            {/* Cycles (expanded) */}
            {isExpanded && (
              <div style={{ background: '#FAFBFF', borderTop: '1px solid #EEF2FF' }}>
                {plan.cycles.length === 0 && showNewCycleFor !== plan.id && (
                  <div style={{ padding: '10px 20px', fontSize: '11px', color: '#9CA3AF' }}>사이클이 없습니다. + 사이클 버튼을 눌러 추가하세요.</div>
                )}
                {plan.cycles.map((cycle, ci) => {
                  const csm = CYCLE_STATUS_META[cycle.status] ?? CYCLE_STATUS_META.not_started
                  const pct = cycle.tcCount > 0 ? Math.round((cycle.passCount + cycle.failCount) / cycle.tcCount * 100) : 0
                  const isLastCycle = ci === plan.cycles.length - 1
                  return (
                    <div key={cycle.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 16px 9px 28px', borderBottom: isLastCycle && showNewCycleFor !== plan.id ? 'none' : '1px solid #EEF2FF' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: csm.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cycle.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                          <span style={{ fontSize: '10px', color: '#94A3B8' }}>{cycle.tcCount} TC</span>
                          {cycle.tcCount > 0 && (
                            <div style={{ height: '4px', width: '48px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
                              <div style={{ height: '100%', background: cycle.failCount > 0 ? '#DC2626' : '#16A34A', width: `${pct}%`, transition: 'width .3s' }} />
                            </div>
                          )}
                          {cycle.tcCount > 0 && <span style={{ fontSize: '10px', color: '#94A3B8' }}>{pct}%</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: csm.bg, color: csm.color, border: `1px solid ${csm.border}`, flexShrink: 0 }}>
                        {csm.label}
                      </span>
                      <button onClick={() => openCycleRun(cycle)}
                        style={{ fontSize: '11px', fontWeight: 600, padding: '4px 11px', borderRadius: '6px', border: '1px solid #3B82F6', background: '#EFF6FF', cursor: 'pointer', color: '#2563EB', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        실행 →
                      </button>
                    </div>
                  )
                })}
                {/* New cycle input */}
                {showNewCycleFor === plan.id && (
                  <div style={{ padding: '9px 16px 9px 28px', display: 'flex', gap: '7px', alignItems: 'center', borderTop: plan.cycles.length > 0 ? '1px solid #EEF2FF' : 'none' }}>
                    <input autoFocus placeholder="사이클 이름..." value={newCycleName}
                      onChange={e => setNewCycleName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') createCycle(plan.id); if (e.key === 'Escape') { setShowNewCycleFor(null); setNewCycleName('') } }}
                      style={{ flex: 1, padding: '5px 9px', borderRadius: '6px', border: '1.5px solid #93C5FD', outline: 'none', fontSize: '12px' }}
                    />
                    <button onClick={() => createCycle(plan.id)} disabled={planSaving || !newCycleName.trim()} className="btn btn-primary btn-sm">확인</button>
                    <button onClick={() => { setShowNewCycleFor(null); setNewCycleName('') }} className="btn btn-secondary btn-sm">취소</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════
  // RENDER DECISIONS
  // ═══════════════════════════════════════════════════════════════════

  // ① Cycle TC step detail
  if (cycleTC && activeCycle) {
    const { parent, sub } = splitModule(cycleTC.module || '기타')
    return (
      <TCStepDetail
        tc={cycleTC as unknown as TestCase}
        breadcrumb={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
            <button onClick={() => { setActiveCycle(null); setCycleItems([]); setCycleTC(null) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>
              🧪 TC 목록
            </button>
            <span style={{ color: '#CBD5E1' }}>›</span>
            <button onClick={() => setCycleTC(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>
              📋 {activeCycle.name}
            </button>
            <span style={{ color: '#CBD5E1' }}>›</span>
            <span style={{ color: '#1E293B', fontWeight: 600 }}>📄 {cycleTC.title}</span>
          </div>
        }
        onBack={() => setCycleTC(null)}
        onStatusChange={newStatus => {
          setCycleItems(prev => prev.map(item =>
            item.id === cycleTC.id ? { ...item, cycle_status: newStatus as StepStatus } : item
          ))
        }}
        selectedParent={parent}
        selectedSub={sub}
        cycleItemId={cycleTC.id}
      />
    )
  }

  // ② Cycle execution view
  if (activeCycle) {
    const plan = testPlans.find(p => p.cycles.some(c => c.id === activeCycle.id))
    return (
      <CycleRunView
        cycle={activeCycle}
        planName={plan?.name}
        items={cycleItems}
        loading={cycleLoading}
        onBack={() => { setActiveCycle(null); setCycleItems([]) }}
        onRunTC={setCycleTC}
        onStatusChange={(itemId, status) =>
          setCycleItems(prev => prev.map(i => i.id === itemId ? { ...i, cycle_status: status } : i))
        }
      />
    )
  }

  // ③ Library TC step detail
  if (selectedTC) {
    return (
      <TCStepDetail
        tc={selectedTC}
        breadcrumb={<LibBreadcrumb />}
        onBack={() => setSelectedTC(null)}
        onStatusChange={newStatus => {
          setTcs(prev => prev.map(t => t.id === selectedTC.id ? { ...t, status: newStatus } : t))
          setSelectedTC(prev => prev ? { ...prev, status: newStatus } : prev)
        }}
        selectedParent={selectedParent ?? ''}
        selectedSub={selectedSub ?? ''}
      />
    )
  }

  // ────────────────────────────────────────────────────────────────────
  // ④ LIBRARY VIEWS (Level 1 / 2 / 3)
  // ────────────────────────────────────────────────────────────────────

  // Level 2 — sub-module list
  if (selectedParent && !selectedSub) {
    const subs    = parentMap[selectedParent] ?? {}
    const subList = Object.keys(subs)
    return (
      <>
        <LibBreadcrumb />
        <SelectionBar />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>📁 {selectedParent}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>세부 항목 선택 · {subList.length}개</div>
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
              <div key={sub} onClick={() => setSelectedSub(sub)}
                style={{ border: '1px solid var(--gray-200)', borderRadius: '10px', padding: '14px 18px', background: 'white', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '12px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.background = '#FAFBFF' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray-200)'; (e.currentTarget as HTMLElement).style.background = 'white' }}>
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

  // Level 3 — TC list with checkboxes
  if (selectedParent && selectedSub) {
    const subTCs = parentMap[selectedParent]?.[selectedSub] ?? []
    return (
      <>
        <LibBreadcrumb />
        <SelectionBar />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>📁 {selectedParent}</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>📋 {selectedSub}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>TC 클릭 → 단계 확인 · 체크박스 → 사이클 추가 · {subTCs.length}개</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelectedSub(null)}>← 뒤로</button>
        </div>
        <div style={{ border: '1px solid var(--gray-200)', borderRadius: '10px', overflow: 'hidden' }}>
          {subTCs.map((tc, idx) => {
            const typeMeta = TYPE_META[tc.type]         ?? TYPE_META.manual
            const priMeta  = PRIORITY_META[tc.priority] ?? PRIORITY_META.medium
            const statMeta = STATUS_META[tc.status]     ?? STATUS_META.pending
            const isLast   = idx === subTCs.length - 1
            const isSel    = selectedTCIds.has(tc.id)
            return (
              <div key={tc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: isSel ? '#EFF6FF' : 'white', transition: 'background .1s', borderBottom: isLast ? 'none' : '1px solid #F1F5F9' }}>
                {/* Checkbox */}
                <div onClick={e => { e.stopPropagation(); toggleTC(tc.id) }}
                  style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSel ? '#3B82F6' : '#D1D5DB'}`, background: isSel ? '#3B82F6' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSel && <span style={{ color: 'white', fontSize: '11px', fontWeight: 700 }}>✓</span>}
                </div>
                {/* TC row */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} onClick={() => setSelectedTC(tc)}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#64748B', flexShrink: 0 }}>
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
              </div>
            )
          })}
        </div>
      </>
    )
  }

  // Level 1 — parent module list (+ Plan section at top)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <div className="page-title">🧪 TC 목록</div>
          <div className="page-subtitle">테스트 플랜·사이클을 관리하거나 모듈을 선택하세요</div>
        </div>
        {projectId && (
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={generateTCs} disabled={generating}>
            {generating ? '⏳ 생성 중...' : '🔄 TC 재생성'}
          </button>
        )}
      </div>

      <PlanSection />

      <SelectionBar />

      {/* TC stats */}
      {tcs.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: '#F3F4F6', color: '#374151' }}>전체 {tcs.length}개</span>
          <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 12px', borderRadius: '20px', background: '#F3F4F6', color: '#6B7280' }}>{parentList.length}개 모듈</span>
          {tcs.filter(t => t.status === 'pass').length > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: '#D1FAE5', color: '#059669' }}>Pass {tcs.filter(t => t.status === 'pass').length}</span>}
          {tcs.filter(t => t.status === 'fail').length > 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 12px', borderRadius: '20px', background: '#FEE2E2', color: '#DC2626' }}>Fail {tcs.filter(t => t.status === 'fail').length}</span>}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>❌ {error}</div>}

      {loading ? (
        <div className="card"><div className="empty-state" style={{ padding: '50px 24px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div className="empty-state-text">불러오는 중...</div>
        </div></div>
      ) : !projectId ? (
        <div className="card"><div className="empty-state" style={{ padding: '50px 24px' }}>
          <div className="empty-state-icon">📄</div>
          <div className="empty-state-text">기획서가 없습니다</div>
          <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={() => router.push('/upload')}>기획서 업로드 →</button>
        </div></div>
      ) : tcs.length === 0 ? (
        <div className="card"><div className="empty-state" style={{ padding: '50px 24px' }}>
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
              <div key={parent} onClick={() => setSelectedParent(parent)}
                style={{ border: '1px solid var(--gray-200)', borderRadius: '12px', padding: '16px 18px', background: 'white', cursor: 'pointer', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: '14px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(79,70,229,.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--gray-200)'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
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
}

// ═══════════════════════════════════════════════════════════════════════
// CycleRunView
// ═══════════════════════════════════════════════════════════════════════
function CycleRunView({
  cycle, planName, items, loading, onBack, onRunTC, onStatusChange,
}: {
  cycle: TestCycle
  planName?: string
  items: CycleCase[]
  loading: boolean
  onBack: () => void
  onRunTC: (item: CycleCase) => void
  onStatusChange: (itemId: number, status: StepStatus) => void
}) {
  const passN  = items.filter(i => i.cycle_status === 'pass').length
  const failN  = items.filter(i => i.cycle_status === 'fail').length
  const naN    = items.filter(i => i.cycle_status === 'na').length
  const doneN  = passN + failN + naN
  const csm    = CYCLE_STATUS_META[cycle.status] ?? CYCLE_STATUS_META.not_started

  return (
    <>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px', fontSize: '13px', flexWrap: 'wrap' }}>
        <button onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>
          🧪 TC 목록
        </button>
        {planName && <><span style={{ color: '#CBD5E1' }}>›</span><span style={{ color: '#64748B', fontWeight: 500 }}>📐 {planName}</span></>}
        <span style={{ color: '#CBD5E1' }}>›</span>
        <span style={{ fontWeight: 600, color: '#1E293B' }}>📋 {cycle.name}</span>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '18px', color: '#1E293B' }}>{cycle.name}</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: csm.bg, color: csm.color, border: `1px solid ${csm.border}` }}>{csm.label}</span>
            <span style={{ fontSize: '11px', color: '#64748B' }}>{items.length}개 TC</span>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← 뒤로</button>
      </div>

      {/* Progress bar */}
      {items.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '5px' }}>
            <span>사이클 진행률</span>
            <span style={{ fontWeight: 700 }}>{doneN}/{items.length} · Pass {passN} · Fail {failN} · N/A {naN}</span>
          </div>
          <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', background: '#16A34A', width: `${(passN / items.length) * 100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#DC2626', width: `${(failN / items.length) * 100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#94A3B8', width: `${(naN  / items.length) * 100}%`, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {/* TC list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '13px' }}>불러오는 중...</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '13px' }}>
          이 사이클에 추가된 TC가 없습니다<br />
          <span style={{ fontSize: '11px' }}>TC 목록에서 TC를 선택 후 이 사이클에 추가하세요</span>
        </div>
      ) : (
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          {items.map((item, idx) => {
            const typeMeta = TYPE_META[item.type]         ?? TYPE_META.manual
            const priMeta  = PRIORITY_META[item.priority] ?? PRIORITY_META.medium
            const ccm      = CYCLE_CASE_META[item.cycle_status] ?? CYCLE_CASE_META.pending
            const isLast   = idx === items.length - 1
            const { parent } = splitModule(item.module || '기타')
            return (
              <div key={item.id}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'white', borderBottom: isLast ? 'none' : '1px solid #F1F5F9', transition: 'background .1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#F8FAFC'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                {/* Status icon */}
                <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: ccm.bg, color: ccm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                  {ccm.icon}
                </div>
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>
                    <span style={{ fontFamily: 'monospace' }}>TC-{String(item.test_case_id).padStart(3, '0')}</span>
                    {parent ? ` · ${parent}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '8px', background: typeMeta.bg, color: typeMeta.color, border: `1px solid ${typeMeta.border}`, flexShrink: 0 }}>{typeMeta.icon}</span>
                <span style={{ fontSize: '11px', color: priMeta.color, fontWeight: 700, flexShrink: 0 }}>{priMeta.dot}</span>
                <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: ccm.bg, color: ccm.color, flexShrink: 0, whiteSpace: 'nowrap' }}>{ccm.label}</span>
                <button onClick={() => onRunTC(item)}
                  style={{ fontSize: '11px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px', border: '1px solid #3B82F6', background: '#EFF6FF', cursor: 'pointer', color: '#2563EB', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  단계 실행 →
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TCStepDetail  (library + cycle-run mode 공용)
// ═══════════════════════════════════════════════════════════════════════
function TCStepDetail({
  tc, onBack, onStatusChange, breadcrumb, selectedParent, selectedSub, cycleItemId,
}: {
  tc: TestCase
  onBack: () => void
  onStatusChange: (s: TCStatus) => void
  breadcrumb: ReactNode
  selectedParent: string
  selectedSub: string
  cycleItemId?: number
}) {
  const steps   = parseSteps(tc.steps)
  const initExp = parseExpected(tc.expected, steps.length)

  const [stepStatuses,  setStepStatuses]  = useState<StepStatus[]>(() => steps.map(() => 'pending'))
  const [expectedTexts, setExpectedTexts] = useState<string[]>(initExp)
  const [editingIdx,    setEditingIdx]    = useState<number | null>(null)
  const [editingVal,    setEditingVal]    = useState('')
  const [savingStatus,  setSavingStatus]  = useState(false)
  const [savingExp,     setSavingExp]     = useState(false)

  const typeMeta = TYPE_META[tc.type]         ?? TYPE_META.manual
  const priMeta  = PRIORITY_META[tc.priority] ?? PRIORITY_META.medium

  const passN = stepStatuses.filter(s => s === 'pass').length
  const failN = stepStatuses.filter(s => s === 'fail').length
  const naN   = stepStatuses.filter(s => s === 'na').length
  const doneN = passN + failN + naN

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
      if (cycleItemId) {
        await fetch(`/api/test-cycle-cases/${cycleItemId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: tcStatus }),
        })
      } else {
        await fetch(`/api/tc/${tc.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: tcStatus }),
        })
      }
      onStatusChange(tcStatus)
    } finally { setSavingStatus(false) }
  }

  async function saveExpected(idx: number, val: string) {
    const next = expectedTexts.map((e, i) => i === idx ? val : e)
    setExpectedTexts(next)
    setEditingIdx(null)
    setSavingExp(true)
    try {
      await fetch(`/api/tc/${tc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected: next }),
      })
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
          <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '3px' }}>📁 {selectedParent} {selectedSub ? `· 📋 ${selectedSub}` : ''}</div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>{tc.title}</div>
          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '3px', fontFamily: 'monospace' }}>TC-{String(tc.id).padStart(3, '0')}{cycleItemId ? ' · 사이클 실행 중' : ''}</div>
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

      {/* Progress */}
      {steps.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '5px' }}>
            <span>수행 진행률</span>
            <span style={{ fontWeight: 700 }}>{doneN}/{steps.length} · Pass {passN} · Fail {failN} · N/A {naN}</span>
          </div>
          <div style={{ height: '8px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', background: '#16A34A', width: `${(passN / steps.length) * 100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#DC2626', width: `${(failN / steps.length) * 100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#94A3B8', width: `${(naN  / steps.length) * 100}%`, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {/* Column headers */}
      {steps.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '6px', padding: '0 4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.07em' }}>테스트 단계</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.07em', paddingLeft: '14px' }}>
            기대 결과 <span style={{ fontSize: '10px', fontWeight: 400, color: '#94A3B8' }}>(클릭하여 편집)</span>
          </div>
        </div>
      )}

      {/* Step rows — 1:1 mapping */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {steps.map((step, si) => {
          const ss  = stepStatuses[si]
          const st  = STEP_STYLE[ss]
          const exp = expectedTexts[si] ?? ''
          const isEditing = editingIdx === si
          return (
            <div key={si} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${st.border}` }}>
              {/* Left: step */}
              <div style={{ background: st.bg, borderLeft: `4px solid ${st.leftBorder}`, padding: '12px 14px', transition: 'background .15s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
                  <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: st.numBg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                    {si + 1}
                  </div>
                  <div style={{ fontSize: '12px', color: '#1E293B', lineHeight: 1.6 }}>{step}</div>
                </div>
                <div style={{ display: 'flex', gap: '5px', paddingLeft: '32px' }}>
                  {STEP_BTNS.map(btn => {
                    const active = ss === btn.val
                    return (
                      <button key={btn.val} onClick={() => setStep(si, btn.val)}
                        style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 9px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all .1s', border: `1.5px solid ${active ? btn.color : '#E2E8F0'}`, background: active ? btn.bg : 'white', color: active ? btn.color : '#94A3B8' }}>
                        <span>{btn.icon}</span><span>{btn.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              {/* Right: expected result */}
              <div style={{ background: ss === 'pending' ? '#FAFBFF' : st.bg, borderLeft: `1px solid ${st.border}`, padding: '12px 14px', transition: 'background .15s' }}>
                {isEditing ? (
                  <div>
                    <textarea autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)} rows={4}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', lineHeight: 1.6, padding: '8px 10px', borderRadius: '6px', border: '2px solid var(--primary)', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingIdx(null)} className="btn btn-secondary btn-sm">취소</button>
                      <button onClick={() => saveExpected(si, editingVal)} className="btn btn-primary btn-sm">저장</button>
                    </div>
                  </div>
                ) : (
                  <div onClick={() => { setEditingIdx(si); setEditingVal(exp) }}
                    style={{ cursor: 'text', minHeight: '48px', fontSize: '12px', color: exp ? '#1E293B' : '#94A3B8', lineHeight: 1.6, borderRadius: '6px', padding: '4px 6px', border: '1.5px dashed transparent', transition: 'border .1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'transparent'}>
                    {exp || '기대 결과를 입력하세요...'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Result summary */}
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
