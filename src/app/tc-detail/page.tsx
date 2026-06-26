'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

type TCStatus   = 'draft' | 'approved' | 'passed' | 'failed'
type TCType     = 'auto' | 'manual' | 'mixed'
type TCPriority = 'critical' | 'high' | 'medium' | 'low'
type RunResult  = 'pass' | 'fail' | 'block' | ''

interface TestCase {
  id: number
  project_id: number
  title: string
  module: string
  type: TCType
  priority: TCPriority
  status: TCStatus
  steps: string[] | string
  expected: string
}

interface CodeFile {
  id: number
  file_name: string
  content: string
}

const TYPE_META: Record<TCType, { label: string; icon: string; color: string }> = {
  auto:   { label: '자동', icon: '🤖', color: '#4F46E5' },
  manual: { label: '수동', icon: '👤', color: '#059669' },
  mixed:  { label: '혼합', icon: '🔀', color: '#D97706' },
}

const PRIORITY_COLOR: Record<TCPriority, string> = {
  critical: '#EF4444', high: '#F97316', medium: '#F59E0B', low: '#6B7280',
}

const STATUS_META: Record<TCStatus, { label: string; color: string; bg: string }> = {
  draft:    { label: '대기',  color: '#6B7280', bg: '#F3F4F6' },
  approved: { label: '승인',  color: '#4F46E5', bg: '#EEF2FF' },
  passed:   { label: 'Pass', color: '#059669', bg: '#D1FAE5' },
  failed:   { label: 'Fail', color: '#DC2626', bg: '#FEE2E2' },
}

function matchCode(tc: TestCase, codeFiles: CodeFile[]): CodeFile | null {
  const tcTag = `TC-${String(tc.id).padStart(3, '0')}`
  return codeFiles.find(f => f.file_name.includes(tcTag)) ?? null
}

