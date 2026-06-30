'use client'

import { useState, useEffect, useRef, type ReactNode, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────
type TCType      = 'auto' | 'manual' | 'mixed'
type TCPriority  = 'critical' | 'high' | 'medium' | 'low'
type StepStatus  = 'pending' | 'pass' | 'fail' | 'na'
type CycleStatus = 'not_started' | 'in_progress' | 'done'

interface TestCase {
  id: number; title: string; module: string
  type: TCType; priority: TCPriority
  steps: string[] | string | null
  expected: string[] | string | null
}
interface TestCycle {
  id: number; plan_id: number; name: string; status: CycleStatus
  tcCount: number; passCount: number; failCount: number
}
interface TestPlan { id: number; name: string; cycles: TestCycle[] }
interface CycleCase {
  id: number; test_case_id: number; cycle_status: StepStatus
  title: string; module: string
  type: TCType; priority: TCPriority
  steps: string[] | string | null
  expected: string[] | string | null
}

// ── Constants ──────────────────────────────────────────────────────────
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
const CYCLE_STATUS_META: Record<CycleStatus, { label: string; color: string; bg: string; border: string }> = {
  not_started: { label: '미시작', color: '#6B7280', bg: '#F3F4F6', border: '#D1D5DB' },
  in_progress: { label: '진행중', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  done:        { label: '완료',   color: '#059669', bg: '#D1FAE5', border: '#6EE7B7' },
}
const CYCLE_CASE_META: Record<StepStatus, { label: string; color: string; bg: string; icon: string }> = {
  pending: { label: '미수행', color: '#6B7280', bg: '#F3F4F6', icon: '○' },
  pass:    { label: 'Pass',   color: '#059669', bg: '#D1FAE5', icon: '✓' },
  fail:    { label: 'Fail',   color: '#DC2626', bg: '#FEE2E2', icon: '✗' },
  na:      { label: 'N/A',    color: '#94A3B8', bg: '#F1F5F9', icon: '—' },
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

// ── Helpers ────────────────────────────────────────────────────────────
function parseSteps(raw: string[] | string | null): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [String(raw)] }
}
function parseExpected(raw: string[] | string | null, stepCount: number): string[] {
  let arr: string[] = []
  if (!raw) arr = []
  else if (Array.isArray(raw)) arr = raw
  else { try { const p = JSON.parse(raw); arr = Array.isArray(p) ? p : [String(p)] } catch { arr = [String(raw)] } }
  return Array.from({ length: stepCount }, (_, i) => arr[i] ?? '')
}
function splitModule(module: string): { parent: string; sub: string } {
  for (const sep of [' - ', ' – ', ' — ']) {
    const idx = module.indexOf(sep)
    if (idx > 0) return { parent: module.slice(0, idx).trim(), sub: module.slice(idx + sep.length).trim() }
  }
  return { parent: module, sub: '' }
}
function tcNeedsReview(tc: TestCase): boolean {
  const steps = parseSteps(tc.steps)
  if (steps.length === 0) return false
  return parseExpected(tc.expected, steps.length).some(e => !e.trim())
}

// ── IndeterminateCheckbox ──────────────────────────────────────────────
function ICheckbox({ checked, indeterminate, onChange }: {
  checked: boolean; indeterminate: boolean; onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return (
    <input ref={ref} type="checkbox" checked={checked} onChange={onChange}
      style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#3B82F6', flexShrink: 0 }} />
  )
}

// ── Main page ──────────────────────────────────────────────────────────
function TCListPageContent() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  // Base
  const [projectId, setProjectId]   = useState<number | null>(null)
  const [tcs, setTcs]               = useState<TestCase[]>([])
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState('')

  // Library navigation
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [selectedSub, setSelectedSub]       = useState<string | null>(null)
  const [selectedTC, setSelectedTC]         = useState<TestCase | null>(null)

  // Library multi-select (for adding to cycle)
  const [selectedTCIds, setSelectedTCIds]     = useState<Set<number>>(new Set())
  const [showAddDropdown, setShowAddDropdown] = useState(false)
  const [addingToCycle, setAddingToCycle]     = useState(false)
  const [showCreateCycle, setShowCreateCycle]     = useState(false)
  const [createCycleName, setCreateCycleName]     = useState('')
  const [createCyclePlanId, setCreateCyclePlanId] = useState<number | 'new' | null>(null)
  const [createNewPlanName, setCreateNewPlanName] = useState('')
  const [creatingCycle, setCreatingCycle]         = useState(false)

  // Plans & cycles
  const [testPlans, setTestPlans]             = useState<TestPlan[]>([])
  const [expandedPlanIds, setExpandedPlanIds] = useState<Set<number>>(new Set())
  const [showNewPlan, setShowNewPlan]         = useState(false)
  const [newPlanName, setNewPlanName]         = useState('')
  const [showNewCycleFor, setShowNewCycleFor] = useState<number | null>(null)
  const [newCycleName, setNewCycleName]       = useState('')
  const [planSaving, setPlanSaving]           = useState(false)

  // Cycle execution
  const [activeCycle, setActiveCycle]   = useState<TestCycle | null>(null)
  const [cycleItems, setCycleItems]     = useState<CycleCase[]>([])
  const [cycleLoading, setCycleLoading] = useState(false)
  const [cycleTC, setCycleTC]           = useState<CycleCase | null>(null)

  // Cycle bulk-select
  const [selCycleIds, setSelCycleIds]   = useState<Set<number>>(new Set())
  const lastCycleIdxRef                 = useRef<number | null>(null)
  const [bulkActing, setBulkActing]     = useState(false)

  // Add TC to cycle panel
  const [addTCToCycle, setAddTCToCycle]         = useState<TestCycle | null>(null)
  const [addFromRun, setAddFromRun]             = useState(false)
  const [addBrowseParent, setAddBrowseParent]   = useState<string | null>(null)
  const [addBrowseSub, setAddBrowseSub]         = useState<string | null>(null)
  const [addSelectIds, setAddSelectIds]         = useState<Set<number>>(new Set())
  const [existingCycleIds, setExistingCycleIds] = useState<Set<number>>(new Set())
  const [addingCycleTCs, setAddingCycleTCs]     = useState(false)

  useEffect(() => {
    const urlPid = searchParams.get('projectId')
    const pid = urlPid
      ? Number(urlPid)
      : localStorage.getItem('testflow_project_id')
        ? Number(localStorage.getItem('testflow_project_id'))
        : null
    setProjectId(pid)
    if (!pid) { setLoading(false); return }
    fetchTCs(pid); fetchPlans(pid)
  }, [])

  async function fetchTCs(pid: number) {
    setLoading(true)
    try { const d = await (await fetch(`/api/projects/${pid}/test-cases`)).json(); setTcs(d.testCases ?? []) }
    catch { setError('TC 불러오기 실패') } finally { setLoading(false) }
  }
  async function fetchPlans(pid: number) {
    try { const d = await (await fetch(`/api/projects/${pid}/test-plans`)).json(); setTestPlans(d.plans ?? []) } catch {}
  }
  async function generateTCs() {
    if (!projectId) return
    setGenerating(true); setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-tc`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'TC 생성 실패')
      await fetchTCs(projectId)
    } catch (e) { setError(String(e)) } finally { setGenerating(false) }
  }
  async function createPlan() {
    if (!projectId || !newPlanName.trim()) return
    setPlanSaving(true)
    try {
      const d = await (await fetch(`/api/projects/${projectId}/test-plans`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPlanName.trim() }),
      })).json()
      setTestPlans(prev => [...prev, d.plan])
      setExpandedPlanIds(prev => new Set(Array.from(prev).concat(d.plan.id)))
      setNewPlanName(''); setShowNewPlan(false)
    } finally { setPlanSaving(false) }
  }
  async function createCycleUnderPlan(planId: number) {
    if (!projectId || !newCycleName.trim()) return
    setPlanSaving(true)
    try {
      const d = await (await fetch(`/api/test-plans/${planId}/cycles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCycleName.trim(), projectId }),
      })).json()
      setTestPlans(prev => prev.map(p => p.id === planId ? { ...p, cycles: [...p.cycles, d.cycle] } : p))
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
      setSelectedTCIds(new Set()); setShowAddDropdown(false)
      if (projectId) await fetchPlans(projectId)
    } finally { setAddingToCycle(false) }
  }
  async function handleCreateCycleWithTCs() {
    if (!projectId || !createCycleName.trim()) return
    setCreatingCycle(true)
    try {
      let planId: number
      if (createCyclePlanId === 'new') {
        if (!createNewPlanName.trim()) return
        const pd = await (await fetch(`/api/projects/${projectId}/test-plans`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: createNewPlanName.trim() }),
        })).json()
        planId = pd.plan.id
        setTestPlans(prev => [...prev, pd.plan])
      } else if (typeof createCyclePlanId === 'number') { planId = createCyclePlanId }
      else return
      const cd = await (await fetch(`/api/test-plans/${planId}/cycles`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createCycleName.trim(), projectId }),
      })).json()
      await fetch(`/api/test-cycles/${cd.cycle.id}/cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tcIds: Array.from(selectedTCIds as Set<number>) }),
      })
      await fetchPlans(projectId)
      await openCycleRun({ ...cd.cycle, tcCount: selectedTCIds.size, passCount: 0, failCount: 0 })
      setSelectedTCIds(new Set()); setShowCreateCycle(false); setCreateCycleName(''); setCreateCyclePlanId(null); setCreateNewPlanName('')
    } finally { setCreatingCycle(false) }
  }
  async function openCycleRun(cycle: TestCycle) {
    setActiveCycle(cycle); setCycleLoading(true); setSelCycleIds(new Set()); lastCycleIdxRef.current = null
    try { const d = await (await fetch(`/api/test-cycles/${cycle.id}/cases`)).json(); setCycleItems(d.cases ?? []) }
    finally { setCycleLoading(false) }
  }
  async function openAddTCPanel(cycle: TestCycle, fromRun = false) {
    try {
      const d = await (await fetch(`/api/test-cycles/${cycle.id}/cases`)).json()
      setExistingCycleIds(new Set<number>((d.cases ?? []).map((c: CycleCase) => c.test_case_id as number)))
    } catch { setExistingCycleIds(new Set()) }
    setAddTCToCycle(cycle); setAddFromRun(fromRun)
    setAddSelectIds(new Set()); setAddBrowseParent(null); setAddBrowseSub(null)
  }
  async function addSelectedToCycle() {
    if (!addTCToCycle || !addSelectIds.size) return
    setAddingCycleTCs(true)
    try {
      await fetch(`/api/test-cycles/${addTCToCycle.id}/cases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tcIds: Array.from(addSelectIds as Set<number>) }),
      })
      setExistingCycleIds(prev => new Set(Array.from(prev).concat(Array.from(addSelectIds as Set<number>))))
      setAddSelectIds(new Set())
      if (activeCycle?.id === addTCToCycle.id) {
        const d = await (await fetch(`/api/test-cycles/${addTCToCycle.id}/cases`)).json()
        setCycleItems(d.cases ?? [])
      }
      if (projectId) await fetchPlans(projectId)
    } finally { setAddingCycleTCs(false) }
  }

  // ── Cycle bulk select helpers ──────────────────────────────────────
  function handleCycleCaseClick(itemId: number, flatIdx: number, shiftKey: boolean) {
    if (shiftKey && lastCycleIdxRef.current !== null) {
      const lo = Math.min(lastCycleIdxRef.current, flatIdx)
      const hi = Math.max(lastCycleIdxRef.current, flatIdx)
      const rangeIds = cycleItems.slice(lo, hi + 1).map(i => i.id)
      setSelCycleIds(prev => new Set(Array.from(prev).concat(rangeIds)))
    } else {
      setSelCycleIds(prev => { const n = new Set(prev); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n })
      lastCycleIdxRef.current = flatIdx
    }
  }
  function toggleModuleGroup(ids: number[], allSelected: boolean) {
    setSelCycleIds(prev => {
      const n = new Set(prev)
      if (allSelected) ids.forEach(id => n.delete(id)); else ids.forEach(id => n.add(id))
      return n
    })
  }
  async function bulkUpdateStatus(status: StepStatus) {
    if (!selCycleIds.size) return
    setBulkActing(true)
    try {
      await Promise.all(Array.from(selCycleIds as Set<number>).map(id =>
        fetch(`/api/test-cycle-cases/${id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
      ))
      setCycleItems(prev => prev.map(i => (selCycleIds as Set<number>).has(i.id) ? { ...i, cycle_status: status } : i))
      setSelCycleIds(new Set())
      if (projectId) await fetchPlans(projectId)
    } finally { setBulkActing(false) }
  }

  function toggleAddTC(tcId: number) {
    if (existingCycleIds.has(tcId)) return
    setAddSelectIds(prev => { const n = new Set(prev); n.has(tcId) ? n.delete(tcId) : n.add(tcId); return n })
  }
  function toggleAllInAdd(tcs: TestCase[]) {
    const selectable = tcs.filter(t => !existingCycleIds.has(t.id))
    const allSel = selectable.length > 0 && selectable.every(t => addSelectIds.has(t.id))
    setAddSelectIds(prev => {
      const n = new Set(prev)
      if (allSel) selectable.forEach(t => n.delete(t.id))
      else selectable.forEach(t => n.add(t.id))
      return n
    })
  }
  function toggleTC(tcId: number) {
    setSelectedTCIds(prev => { const n = new Set(prev); n.has(tcId) ? n.delete(tcId) : n.add(tcId); return n })
  }

  // Derived
  const parentMap: Record<string, Record<string, TestCase[]>> = {}
  for (const tc of tcs) {
    const { parent, sub } = splitModule(tc.module || '기타')
    const subKey = sub || '일반'
    if (!parentMap[parent]) parentMap[parent] = {}
    if (!parentMap[parent][subKey]) parentMap[parent][subKey] = []
    parentMap[parent][subKey].push(tc)
  }
  const parentList  = Object.keys(parentMap)
  const allCycles   = testPlans.flatMap(p => p.cycles.map(c => ({ ...c, planName: p.name })))
  const reviewCount = tcs.filter(tcNeedsReview).length

  // ── SelectionBar (library → cycle) ────────────────────────────────
  const SelectionBar = () => selectedTCIds.size === 0 ? null : (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ position: 'sticky', top: '8px', zIndex: 10, background: '#1E293B', color: 'white', borderRadius: showCreateCycle ? '10px 10px 0 0' : '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 24px rgba(0,0,0,.28)' }}>
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>✓ {selectedTCIds.size}개 선택됨</span>
        <button onClick={() => { setShowCreateCycle(v => !v); setShowAddDropdown(false) }}
          style={{ fontSize: '12px', fontWeight: 700, padding: '6px 14px', borderRadius: '7px', border: 'none', background: '#3B82F6', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          + 새 사이클 만들기
        </button>
        <div style={{ position: 'relative' }}>
          <button onClick={() => { setShowAddDropdown(v => !v); setShowCreateCycle(false) }}
            style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '7px', border: '1px solid rgba(255,255,255,.3)', background: 'transparent', color: 'white', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            기존 사이클에 추가 ▾
          </button>
          {showAddDropdown && (
            <div style={{ position: 'absolute', top: '110%', right: 0, background: 'white', borderRadius: '8px', boxShadow: '0 8px 30px rgba(0,0,0,.18)', border: '1px solid #E2E8F0', minWidth: '200px', zIndex: 20, overflow: 'hidden' }}>
              {allCycles.length === 0
                ? <div style={{ padding: '14px', fontSize: '12px', color: '#94A3B8', textAlign: 'center' }}>사이클이 없습니다</div>
                : allCycles.map(c => (
                  <div key={c.id} onClick={() => addToCycle(c.id)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#EFF6FF'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#1E293B' }}>{c.name}</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px' }}>{c.planName}</div>
                  </div>
                ))
              }
            </div>
          )}
        </div>
        <button onClick={() => { setSelectedTCIds(new Set()); setShowAddDropdown(false); setShowCreateCycle(false) }}
          style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
          선택 해제
        </button>
      </div>
      {showCreateCycle && (
        <div style={{ background: '#F0F9FF', border: '1px solid #BFDBFE', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '16px 18px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#1D4ED8', marginBottom: '12px' }}>새 테스트 사이클 만들기</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>사이클 이름</label>
              <input autoFocus placeholder="예: 스모크 테스트 사이클" value={createCycleName} onChange={e => setCreateCycleName(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '7px', border: '1.5px solid #93C5FD', outline: 'none', fontSize: '13px' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>테스트 플랜</label>
              <select value={createCyclePlanId ?? ''} onChange={e => setCreateCyclePlanId(e.target.value === 'new' ? 'new' : Number(e.target.value))}
                style={{ width: '100%', padding: '8px 12px', borderRadius: '7px', border: '1.5px solid #93C5FD', outline: 'none', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
                <option value=''>-- 플랜 선택 --</option>
                {testPlans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value='new'>+ 새 플랜 만들기</option>
              </select>
            </div>
            {createCyclePlanId === 'new' && (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '4px' }}>새 플랜 이름</label>
                <input placeholder="예: Sprint 1 플랜" value={createNewPlanName} onChange={e => setCreateNewPlanName(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: '7px', border: '1.5px solid #93C5FD', outline: 'none', fontSize: '13px' }} />
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => { setShowCreateCycle(false); setCreateCycleName(''); setCreateCyclePlanId(null); setCreateNewPlanName('') }} className="btn btn-secondary btn-sm">취소</button>
              <button onClick={handleCreateCycleWithTCs}
                disabled={creatingCycle || !createCycleName.trim() || !createCyclePlanId || (createCyclePlanId === 'new' && !createNewPlanName.trim())}
                style={{ padding: '7px 18px', borderRadius: '7px', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer', background: '#3B82F6', color: 'white', opacity: creatingCycle ? 0.7 : 1 }}>
                {creatingCycle ? '만드는 중...' : `사이클 만들기 (${selectedTCIds.size}개) →`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ── Breadcrumb ─────────────────────────────────────────────────────
  const LibBreadcrumb = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', fontSize: '13px', flexWrap: 'wrap' }}>
      <button onClick={() => { setSelectedParent(null); setSelectedSub(null); setSelectedTC(null) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>🧪 TC 라이브러리</button>
      {selectedParent && <>
        <span style={{ color: '#CBD5E1' }}>›</span>
        <button onClick={() => { setSelectedSub(null); setSelectedTC(null) }}
          style={{ background: 'none', border: 'none', padding: 0, cursor: selectedSub ? 'pointer' : 'default', color: selectedSub ? 'var(--primary)' : '#1E293B', fontWeight: 600 }}>
          📁 {selectedParent}
        </button>
      </>}
      {selectedSub && <>
        <span style={{ color: '#CBD5E1' }}>›</span>
        <button onClick={() => setSelectedTC(null)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: selectedTC ? 'pointer' : 'default', color: selectedTC ? 'var(--primary)' : '#1E293B', fontWeight: 600 }}>
          📋 {selectedSub}
        </button>
      </>}
      {selectedTC && <><span style={{ color: '#CBD5E1' }}>›</span><span style={{ color: '#1E293B', fontWeight: 600 }}>📄 {selectedTC.title}</span></>}
    </div>
  )

  // ── Determine right-panel content ──────────────────────────────────
  let rightContent: ReactNode = null

  // ① Cycle TC step detail
  if (cycleTC && activeCycle) {
    const { parent, sub } = splitModule(cycleTC.module || '기타')
    rightContent = (
      <TCStepDetail
        tc={cycleTC as unknown as TestCase}
        breadcrumb={
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', fontSize: '13px', flexWrap: 'wrap' }}>
            <button onClick={() => setCycleTC(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>← {activeCycle.name}</button>
            <span style={{ color: '#CBD5E1' }}>›</span>
            <span style={{ fontWeight: 600, color: '#1E293B' }}>📄 {cycleTC.title}</span>
          </div>
        }
        onBack={() => setCycleTC(null)}
        onStatusChange={newStatus => setCycleItems(prev => prev.map(i => i.id === cycleTC.id ? { ...i, cycle_status: newStatus as StepStatus } : i))}
        onExpectedChange={() => {}}
        selectedParent={parent} selectedSub={sub}
        cycleItemId={cycleTC.id}
      />
    )
  }
  // ② Add TC to cycle panel
  else if (addTCToCycle) {
    const addSubMap  = addBrowseParent ? (parentMap[addBrowseParent] ?? {}) : {}
    const addSubList = Object.keys(addSubMap)
    rightContent = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', fontSize: '13px', flexWrap: 'wrap' }}>
          <button onClick={() => { setAddTCToCycle(null); setAddBrowseParent(null); setAddBrowseSub(null) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>
            {addFromRun && activeCycle ? `← ${activeCycle.name}` : '← TC 라이브러리'}
          </button>
          <span style={{ color: '#CBD5E1' }}>›</span>
          <span style={{ fontWeight: 600, color: '#059669' }}>+ TC 추가</span>
          {addBrowseParent && <><span style={{ color: '#CBD5E1' }}>›</span>
            <button onClick={() => setAddBrowseSub(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: addBrowseSub ? 'var(--primary)' : '#1E293B', fontWeight: 600, padding: 0 }}>📁 {addBrowseParent}</button>
          </>}
          {addBrowseSub && <><span style={{ color: '#CBD5E1' }}>›</span><span style={{ fontWeight: 600, color: '#1E293B' }}>📋 {addBrowseSub}</span></>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>📋 {addTCToCycle.name}에 TC 추가</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '3px' }}>
              이미 추가됨 {existingCycleIds.size}개
              {addSelectIds.size > 0 && <span style={{ color: '#059669', fontWeight: 700, marginLeft: '8px' }}>· 새로 선택 {addSelectIds.size}개</span>}
            </div>
          </div>
          <button onClick={() => { setAddTCToCycle(null); setAddBrowseParent(null); setAddBrowseSub(null) }} className="btn btn-secondary btn-sm">← 뒤로</button>
        </div>
        {addSelectIds.size > 0 && (
          <div style={{ position: 'sticky', top: '8px', zIndex: 10, background: '#059669', color: 'white', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', boxShadow: '0 4px 20px rgba(5,150,105,.35)' }}>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>✓ {addSelectIds.size}개 선택됨</span>
            <button onClick={addSelectedToCycle} disabled={addingCycleTCs}
              style={{ fontSize: '13px', fontWeight: 700, padding: '7px 18px', borderRadius: '7px', border: 'none', background: 'white', color: '#059669', cursor: 'pointer', opacity: addingCycleTCs ? 0.7 : 1 }}>
              {addingCycleTCs ? '추가 중...' : '사이클에 추가 →'}
            </button>
            <button onClick={() => setAddSelectIds(new Set())}
              style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.4)', background: 'transparent', color: 'rgba(255,255,255,.8)', cursor: 'pointer' }}>
              선택 해제
            </button>
          </div>
        )}
        {/* Level 3 */}
        {addBrowseParent && addBrowseSub ? (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
            {/* 전체 선택 헤더 */}
            {(() => {
              const subTCs = addSubMap[addBrowseSub] ?? []
              const selectable = subTCs.filter(t => !existingCycleIds.has(t.id))
              const allSel = selectable.length > 0 && selectable.every(t => addSelectIds.has(t.id))
              const someSel = selectable.some(t => addSelectIds.has(t.id))
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                  <ICheckbox checked={allSel} indeterminate={someSel && !allSel} onChange={() => toggleAllInAdd(subTCs)} />
                  <span style={{ flex: 1, fontSize: '11px', fontWeight: 700, color: '#64748B' }}>
                    전체 선택 ({selectable.length}개 추가 가능 / 이미 추가됨 {subTCs.length - selectable.length}개)
                  </span>
                </div>
              )
            })()}
            {(addSubMap[addBrowseSub] ?? []).map((tc, idx) => {
              const tm = TYPE_META[tc.type] ?? TYPE_META.manual
              const pm = PRIORITY_META[tc.priority] ?? PRIORITY_META.medium
              const isEx = existingCycleIds.has(tc.id); const isSel = addSelectIds.has(tc.id)
              return (
                <div key={tc.id} onClick={() => toggleAddTC(tc.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', background: isEx ? '#F0FDF4' : isSel ? '#EFF6FF' : 'white', borderBottom: idx < (addSubMap[addBrowseSub] ?? []).length - 1 ? '1px solid #F1F5F9' : 'none', cursor: isEx ? 'default' : 'pointer', borderLeft: isEx ? '3px solid #10B981' : isSel ? '3px solid #3B82F6' : '3px solid transparent' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${isEx ? '#10B981' : isSel ? '#3B82F6' : '#D1D5DB'}`, background: isEx ? '#10B981' : isSel ? '#3B82F6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {(isEx || isSel) && <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tc.title}</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>TC-{String(tc.id).padStart(3, '0')}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', background: tm.bg, color: tm.color, border: `1px solid ${tm.border}`, flexShrink: 0 }}>{tm.icon}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: pm.color, flexShrink: 0 }}>{pm.dot}</span>
                  {isEx
                    ? <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 9px', borderRadius: '8px', background: '#D1FAE5', color: '#059669', flexShrink: 0 }}>✓ 이미 추가됨</span>
                    : tcNeedsReview(tc) && <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>⚠️ 검토 필요</span>
                  }
                </div>
              )
            })}
          </div>
        ) : addBrowseParent && !addBrowseSub ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {addSubList.map(sub => {
              const sts = addSubMap[sub]
              const exN = sts.filter(t => existingCycleIds.has(t.id)).length
              const selectable = sts.filter(t => !existingCycleIds.has(t.id))
              const selN = sts.filter(t => addSelectIds.has(t.id)).length
              const allSubSel = selectable.length > 0 && selectable.every(t => addSelectIds.has(t.id))
              return (
                <div key={sub} onClick={() => setAddBrowseSub(sub)}
                  style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '11px 14px', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'}>
                  <span style={{ fontSize: '18px' }}>📋</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B' }}>{sub}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>TC {sts.length}개</span>
                      {exN > 0 && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: '#D1FAE5', color: '#059669', fontWeight: 700 }}>✓ {exN}</span>}
                      {selN > 0 && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', fontWeight: 700 }}>선택 {selN}</span>}
                    </div>
                  </div>
                  {selectable.length > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleAllInAdd(sts) }}
                      style={{ fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', border: `1px solid ${allSubSel ? '#3B82F6' : '#D1D5DB'}`, background: allSubSel ? '#EFF6FF' : 'white', color: allSubSel ? '#2563EB' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {allSubSel ? '✓ 전체 선택됨' : `전체 선택 (${selectable.length})`}
                    </button>
                  )}
                  <span style={{ color: '#CBD5E1', fontSize: '16px', flexShrink: 0 }}>›</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {parentList.map(parent => {
              const allTCs = Object.values(parentMap[parent]).flat()
              const exN = allTCs.filter(t => existingCycleIds.has(t.id)).length
              const selectable = allTCs.filter(t => !existingCycleIds.has(t.id))
              const selN = allTCs.filter(t => addSelectIds.has(t.id)).length
              const allParentSel = selectable.length > 0 && selectable.every(t => addSelectIds.has(t.id))
              return (
                <div key={parent} onClick={() => setAddBrowseParent(parent)}
                  style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '12px 14px', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(79,70,229,.1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
                  <span style={{ fontSize: '22px' }}>📁</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B' }}>{parent}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>TC {allTCs.length}개</span>
                      {exN > 0 && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: '#D1FAE5', color: '#059669', fontWeight: 700 }}>✓ 추가됨 {exN}</span>}
                      {selN > 0 && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: '#EFF6FF', color: '#2563EB', fontWeight: 700 }}>선택 {selN}</span>}
                    </div>
                  </div>
                  {selectable.length > 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); toggleAllInAdd(allTCs) }}
                      style={{ fontSize: '11px', fontWeight: 700, padding: '5px 11px', borderRadius: '7px', border: `1px solid ${allParentSel ? '#3B82F6' : '#D1D5DB'}`, background: allParentSel ? '#EFF6FF' : 'white', color: allParentSel ? '#2563EB' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {allParentSel ? '✓ 전체 선택됨' : `전체 선택 (${selectable.length})`}
                    </button>
                  )}
                  <span style={{ color: '#CBD5E1', fontSize: '18px', flexShrink: 0 }}>›</span>
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }
  // ③ Cycle execution view
  else if (activeCycle) {
    const planName = testPlans.find(p => p.cycles.some(c => c.id === activeCycle.id))?.name
    // Group by parent module
    const groups: Array<{ module: string; entries: Array<{ item: CycleCase; flatIdx: number }> }> = []
    const groupMap: Record<string, typeof groups[0]> = {}
    cycleItems.forEach((item, flatIdx) => {
      const { parent } = splitModule(item.module || '기타')
      if (!groupMap[parent]) { const g = { module: parent, entries: [] }; groupMap[parent] = g; groups.push(g) }
      groupMap[parent].entries.push({ item, flatIdx })
    })
    const allIds       = cycleItems.map(i => i.id)
    const allSelAll    = allIds.length > 0 && allIds.every(id => selCycleIds.has(id))
    const someSel      = allIds.some(id => selCycleIds.has(id))
    const passN = cycleItems.filter(i => i.cycle_status === 'pass').length
    const failN = cycleItems.filter(i => i.cycle_status === 'fail').length
    const naN   = cycleItems.filter(i => i.cycle_status === 'na').length
    const doneN = passN + failN + naN
    const csm   = CYCLE_STATUS_META[activeCycle.status] ?? CYCLE_STATUS_META.not_started

    rightContent = (
      <>
        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', fontSize: '13px', flexWrap: 'wrap' }}>
          <button onClick={() => { setActiveCycle(null); setCycleItems([]); setSelCycleIds(new Set()) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, padding: 0 }}>← TC 라이브러리</button>
          {planName && <><span style={{ color: '#CBD5E1' }}>›</span><span style={{ color: '#64748B', fontSize: '12px' }}>📐 {planName}</span></>}
          <span style={{ color: '#CBD5E1' }}>›</span>
          <span style={{ fontWeight: 600, color: '#1E293B' }}>📋 {activeCycle.name}</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '17px', color: '#1E293B' }}>{activeCycle.name}</div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '8px', background: csm.bg, color: csm.color, border: `1px solid ${csm.border}` }}>{csm.label}</span>
              <span style={{ fontSize: '11px', color: '#64748B' }}>{cycleItems.length}개 TC</span>
            </div>
          </div>
          <button onClick={() => openAddTCPanel(activeCycle, true)}
            style={{ fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg,#34D399,#10B981)', cursor: 'pointer', color: 'white', whiteSpace: 'nowrap', boxShadow: '0 3px 12px rgba(16,185,129,.4)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 20px rgba(16,185,129,.5)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 12px rgba(16,185,129,.4)' }}>
            ＋ TC 추가
          </button>
        </div>

        {/* Progress bar */}
        {cycleItems.length > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94A3B8', marginBottom: '4px' }}>
              <span>진행률</span>
              <span style={{ fontWeight: 600 }}>{doneN}/{cycleItems.length} · Pass {passN} · Fail {failN} · N/A {naN}</span>
            </div>
            <div style={{ height: '6px', background: '#E2E8F0', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ height: '100%', background: '#16A34A', width: `${(passN / cycleItems.length) * 100}%`, transition: 'width .3s' }} />
              <div style={{ height: '100%', background: '#DC2626', width: `${(failN / cycleItems.length) * 100}%`, transition: 'width .3s' }} />
              <div style={{ height: '100%', background: '#94A3B8', width: `${(naN / cycleItems.length) * 100}%`, transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selCycleIds.size > 0 && (
          <div style={{ position: 'sticky', top: '8px', zIndex: 10, background: '#1E293B', color: 'white', borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', boxShadow: '0 4px 24px rgba(0,0,0,.28)' }}>
            <span style={{ flex: 1, fontSize: '12px', fontWeight: 600 }}>✓ {selCycleIds.size}개 선택됨</span>
            {([{ val: 'pass' as StepStatus, icon: '✓', label: 'Pass', color: '#16A34A', bg: '#DCFCE7' }, { val: 'fail' as StepStatus, icon: '✗', label: 'Fail', color: '#DC2626', bg: '#FEE2E2' }, { val: 'na' as StepStatus, icon: '—', label: 'N/A', color: '#64748B', bg: '#F1F5F9' }]).map(btn => (
              <button key={btn.val} onClick={() => bulkUpdateStatus(btn.val)} disabled={bulkActing}
                style={{ fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '6px', border: 'none', background: btn.bg, color: btn.color, cursor: 'pointer', opacity: bulkActing ? 0.7 : 1 }}>
                {btn.icon} {btn.label}
              </button>
            ))}
            <button onClick={() => setSelCycleIds(new Set())}
              style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: 'rgba(255,255,255,.7)', cursor: 'pointer' }}>
              해제
            </button>
          </div>
        )}

        {cycleLoading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8', fontSize: '13px' }}>불러오는 중...</div>
        ) : cycleItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '13px', border: '1px dashed #E2E8F0', borderRadius: '10px' }}>
            TC가 없습니다. <strong>+ TC 추가</strong> 버튼으로 케이스를 추가하세요.
          </div>
        ) : (
          <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
            {/* 전체 선택 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <ICheckbox checked={allSelAll} indeterminate={someSel && !allSelAll} onChange={() => toggleModuleGroup(allIds, allSelAll)} />
              <span style={{ flex: 1, fontSize: '11px', fontWeight: 700, color: '#64748B' }}>전체 선택 ({cycleItems.length}개)</span>
              <span style={{ fontSize: '10px', color: '#94A3B8' }}>Shift+클릭으로 범위 선택</span>
            </div>

            {/* 모듈 그룹 */}
            {groups.map(({ module, entries }) => {
              const groupIds     = entries.map(e => e.item.id)
              const allGroupSel  = groupIds.every(id => selCycleIds.has(id))
              const someGroupSel = groupIds.some(id => selCycleIds.has(id))
              const gPassN = entries.filter(e => e.item.cycle_status === 'pass').length
              const gFailN = entries.filter(e => e.item.cycle_status === 'fail').length

              return (
                <div key={module}>
                  {/* 그룹 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0', borderTop: '1px solid #E2E8F0' }}>
                    <ICheckbox checked={allGroupSel} indeterminate={someGroupSel && !allGroupSel} onChange={() => toggleModuleGroup(groupIds, allGroupSel)} />
                    <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: '#374151' }}>📁 {module} 전체 ({entries.length}개)</span>
                    {(gPassN > 0 || gFailN > 0) && (
                      <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                        {gPassN > 0 && <span style={{ color: '#059669', fontWeight: 700 }}>Pass {gPassN} </span>}
                        {gFailN > 0 && <span style={{ color: '#DC2626', fontWeight: 700 }}>Fail {gFailN}</span>}
                      </span>
                    )}
                  </div>

                  {/* TC 행 */}
                  {entries.map(({ item, flatIdx }, idx) => {
                    const tm      = TYPE_META[item.type]         ?? TYPE_META.manual
                    const pm      = PRIORITY_META[item.priority] ?? PRIORITY_META.medium
                    const ccm     = CYCLE_CASE_META[item.cycle_status] ?? CYCLE_CASE_META.pending
                    const isSel   = selCycleIds.has(item.id)
                    const isLast  = idx === entries.length - 1
                    return (
                      <div key={item.id}
                        onClick={e => handleCycleCaseClick(item.id, flatIdx, e.shiftKey)}
                        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: isSel ? '#EFF6FF' : 'white', borderBottom: isLast ? 'none' : '1px solid #F1F5F9', cursor: 'pointer', userSelect: 'none', transition: 'background .1s' }}
                        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = '#F8FAFC' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isSel ? '#EFF6FF' : 'white' }}>
                        {/* 체크박스 (시각적) */}
                        <div onClick={e => { e.stopPropagation(); handleCycleCaseClick(item.id, flatIdx, e.shiftKey) }}
                          style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${isSel ? '#3B82F6' : '#D1D5DB'}`, background: isSel ? '#3B82F6' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isSel && <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>✓</span>}
                        </div>
                        {/* 상태 아이콘 */}
                        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: ccm.bg, color: ccm.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>{ccm.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>
                          <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>TC-{String(item.test_case_id).padStart(3, '0')}</div>
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', background: tm.bg, color: tm.color, border: `1px solid ${tm.border}`, flexShrink: 0 }}>{tm.icon}</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: pm.color, flexShrink: 0 }}>{pm.dot}</span>
                        <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: ccm.bg, color: ccm.color, flexShrink: 0, whiteSpace: 'nowrap' }}>{ccm.label}</span>
                        <button onClick={e => { e.stopPropagation(); setCycleTC(item) }}
                          style={{ fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg,#60A5FA,#3B82F6)', cursor: 'pointer', color: 'white', flexShrink: 0, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(59,130,246,.35)' }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 14px rgba(59,130,246,.5)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(59,130,246,.35)' }}>
                          ▶ 단계 실행
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }
  // ④ Library TC step detail (edit only)
  else if (selectedTC) {
    rightContent = (
      <TCStepDetail
        tc={selectedTC} breadcrumb={<LibBreadcrumb />}
        onBack={() => setSelectedTC(null)} onStatusChange={() => {}}
        onExpectedChange={(tcId, expected) => {
          setTcs(prev => prev.map(t => t.id === tcId ? { ...t, expected } : t))
          setSelectedTC(prev => prev ? { ...prev, expected } : prev)
        }}
        selectedParent={selectedParent ?? ''} selectedSub={selectedSub ?? ''}
      />
    )
  }
  // ⑤ Level 3 — TC list
  else if (selectedParent && selectedSub) {
    const subTCs = parentMap[selectedParent]?.[selectedSub] ?? []
    rightContent = (
      <>
        <LibBreadcrumb />
        <SelectionBar />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#1E293B' }}>📋 {selectedSub}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>체크 → 사이클 추가 · 클릭 → 편집 · {subTCs.length}개</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelectedSub(null)}>← 뒤로</button>
        </div>
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          {subTCs.map((tc, idx) => {
            const tm = TYPE_META[tc.type] ?? TYPE_META.manual; const pm = PRIORITY_META[tc.priority] ?? PRIORITY_META.medium
            const needsRev = tcNeedsReview(tc); const isSel = selectedTCIds.has(tc.id)
            return (
              <div key={tc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '11px 14px', background: isSel ? '#EFF6FF' : needsRev ? '#FFFBEB' : 'white', borderBottom: idx < subTCs.length - 1 ? '1px solid #F1F5F9' : 'none', borderLeft: needsRev ? '3px solid #F59E0B' : '3px solid transparent' }}>
                <div onClick={e => { e.stopPropagation(); toggleTC(tc.id) }}
                  style={{ width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${isSel ? '#3B82F6' : '#D1D5DB'}`, background: isSel ? '#3B82F6' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isSel && <span style={{ color: 'white', fontSize: '10px', fontWeight: 700 }}>✓</span>}
                </div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }} onClick={() => setSelectedTC(tc)}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, color: '#64748B', flexShrink: 0 }}>{parseSteps(tc.steps).length}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tc.title}</div>
                    <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'monospace' }}>TC-{String(tc.id).padStart(3, '0')}</div>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '8px', background: tm.bg, color: tm.color, border: `1px solid ${tm.border}`, flexShrink: 0 }}>{tm.icon}</span>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: pm.color, flexShrink: 0 }}>{pm.dot} {pm.label}</span>
                  {needsRev
                    ? <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: '#FEF3C7', color: '#92400E', flexShrink: 0 }}>⚠️ 검토 필요</span>
                    : <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: '#D1FAE5', color: '#059669', flexShrink: 0 }}>✓ 완료</span>
                  }
                  <span style={{ color: '#CBD5E1', flexShrink: 0 }}>›</span>
                </div>
              </div>
            )
          })}
        </div>
      </>
    )
  }
  // ⑥ Level 2 — sub list
  else if (selectedParent) {
    const subs = parentMap[selectedParent] ?? {}
    rightContent = (
      <>
        <LibBreadcrumb />
        <SelectionBar />
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '15px', color: '#1E293B' }}>📁 {selectedParent}</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{Object.keys(subs).length}개 세부 항목</div>
          </div>
          <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setSelectedParent(null)}>← 뒤로</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {Object.keys(subs).map(sub => {
            const stcs = subs[sub]; const revN = stcs.filter(tcNeedsReview).length
            return (
              <div key={sub} onClick={() => setSelectedSub(sub)}
                style={{ border: `1px solid ${revN > 0 ? '#FCD34D' : '#E2E8F0'}`, borderRadius: '10px', padding: '13px 16px', background: revN > 0 ? '#FFFBEB' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = revN > 0 ? '#FCD34D' : '#E2E8F0'}>
                <span style={{ fontSize: '20px' }}>📋</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '13px', color: '#1E293B', marginBottom: '3px' }}>{sub}</div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: '#6B7280' }}>TC {stcs.length}개</span>
                    {revN > 0 && <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '8px', background: '#FEF3C7', color: '#92400E', fontWeight: 700 }}>⚠️ 검토 {revN}</span>}
                  </div>
                </div>
                <span style={{ color: '#CBD5E1', fontSize: '16px' }}>›</span>
              </div>
            )
          })}
        </div>
      </>
    )
  }
  // ⑦ Level 1 — parent list (default)
  else {
    rightContent = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px', gap: '10px' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>🧪 TC 라이브러리</div>
            <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>모듈을 클릭해 검토하거나, TC를 선택해 사이클을 만드세요</div>
          </div>
          {projectId && (
            <button className="btn btn-secondary btn-sm" style={{ marginLeft: 'auto' }} onClick={generateTCs} disabled={generating}>
              {generating ? '⏳ 생성 중...' : '🔄 TC 재생성'}
            </button>
          )}
        </div>
        <SelectionBar />
        {/* 검토 통계 */}
        {tcs.length > 0 && (
          <div style={{ display: 'flex', gap: '7px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 11px', borderRadius: '20px', background: '#F3F4F6', color: '#374151' }}>전체 {tcs.length}개</span>
            {reviewCount > 0
              ? <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 11px', borderRadius: '20px', background: '#FEF3C7', color: '#92400E' }}>⚠️ 검토 필요 {reviewCount}개</span>
              : <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 11px', borderRadius: '20px', background: '#D1FAE5', color: '#059669' }}>✓ 전체 작성 완료</span>
            }
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
              const allTCs = Object.values(parentMap[parent]).flat()
              const revN   = allTCs.filter(tcNeedsReview).length
              return (
                <div key={parent} onClick={() => setSelectedParent(parent)}
                  style={{ border: `1px solid ${revN > 0 ? '#FCD34D' : '#E2E8F0'}`, borderRadius: '12px', padding: '14px 16px', background: revN > 0 ? '#FFFBEB' : 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all .15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 2px 12px rgba(79,70,229,.1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = revN > 0 ? '#FCD34D' : '#E2E8F0'; (e.currentTarget as HTMLElement).style.boxShadow = 'none' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>📁</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#1E293B', marginBottom: '4px' }}>{parent}</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', color: '#6B7280' }}>하위 {Object.keys(parentMap[parent]).length}개 · TC {allTCs.length}개</span>
                      {revN > 0 && <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '8px', background: '#FEF3C7', color: '#92400E', fontWeight: 700 }}>⚠️ 검토 {revN}</span>}
                    </div>
                  </div>
                  {revN === 0 && <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '10px', background: '#D1FAE5', color: '#059669', flexShrink: 0 }}>✓</span>}
                  <span style={{ fontSize: '18px', color: '#CBD5E1' }}>›</span>
                </div>
              )
            })}
          </div>
        )}
      </>
    )
  }

  // ── TWO-COLUMN LAYOUT ──────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: '0', alignItems: 'flex-start', minHeight: '100%' }}>

      {/* ── LEFT: Plan & Cycle sidebar ── */}
      <div style={{ width: '252px', flexShrink: 0, borderRight: '1px solid #E2E8F0', paddingRight: '14px' }}>

        {/* Stats */}
        <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: '4px' }}>TC 현황</div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', background: '#F3F4F6', color: '#374151', fontWeight: 600 }}>전체 {tcs.length}</span>
            {reviewCount > 0
              ? <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', background: '#FEF3C7', color: '#92400E', fontWeight: 700 }}>⚠️ {reviewCount}</span>
              : tcs.length > 0 && <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '8px', background: '#D1FAE5', color: '#059669', fontWeight: 700 }}>✓ 완료</span>
            }
          </div>
        </div>

        {/* Plan section */}
        <div style={{ marginBottom: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#94A3B8', letterSpacing: '.06em', textTransform: 'uppercase' }}>플랜 & 사이클</span>
        </div>

        <button onClick={() => setShowNewPlan(v => !v)}
          style={{ width: '100%', marginBottom: '8px', padding: '9px 12px', borderRadius: '9px', border: `2px dashed ${showNewPlan ? '#6366F1' : '#C7D2FE'}`, background: showNewPlan ? '#EEF2FF' : '#F8FAFF', cursor: 'pointer', color: '#4F46E5', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', transition: 'all .18s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = '#6366F1'; (e.currentTarget as HTMLElement).style.background = '#EEF2FF'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = showNewPlan ? '#6366F1' : '#C7D2FE'; (e.currentTarget as HTMLElement).style.background = showNewPlan ? '#EEF2FF' : '#F8FAFF'; (e.currentTarget as HTMLElement).style.transform = 'none' }}>
          ＋ 플랜 추가
        </button>

        {showNewPlan && (
          <div style={{ marginBottom: '10px', background: '#EEF2FF', borderRadius: '9px', padding: '10px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#4F46E5', marginBottom: '7px' }}>새 테스트 플랜</div>
            <input autoFocus placeholder="플랜 이름 입력..." value={newPlanName} onChange={e => setNewPlanName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createPlan(); if (e.key === 'Escape') { setShowNewPlan(false); setNewPlanName('') } }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: '7px', border: '2px solid #818CF8', outline: 'none', fontSize: '12px', marginBottom: '7px', background: 'white' }} />
            <div style={{ display: 'flex', gap: '5px' }}>
              <button onClick={createPlan} disabled={planSaving || !newPlanName.trim()}
                style={{ flex: 1, padding: '7px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg,#6366F1,#4F46E5)', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: '0 3px 10px rgba(79,70,229,.35)' }}>
                {planSaving ? '저장 중...' : '✓ 만들기'}
              </button>
              <button onClick={() => { setShowNewPlan(false); setNewPlanName('') }}
                style={{ padding: '7px 11px', borderRadius: '7px', border: '1.5px solid #C7D2FE', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#6B7280', fontWeight: 600 }}>✕</button>
            </div>
          </div>
        )}

        {testPlans.length === 0 && !showNewPlan && (
          <div style={{ fontSize: '11px', color: '#9CA3AF', textAlign: 'center', padding: '16px 0' }}>플랜이 없습니다</div>
        )}

        {testPlans.map(plan => {
          const isExp = expandedPlanIds.has(plan.id)
          return (
            <div key={plan.id} style={{ marginBottom: '3px' }}>
              <div onClick={() => setExpandedPlanIds(prev => { const n = new Set(prev); n.has(plan.id) ? n.delete(plan.id) : n.add(plan.id); return n })}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', borderRadius: '9px', cursor: 'pointer', background: isExp ? '#EEF2FF' : 'white', border: `1px solid ${isExp ? '#C7D2FE' : '#E2E8F0'}`, userSelect: 'none', transition: 'all .15s', marginBottom: '4px' }}
                onMouseEnter={e => { if (!isExp) { (e.currentTarget as HTMLElement).style.background = '#F5F3FF'; (e.currentTarget as HTMLElement).style.borderColor = '#C7D2FE' } }}
                onMouseLeave={e => { if (!isExp) { (e.currentTarget as HTMLElement).style.background = 'white'; (e.currentTarget as HTMLElement).style.borderColor = '#E2E8F0' } }}>
                <span style={{ fontSize: '9px', color: isExp ? '#4F46E5' : '#94A3B8', display: 'inline-block', transition: 'transform .15s', transform: isExp ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>▶</span>
                <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: isExp ? '#4F46E5' : '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{plan.name}</span>
                <button onClick={e => { e.stopPropagation(); setShowNewCycleFor(plan.id); setExpandedPlanIds(prev => new Set(Array.from(prev).concat(plan.id))) }}
                  style={{ fontSize: '11px', padding: '4px 9px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg,#818CF8,#6366F1)', color: 'white', cursor: 'pointer', fontWeight: 700, flexShrink: 0, boxShadow: '0 2px 6px rgba(99,102,241,.4)' }}>
                  + 사이클
                </button>
              </div>

              {isExp && (
                <div style={{ marginLeft: '10px', marginBottom: '6px', paddingLeft: '8px', borderLeft: '2px solid #E0E7FF' }}>
                  {plan.cycles.length === 0 && showNewCycleFor !== plan.id && (
                    <div style={{ fontSize: '11px', color: '#9CA3AF', padding: '6px 4px', fontStyle: 'italic' }}>사이클 없음</div>
                  )}
                  {plan.cycles.map(cycle => {
                    const csm   = CYCLE_STATUS_META[cycle.status] ?? CYCLE_STATUS_META.not_started
                    const isAct = activeCycle?.id === cycle.id
                    const pct   = cycle.tcCount > 0 ? Math.round((cycle.passCount + cycle.failCount) / cycle.tcCount * 100) : 0
                    return (
                      <div key={cycle.id} style={{ padding: '8px 10px', borderRadius: '8px', marginBottom: '4px', background: isAct ? 'linear-gradient(135deg,#EFF6FF,#DBEAFE)' : 'white', border: `1.5px solid ${isAct ? '#93C5FD' : '#E2E8F0'}`, transition: 'all .15s', boxShadow: isAct ? '0 2px 8px rgba(59,130,246,.15)' : '0 1px 3px rgba(0,0,0,.04)' }}>
                        {/* 사이클 이름 + 상태 */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                          <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: csm.color, flexShrink: 0, boxShadow: `0 0 0 2px ${csm.bg}` }} />
                          <span style={{ flex: 1, fontSize: '12px', fontWeight: 700, color: isAct ? '#1D4ED8' : '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cycle.name}</span>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '8px', background: csm.bg, color: csm.color, border: `1px solid ${csm.border}`, flexShrink: 0 }}>{csm.label}</span>
                        </div>
                        {/* 진행률 */}
                        {cycle.tcCount > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '7px' }}>
                            <div style={{ height: '4px', flex: 1, background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: cycle.failCount > 0 ? 'linear-gradient(90deg,#EF4444,#DC2626)' : 'linear-gradient(90deg,#34D399,#10B981)', width: `${pct}%`, transition: 'width .3s' }} />
                            </div>
                            <span style={{ fontSize: '10px', color: '#64748B', fontWeight: 600, flexShrink: 0 }}>{cycle.tcCount}TC · {pct}%</span>
                          </div>
                        )}
                        {/* 버튼 영역 */}
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button onClick={() => openCycleRun(cycle)}
                            style={{ flex: 1, fontSize: '12px', fontWeight: 700, padding: '7px 8px', borderRadius: '7px', border: 'none', background: isAct ? 'linear-gradient(135deg,#1D4ED8,#2563EB)' : 'linear-gradient(135deg,#3B82F6,#2563EB)', cursor: 'pointer', color: 'white', whiteSpace: 'nowrap', boxShadow: `0 3px 10px rgba(37,99,235,${isAct ? '.5' : '.3'})`, transition: 'all .15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 5px 16px rgba(37,99,235,.45)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = `0 3px 10px rgba(37,99,235,${isAct ? '.5' : '.3'})` }}>
                            {isAct ? '● 실행중' : '▶ 실행'}
                          </button>
                          <button onClick={() => openAddTCPanel(cycle, false)}
                            style={{ fontSize: '12px', fontWeight: 700, padding: '7px 11px', borderRadius: '7px', border: 'none', background: 'linear-gradient(135deg,#34D399,#10B981)', cursor: 'pointer', color: 'white', whiteSpace: 'nowrap', boxShadow: '0 3px 10px rgba(16,185,129,.35)', transition: 'all .15s' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 5px 16px rgba(16,185,129,.45)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none'; (e.currentTarget as HTMLElement).style.boxShadow = '0 3px 10px rgba(16,185,129,.35)' }}>
                            + TC
                          </button>
                        </div>
                      </div>
                    )
                  })}
                  {showNewCycleFor === plan.id && (
                    <div style={{ padding: '8px', background: '#F0FDF4', borderRadius: '8px', border: '1.5px solid #6EE7B7', marginBottom: '4px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#059669', marginBottom: '6px' }}>새 사이클</div>
                      <input autoFocus placeholder="사이클 이름 입력..." value={newCycleName} onChange={e => setNewCycleName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') createCycleUnderPlan(plan.id); if (e.key === 'Escape') { setShowNewCycleFor(null); setNewCycleName('') } }}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: '6px', border: '2px solid #6EE7B7', outline: 'none', fontSize: '12px', marginBottom: '6px', background: 'white' }} />
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button onClick={() => createCycleUnderPlan(plan.id)} disabled={planSaving || !newCycleName.trim()}
                          style={{ flex: 1, padding: '7px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg,#34D399,#10B981)', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '12px', boxShadow: '0 3px 10px rgba(16,185,129,.35)' }}>
                          ✓ 만들기
                        </button>
                        <button onClick={() => { setShowNewCycleFor(null); setNewCycleName('') }}
                          style={{ padding: '7px 11px', borderRadius: '6px', border: '1.5px solid #6EE7B7', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#059669', fontWeight: 600 }}>✕</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── RIGHT: Main content ── */}
      <div style={{ flex: 1, minWidth: 0, paddingLeft: '20px' }}>
        {rightContent}
      </div>
    </div>
  )
}

export default function TCListPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>로딩 중...</div>}>
      <TCListPageContent />
    </Suspense>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// TCStepDetail
//   cycleItemId 없음 → 편집 전용 (라이브러리)
//   cycleItemId 있음 → Pass/Fail/N/A 기록 (사이클 실행)
// ═══════════════════════════════════════════════════════════════════════
function TCStepDetail({
  tc, onBack, onStatusChange, onExpectedChange, breadcrumb, selectedParent, selectedSub, cycleItemId,
}: {
  tc: TestCase; onBack: () => void
  onStatusChange: (s: 'pending' | 'pass' | 'fail') => void
  onExpectedChange?: (tcId: number, expected: string[]) => void
  breadcrumb: ReactNode; selectedParent: string; selectedSub: string
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

  const calcStatus = (ss: StepStatus[]): 'pending' | 'pass' | 'fail' => {
    if (ss.some(s => s === 'fail')) return 'fail'
    if (ss.every(s => s === 'pass' || s === 'na') && ss.some(s => s === 'pass')) return 'pass'
    return 'pending'
  }

  async function setStep(idx: number, val: StepStatus) {
    const next   = stepStatuses.map((s, i) => i === idx ? (s === val ? 'pending' : val) : s)
    setStepStatuses(next)
    const status = calcStatus(next)
    setSavingStatus(true)
    try {
      if (cycleItemId) {
        await fetch(`/api/test-cycle-cases/${cycleItemId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        })
      }
      onStatusChange(status)
    } finally { setSavingStatus(false) }
  }

  async function saveExpected(idx: number, val: string) {
    const next = expectedTexts.map((e, i) => i === idx ? val : e)
    setExpectedTexts(next); setEditingIdx(null); setSavingExp(true)
    try {
      await fetch(`/api/tc/${tc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expected: next }),
      })
      onExpectedChange?.(tc.id, next)
    } finally { setSavingExp(false) }
  }

  const tcStatus   = calcStatus(stepStatuses)
  const STATUS_COLORS = { pending: { label: '대기', color: '#6B7280', bg: '#F3F4F6' }, pass: { label: 'Pass', color: '#059669', bg: '#D1FAE5' }, fail: { label: 'Fail', color: '#DC2626', bg: '#FEE2E2' } }
  const tcStatMeta = STATUS_COLORS[tcStatus]
  const hasEmptyExp = expectedTexts.some(e => !e.trim())

  return (
    <>
      {breadcrumb}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '12px', gap: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '3px' }}>📁 {selectedParent}{selectedSub ? ` · 📋 ${selectedSub}` : ''}</div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: '#1E293B' }}>{tc.title}</div>
          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '2px', fontFamily: 'monospace' }}>
            TC-{String(tc.id).padStart(3, '0')} · {cycleItemId ? '🔄 사이클 실행 중' : '✏️ 편집 모드'}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← 뒤로</button>
      </div>

      <div style={{ display: 'flex', gap: '7px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '10px', background: typeMeta.bg, color: typeMeta.color, border: `1px solid ${typeMeta.border}` }}>{typeMeta.icon} {typeMeta.label}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: priMeta.bg, color: priMeta.color }}>{priMeta.dot} {priMeta.label}</span>
        {cycleItemId && (
          <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: tcStatMeta.bg, color: tcStatMeta.color }}>
            {tcStatus === 'pass' ? '✅' : tcStatus === 'fail' ? '❌' : '⏳'} {tcStatMeta.label}
            {savingStatus && <span style={{ marginLeft: '5px', fontSize: '10px', opacity: 0.6 }}>저장 중...</span>}
          </span>
        )}
        {!cycleItemId && hasEmptyExp && <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: '#FEF3C7', color: '#92400E' }}>⚠️ 기대결과 미작성 — 클릭하여 편집</span>}
        {!cycleItemId && !hasEmptyExp && <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '10px', background: '#D1FAE5', color: '#059669' }}>✓ 검토 완료{savingExp && <span style={{ marginLeft: '5px', fontSize: '10px', opacity: 0.6 }}>저장 중...</span>}</span>}
      </div>

      {cycleItemId && steps.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>
            <span>수행 진행률</span>
            <span style={{ fontWeight: 700 }}>{doneN}/{steps.length} · Pass {passN} · Fail {failN} · N/A {naN}</span>
          </div>
          <div style={{ height: '7px', background: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ height: '100%', background: '#16A34A', width: `${(passN / steps.length) * 100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#DC2626', width: `${(failN / steps.length) * 100}%`, transition: 'width .3s' }} />
            <div style={{ height: '100%', background: '#94A3B8', width: `${(naN  / steps.length) * 100}%`, transition: 'width .3s' }} />
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', marginBottom: '6px', padding: '0 4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.07em' }}>테스트 단계</div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.07em', paddingLeft: '14px' }}>
            기대 결과 <span style={{ fontSize: '10px', fontWeight: 400, color: '#94A3B8' }}>(클릭하여 편집)</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {steps.map((step, si) => {
          const ss  = cycleItemId ? stepStatuses[si] : 'pending'
          const st  = STEP_STYLE[ss]
          const exp = expectedTexts[si] ?? ''
          const isEditing = editingIdx === si
          const expEmpty  = !exp.trim()
          return (
            <div key={si} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${expEmpty && !cycleItemId ? '#FCD34D' : st.border}` }}>
              <div style={{ background: st.bg, borderLeft: `4px solid ${expEmpty && !cycleItemId ? '#F59E0B' : st.leftBorder}`, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: cycleItemId ? '9px' : '0' }}>
                  <div style={{ width: '21px', height: '21px', borderRadius: '50%', background: st.numBg, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>{si + 1}</div>
                  <div style={{ fontSize: '12px', color: '#1E293B', lineHeight: 1.6 }}>{step}</div>
                </div>
                {cycleItemId && (
                  <div style={{ display: 'flex', gap: '5px', paddingLeft: '30px' }}>
                    {STEP_BTNS.map(btn => {
                      const active = stepStatuses[si] === btn.val
                      return (
                        <button key={btn.val} onClick={() => setStep(si, btn.val)}
                          style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all .1s', border: `1.5px solid ${active ? btn.color : '#E2E8F0'}`, background: active ? btn.bg : 'white', color: active ? btn.color : '#94A3B8' }}>
                          {btn.icon} {btn.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ background: expEmpty ? '#FFFBEB' : (ss === 'pending' ? '#FAFBFF' : st.bg), borderLeft: `1px solid ${expEmpty && !cycleItemId ? '#FCD34D' : st.border}`, padding: '11px 13px' }}>
                {isEditing ? (
                  <div>
                    <textarea autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)} rows={4}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', lineHeight: 1.6, padding: '7px 9px', borderRadius: '6px', border: '2px solid var(--primary)', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: '6px', marginTop: '5px', justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingIdx(null)} className="btn btn-secondary btn-sm">취소</button>
                      <button onClick={() => saveExpected(si, editingVal)} className="btn btn-primary btn-sm">저장</button>
                    </div>
                  </div>
                ) : (
                  <div onClick={() => { setEditingIdx(si); setEditingVal(exp) }}
                    style={{ cursor: 'text', minHeight: '46px', fontSize: '12px', color: exp ? '#1E293B' : '#F59E0B', fontWeight: exp ? 400 : 600, lineHeight: 1.6, borderRadius: '6px', padding: '3px 5px', border: '1.5px dashed transparent', transition: 'border .1s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#CBD5E1'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'transparent'}>
                    {exp || '⚠️ 기대 결과를 입력하세요 (클릭)'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {cycleItemId && doneN > 0 && (
        <div style={{ marginTop: '14px', background: tcStatus === 'pass' ? '#F0FDF4' : tcStatus === 'fail' ? '#FFF1F2' : '#F8FAFC', border: `1px solid ${tcStatus === 'pass' ? '#86EFAC' : tcStatus === 'fail' ? '#FCA5A5' : '#E2E8F0'}`, borderRadius: '10px', padding: '13px 15px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '9px', textTransform: 'uppercase', letterSpacing: '.06em' }}>수행 결과 요약</div>
          <div style={{ display: 'flex', gap: '9px' }}>
            {[
              { label: 'Pass',   n: passN,               color: '#16A34A', bg: '#DCFCE7' },
              { label: 'Fail',   n: failN,               color: '#DC2626', bg: '#FEE2E2' },
              { label: 'N/A',    n: naN,                 color: '#64748B', bg: '#F1F5F9' },
              { label: '미수행', n: steps.length - doneN, color: '#94A3B8', bg: '#F8FAFC' },
            ].filter(r => r.n > 0).map(r => (
              <div key={r.label} style={{ textAlign: 'center', padding: '7px 11px', background: r.bg, borderRadius: '8px', flex: 1 }}>
                <div style={{ fontSize: '19px', fontWeight: 800, color: r.color }}>{r.n}</div>
                <div style={{ fontSize: '10px', color: r.color, marginTop: '2px', fontWeight: 600 }}>{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
