'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import ApproveAllModal from '@/components/modals/ApproveAllModal'

type TCType     = 'auto' | 'manual' | 'mixed'
type TCPriority = 'critical' | 'high' | 'medium' | 'low'
type TCStatus   = 'draft' | 'approved' | 'passed' | 'failed'

interface TestCase {
  id: number
  title: string
  module: string
  type: TCType
  priority: TCPriority
  status: TCStatus
}

const TYPE_META: Record<TCType, { label: string; icon: string; bg: string; border: string }> = {
  auto:   { label: '자동', icon: '🤖', bg: 'var(--tc-auto-bg)',   border: 'var(--tc-auto-border)' },
  manual: { label: '수동', icon: '👤', bg: 'var(--tc-manual-bg)', border: 'var(--tc-manual-border)' },
  mixed:  { label: '혼합', icon: '🔀', bg: 'var(--tc-mixed-bg)',  border: 'var(--tc-mixed-border)' },
}

const PRIORITY_COLOR: Record<TCPriority, string> = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#6B7280',
}

const STATUS_META: Record<TCStatus, { label: string; color: string }> = {
  draft:    { label: '대기',   color: '#6B7280' },
  approved: { label: '승인',   color: '#4F46E5' },
  passed:   { label: 'Pass',   color: '#10B981' },
  failed:   { label: 'Fail',   color: '#EF4444' },
}

export default function TCListPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [projectId, setProjectId] = useState<number | null>(null)
  const [tcs, setTcs]             = useState<TestCase[]>([])
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [filterType, setFilterType]         = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [selected, setSelected]   = useState<Set<number>>(new Set())
  const [bulkOpen, setBulkOpen]   = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

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
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-tc`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'TC 생성 실패')
      await fetchTCs(projectId)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  const filtered = tcs.filter(tc => {
    if (search && !tc.title.toLowerCase().includes(search.toLowerCase()) && !tc.module?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterType && tc.type !== filterType) return false
    if (filterPriority && tc.priority !== filterPriority) return false
    return true
  })

  const modules = [...new Set(tcs.map(tc => tc.module).filter(Boolean))]

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(tc => tc.id)))
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">🧪 TC 목록</div>
        <div className="page-subtitle">AI가 생성한 테스트 케이스 목록입니다</div>
      </div>

      <div className="alert alert-info">💡 배경색으로 실행 유형을 구분합니다.</div>

      <div className="legend">
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--tc-auto-bg)',   border: '1px solid var(--tc-auto-border)'   }} /> 🤖 자동 실행 (Playwright)</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--tc-manual-bg)', border: '1px solid var(--tc-manual-border)' }} /> 👤 수동 실행</div>
        <div className="legend-item"><div className="legend-dot" style={{ background: 'var(--tc-mixed-bg)',  border: '1px solid var(--tc-mixed-border)'  }} /> 🔀 혼합</div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>❌ {error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input
            className="form-input"
            placeholder="🔍 TC 검색..."
            style={{ width: '200px', fontSize: '11px' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="form-select" style={{ width: 'auto', fontSize: '11px' }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">전체 유형</option>
            <option value="auto">🤖 자동</option>
            <option value="manual">👤 수동</option>
            <option value="mixed">🔀 혼합</option>
          </select>
          <select className="form-select" style={{ width: 'auto', fontSize: '11px' }} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">전체 우선순위</option>
            <option value="critical">🔴 Critical</option>
            <option value="high">🟠 High</option>
            <option value="medium">🟡 Medium</option>
            <option value="low">⚪ Low</option>
          </select>
          <select className="form-select" style={{ width: 'auto', fontSize: '11px' }}>
            <option value="">전체 모듈</option>
            {modules.map(m => <option key={m}>{m}</option>)}
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '7px' }}>
            {tcs.length > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={() => setBulkOpen(v => !v)}>전체선택</button>
            )}
            {projectId && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={generateTCs}
                disabled={generating}
              >
                {generating ? '⏳ 생성 중...' : '🔄 TC 재생성'}
              </button>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => setModalOpen(true)}>전체 이슈 등록</button>
          </div>
        </div>

        {/* Bulk bar */}
        {bulkOpen && (
          <div className="bulk-bar">
            <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
            <span>{selected.size}개 선택됨</span>
            <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setModalOpen(true)}>
              선택 이슈 등록
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setBulkOpen(false); setSelected(new Set()) }}>취소</button>
          </div>
        )}

        {/* Table */}
        <table className="tc-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
              <th>ID</th><th>제목</th><th>모듈</th><th>유형</th><th>우선순위</th><th>상태</th><th>액션</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8}>
                <div className="empty-state" style={{ padding: '48px 24px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                  <div className="empty-state-text">불러오는 중...</div>
                </div>
              </td></tr>
            ) : !projectId ? (
              <tr><td colSpan={8}>
                <div className="empty-state" style={{ padding: '48px 24px' }}>
                  <div className="empty-state-icon">📄</div>
                  <div className="empty-state-text">기획서가 없습니다</div>
                  <div className="empty-state-sub">먼저 기획서를 업로드해주세요</div>
                  <button className="btn btn-primary" style={{ marginTop: '14px' }} onClick={() => router.push('/upload')}>기획서 업로드 →</button>
                </div>
              </td></tr>
            ) : tcs.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="empty-state" style={{ padding: '48px 24px' }}>
                  <div className="empty-state-icon">🧪</div>
                  <div className="empty-state-text">TC가 없습니다</div>
                  <div className="empty-state-sub">AI가 기획서를 분석해 테스트 케이스를 생성합니다</div>
                  <button
                    className="btn btn-primary"
                    style={{ marginTop: '14px' }}
                    onClick={generateTCs}
                    disabled={generating}
                  >
                    {generating ? '⏳ 생성 중...' : '🧪 TC 생성하기'}
                  </button>
                </div>
              </td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8}>
                <div className="empty-state" style={{ padding: '48px 24px' }}>
                  <div className="empty-state-text">검색 결과 없음</div>
                </div>
              </td></tr>
            ) : filtered.map(tc => {
              const meta = TYPE_META[tc.type] ?? TYPE_META.manual
              const statusMeta = STATUS_META[tc.status] ?? STATUS_META.draft
              return (
                <tr
                  key={tc.id}
                  style={{ background: meta.bg, cursor: 'pointer' }}
                  onClick={() => router.push(`/tc-detail?tcId=${tc.id}&projectId=${projectId}`)}
                >
                  <td onClick={e => { e.stopPropagation(); toggleSelect(tc.id) }}>
                    <input type="checkbox" checked={selected.has(tc.id)} onChange={() => toggleSelect(tc.id)} />
                  </td>
                  <td style={{ fontSize: '11px', color: 'var(--gray-400)', fontFamily: 'monospace' }}>TC-{String(tc.id).padStart(3, '0')}</td>
                  <td style={{ fontWeight: 600, fontSize: '12px' }}>{tc.title}</td>
                  <td style={{ fontSize: '11px' }}>{tc.module || '—'}</td>
                  <td>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: meta.bg, border: `1px solid ${meta.border}` }}>
                      {meta.icon} {meta.label}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: PRIORITY_COLOR[tc.priority] }}>
                      {tc.priority?.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: statusMeta.color }}>{statusMeta.label}</span>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-secondary btn-sm" onClick={() => router.push(`/tc-detail?tcId=${tc.id}&projectId=${projectId}`)}>상세</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ApproveAllModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}