export default function TCDetailPage() {
  const searchParams = useSearchParams()

  const [projectId, setProjectId]     = useState<number | null>(null)
  const [tcs, setTcs]                 = useState<TestCase[]>([])
  const [codeFiles, setCodeFiles]     = useState<CodeFile[]>([])
  const [selectedTc, setSelectedTc]   = useState<TestCase | null>(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')

  // 실행 결과
  const [result, setResult]           = useState<RunResult>('')
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)

  // 이슈 폼
  const [showIssue, setShowIssue]         = useState(false)
  const [issueTitle, setIssueTitle]       = useState('')
  const [issuePriority, setIssuePriority] = useState<TCPriority>('medium')
  const [issueDesc, setIssueDesc]         = useState('')
  const [issueSubmitting, setIssueSubmitting] = useState(false)
  const [issueCreated, setIssueCreated]   = useState(false)

  // 코드 패널
  const [showCode, setShowCode]   = useState(true)
  const [copied, setCopied]       = useState(false)

  useEffect(() => {
    const urlPid  = searchParams.get('projectId')
    const urlTcId = searchParams.get('tcId')
    const pid = urlPid
      ? Number(urlPid)
      : localStorage.getItem('testflow_project_id')
        ? Number(localStorage.getItem('testflow_project_id'))
        : null
    setProjectId(pid)
    if (!pid) { setLoading(false); return }
    loadAll(pid, urlTcId ? Number(urlTcId) : null)
  }, [])

  async function loadAll(pid: number, initialTcId: number | null) {
    setLoading(true)
    try {
      const [tcRes, codeRes] = await Promise.all([
        fetch(`/api/projects/${pid}/test-cases`),
        fetch(`/api/projects/${pid}/test-code`),
      ])
      const tcData   = await tcRes.json()
      const codeData = await codeRes.json()

      const tcList: TestCase[] = (tcData.testCases ?? []).map((tc: TestCase) => ({
        ...tc,
        steps: typeof tc.steps === 'string' ? (() => { try { return JSON.parse(tc.steps as string) } catch { return [] } })() : tc.steps,
      }))
      const files: CodeFile[] = codeData.files ?? []

      setTcs(tcList)
      setCodeFiles(files)

      if (initialTcId) {
        const found = tcList.find((t: TestCase) => t.id === initialTcId)
        if (found) selectTC(found)
      }
    } catch {
      setError('데이터 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  function selectTC(tc: TestCase) {
    setSelectedTc(tc)
    setResult('')
    setSaved(false)
    setShowIssue(false)
    setIssueCreated(false)
    setIssueTitle('')
    setIssueDesc('')
    setIssuePriority(tc.priority)
  }

  function handleResultChange(val: RunResult) {
    setResult(val)
    setSaved(false)
    setIssueCreated(false)
    if (val === 'fail' || val === 'block') {
      setShowIssue(true)
      setIssueTitle(`[${val === 'block' ? 'Block' : 'Fail'}] ${selectedTc?.title ?? ''}`)
      setIssuePriority(selectedTc?.priority ?? 'medium')
    } else {
      setShowIssue(false)
    }
  }

  async function handleSavePass() {
    if (!selectedTc) return
    setSaving(true)
    try {
      await fetch(`/api/tc/${selectedTc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'passed' }),
      })
      setTcs(prev => prev.map(t => t.id === selectedTc.id ? { ...t, status: 'passed' } : t))
      setSelectedTc(prev => prev ? { ...prev, status: 'passed' } : prev)
      setSaved(true)
    } catch { setError('저장 실패') }
    finally { setSaving(false) }
  }

  async function handleIssueSubmit() {
    if (!selectedTc || !issueTitle.trim()) return
    setIssueSubmitting(true)
    try {
      const pid = projectId ?? selectedTc.project_id
      await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: pid,
          tc_id: selectedTc.id,
          title: issueTitle,
          priority: issuePriority,
          module: selectedTc.module,
          description: issueDesc || `TC ${String(selectedTc.id).padStart(3,'0')} (${selectedTc.title}) 수행 중 발견\n결과: ${result === 'block' ? 'Blocked' : 'Failed'}\n기대결과: ${selectedTc.expected}`,
        }),
      })
      await fetch(`/api/tc/${selectedTc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'failed' }),
      })
      setTcs(prev => prev.map(t => t.id === selectedTc.id ? { ...t, status: 'failed' } : t))
      setSelectedTc(prev => prev ? { ...prev, status: 'failed' } : prev)
      setIssueCreated(true)
      setSaved(true)
    } catch { setError('이슈 등록 실패') }
    finally { setIssueSubmitting(false) }
  }

  function handleCopy(content: string) {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const steps = Array.isArray(selectedTc?.steps) ? selectedTc.steps : []
  const matchedCode = selectedTc ? matchCode(selectedTc, codeFiles) : null

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href={`/tc-list${projectId ? `?projectId=${projectId}` : ''}`} className="btn btn-secondary btn-sm">← TC 목록</Link>
          <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>테스트 수행</span>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
          {tcs.filter(t => t.status === 'passed').length}/{tcs.length} 완료
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>❌ {error}</div>}

      {loading ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--gray-400)', fontSize: '13px' }}>불러오는 중...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '14px', alignItems: 'start' }}>

          {/* 좌측: TC 목록 */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'sticky', top: '16px' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)' }}>TC 목록 ({tcs.length})</span>
            </div>
            {tcs.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 12px' }}>
                <div className="empty-state-text" style={{ fontSize: '12px' }}>TC 없음</div>
                <div className="empty-state-sub">
                  <Link href="/tc-list" style={{ color: 'var(--primary)', fontSize: '11px' }}>TC 생성하기</Link>
                </div>
              </div>
            ) : (
              <div style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
                {tcs.map(tc => {
                  const isSelected = selectedTc?.id === tc.id
                  const hasCode    = !!matchCode(tc, codeFiles)
                  return (
                    <div
                      key={tc.id}
                      onClick={() => selectTC(tc)}
                      style={{
                        padding: '10px 12px', cursor: 'pointer',
                        borderBottom: '1px solid var(--gray-100)',
                        background: isSelected ? 'var(--primary-light)' : 'white',
                        borderLeft: `3px solid ${isSelected ? 'var(--primary)' : 'transparent'}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--gray-400)' }}>
                          TC-{String(tc.id).padStart(3, '0')}
                          {hasCode && <span style={{ marginLeft: '4px', color: '#4F46E5' }}>💻</span>}
                        </span>
                        <span style={{
                          fontSize: '9px', padding: '1px 5px', borderRadius: '3px',
                          background: STATUS_META[tc.status].bg, color: STATUS_META[tc.status].color, fontWeight: 600,
                        }}>
                          {STATUS_META[tc.status].label}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', fontWeight: isSelected ? 600 : 400, color: isSelected ? 'var(--primary)' : '#374151', lineHeight: 1.3 }}>
                        {tc.title}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginTop: '2px' }}>{tc.module}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 우측: TC 상세 + 코드 + 실행 */}
          {!selectedTc ? (
            <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>▶️</div>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>왼쪽에서 TC를 선택하세요</div>
              <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>TC를 선택하면 상세 정보와 테스트 코드가 표시됩니다</div>
            </div>
          ) : (
            <div>
              {/* TC 헤더 */}
              <div className="card" style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-400)', fontFamily: 'monospace' }}>
                    TC-{String(selectedTc.id).padStart(3, '0')}
                  </span>
                  <span style={{
                    fontSize: '10px', padding: '2px 7px', borderRadius: '4px', fontWeight: 600,
                    background: STATUS_META[selectedTc.status].bg, color: STATUS_META[selectedTc.status].color,
                  }}>
                    {STATUS_META[selectedTc.status].label}
                  </span>
                </div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px', lineHeight: 1.4 }}>{selectedTc.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div style={{ background: 'var(--gray-50)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '3px' }}>모듈</div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{selectedTc.module || '—'}</div>
                  </div>
                  <div style={{ background: 'var(--gray-50)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '3px' }}>유형</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: TYPE_META[selectedTc.type]?.color }}>
                      {TYPE_META[selectedTc.type]?.icon} {TYPE_META[selectedTc.type]?.label}
                    </div>
                  </div>
                  <div style={{ background: 'var(--gray-50)', borderRadius: '6px', padding: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--gray-400)', marginBottom: '3px' }}>우선순위</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: PRIORITY_COLOR[selectedTc.priority] }}>
                      {selectedTc.priority.charAt(0).toUpperCase() + selectedTc.priority.slice(1)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', alignItems: 'start' }}>
                {/* 테스트 단계 */}
                <div>
                  <div className="card" style={{ marginBottom: '12px' }}>
                    <div className="card-header"><div className="card-title">📝 테스트 단계</div></div>
                    {steps.length === 0 ? (
                      <div className="empty-state" style={{ padding: '20px' }}>
                        <div className="empty-state-text">단계 없음</div>
                      </div>
                    ) : (
                      <>
                        <div>
                          {steps.map((step, i) => (
                            <div key={i} style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: i < steps.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
                              <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--primary)', color: 'white', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                              <span style={{ fontSize: '12px', lineHeight: 1.5, paddingTop: '2px' }}>{step}</span>
                            </div>
                          ))}
                        </div>
                        {selectedTc.expected && (
                          <div style={{ marginTop: '10px', padding: '8px 10px', background: '#F0FDF4', borderRadius: '6px', border: '1px solid #BBF7D0' }}>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: '#059669', marginBottom: '3px' }}>기대 결과</div>
                            <div style={{ fontSize: '12px', color: '#065F46', lineHeight: 1.5 }}>{selectedTc.expected}</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* 실행 결과 */}
                  <div className="card">
                    <div className="card-header"><div className="card-title">✅ 실행 결과</div></div>

                    {saved && !showIssue && (
                      <div style={{ padding: '8px 10px', background: '#D1FAE5', borderRadius: '6px', marginBottom: '10px', fontSize: '12px', color: '#065F46', fontWeight: 600 }}>
                        ✅ Pass로 저장되었습니다
                      </div>
                    )}
                    {issueCreated && (
                      <div style={{ padding: '8px 10px', background: '#D1FAE5', borderRadius: '6px', marginBottom: '10px', fontSize: '12px', color: '#065F46', fontWeight: 600 }}>
                        ✅ 이슈 등록 완료 · <Link href="/board" style={{ color: 'var(--primary)' }}>이슈 보드에서 확인</Link>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      {(['pass', 'fail', 'block'] as const).map(val => {
                        const meta = {
                          pass:  { label: 'Pass',  icon: '✅', color: '#059669', bg: '#D1FAE5', border: '#6EE7B7' },
                          fail:  { label: 'Fail',  icon: '❌', color: '#DC2626', bg: '#FEE2E2', border: '#FCA5A5' },
                          block: { label: 'Block', icon: '🚫', color: '#D97706', bg: '#FEF3C7', border: '#FCD34D' },
                        }[val]
                        const isSelected = result === val
                        return (
                          <button
                            key={val}
                            onClick={() => handleResultChange(val)}
                            style={{
                              flex: 1, padding: '10px 6px', borderRadius: '8px', cursor: 'pointer',
                              border: `2px solid ${isSelected ? meta.border : 'var(--gray-200)'}`,
                              background: isSelected ? meta.bg : 'white',
                              color: isSelected ? meta.color : 'var(--gray-400)',
                              fontWeight: isSelected ? 700 : 500, fontSize: '12px',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{ fontSize: '16px' }}>{meta.icon}</span>
                            {meta.label}
                          </button>
                        )
                      })}
                    </div>

                    {result === 'pass' && !saved && (
                      <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleSavePass} disabled={saving}>
                        {saving ? '저장 중...' : '✅ Pass 결과 저장'}
                      </button>
                    )}

                    {(result === 'fail' || result === 'block') && !issueCreated && (
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px', color: result === 'block' ? '#D97706' : '#DC2626' }}>
                          {result === 'block' ? '🚫 Block 이슈 등록' : '❌ Fail 이슈 등록'}
                        </div>
                        <div className="form-group">
                          <input
                            className="form-input"
                            value={issueTitle}
                            onChange={e => setIssueTitle(e.target.value)}
                            placeholder="이슈 제목"
                            style={{ fontSize: '12px' }}
                          />
                        </div>
                        <div className="form-group">
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {(['critical', 'high', 'medium', 'low'] as const).map(p => (
                              <button key={p} onClick={() => setIssuePriority(p)} style={{
                                flex: 1, padding: '4px 2px', borderRadius: '5px', cursor: 'pointer', fontSize: '10px',
                                border: `1.5px solid ${issuePriority === p ? PRIORITY_COLOR[p] : 'var(--gray-200)'}`,
                                background: issuePriority === p ? PRIORITY_COLOR[p] + '18' : 'white',
                                color: issuePriority === p ? PRIORITY_COLOR[p] : 'var(--gray-400)',
                                fontWeight: issuePriority === p ? 700 : 400,
                              }}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="form-group">
                          <textarea
                            className="form-textarea"
                            style={{ minHeight: '70px', fontSize: '12px' }}
                            value={issueDesc}
                            onChange={e => setIssueDesc(e.target.value)}
                            placeholder="이슈 설명 (선택)"
                          />
                        </div>
                        <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleIssueSubmit} disabled={issueSubmitting || !issueTitle.trim()}>
                          {issueSubmitting ? '등록 중...' : '📎 이슈 등록'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 매칭된 테스트 코드 */}
                <div>
                  <div style={{ background: '#1E1E2E', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #313244' }}>
                      <div>
                        <span style={{ color: '#CDD6F4', fontSize: '11px', fontFamily: 'monospace' }}>
                          {matchedCode ? matchedCode.file_name : '💻 매칭된 테스트 코드'}
                        </span>
                        {!matchedCode && (
                          <span style={{ marginLeft: '8px', fontSize: '10px', color: '#585B70' }}>
                            (TC-{String(selectedTc.id).padStart(3, '0')} 코드 없음)
                          </span>
                        )}
                      </div>
                      {matchedCode && (
                        <button
                          onClick={() => handleCopy(matchedCode.content)}
                          style={{ background: '#313244', color: '#CDD6F4', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', cursor: 'pointer' }}
                        >
                          {copied ? '✅ 복사됨' : '복사'}
                        </button>
                      )}
                    </div>
                    <div style={{ minHeight: '300px', maxHeight: '500px', overflowY: 'auto', padding: matchedCode ? '0' : '40px 16px' }}>
                      {matchedCode ? (
                        <pre style={{ margin: 0, padding: '14px', fontSize: '11px', lineHeight: 1.7, color: '#CDD6F4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {matchedCode.content}
                        </pre>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#585B70' }}>
                          <div style={{ fontSize: '24px', marginBottom: '10px' }}>💻</div>
                          <div style={{ fontSize: '12px', marginBottom: '6px' }}>이 TC에 매칭된 코드가 없습니다</div>
                          <div style={{ fontSize: '11px' }}>
                            <Link href="/code-viewer" style={{ color: '#7C3AED' }}>테스트 코드 생성하기 →</Link>
                          </div>
                        </div>
                      )}
                    </div>
                    {matchedCode && (
                      <div style={{ padding: '6px 14px', borderTop: '1px solid #313244', background: '#181825' }}>
                        <span style={{ fontSize: '10px', color: '#585B70' }}>
                          TC-{String(selectedTc.id).padStart(3, '0')} 파일명 기준으로 자동 매칭됨
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
