'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadPipeline } from '@/lib/pipelineStore'

type Priority = 'critical' | 'high' | 'medium' | 'low'

type MissingItem = {
  id: number
  question: string
  description: string | null
  priority: Priority
  suggestions: string[] | null
  order_index: number
  answer: string | null
  answered_at: string | null
}

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'Critical', color: '#EF4444', bg: '#FEF2F2', dot: '🔴' },
  high:     { label: 'High',     color: '#F97316', bg: '#FFF7ED', dot: '🟠' },
  medium:   { label: 'Medium',   color: '#F59E0B', bg: '#FFFBEB', dot: '🟡' },
  low:      { label: 'Low',      color: '#6B7280', bg: '#F9FAFB', dot: '⚪' },
}

export default function FormPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [projectId, setProjectId] = useState<number | null>(null)
  const [isPipelineMode, setIsPipelineMode]   = useState(false)
  const [items, setItems]                     = useState<MissingItem[]>([])
  const [answers, setAnswers]                 = useState<Record<number, string>>({})
  const [showCustom, setShowCustom]           = useState<Record<number, boolean>>({})
  const [saving, setSaving]                   = useState<Record<number, boolean>>({})
  const [saved, setSaved]                     = useState<Record<number, boolean>>({})
  const [loading, setLoading]                 = useState(true)
  const [finalizing, setFinalizing]           = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const [finalSpec, setFinalSpec]             = useState<string | null>(null)

  // 로드
  useEffect(() => {
    const pipeline = loadPipeline()
    setIsPipelineMode(pipeline?.status === 'paused')

    // 우선순위: URL 파라미터 → 파이프라인 스토어 → localStorage
    const urlPid = searchParams.get('projectId')
    const pid = urlPid
      ? Number(urlPid)
      : pipeline?.projectId
        ?? (localStorage.getItem('testflow_project_id') ? Number(localStorage.getItem('testflow_project_id')) : null)
    setProjectId(pid)

    if (!pid) {
      setLoading(false)
      return
    }

    fetch(`/api/projects/${pid}/missing-items`)
      .then(r => r.json())
      .then(({ items: rows }: { items: MissingItem[] }) => {
        setItems(rows)
        const initial: Record<number, string> = {}
        const initSaved: Record<number, boolean> = {}
        rows.forEach(row => {
          initial[row.id]  = row.answer ?? ''
          initSaved[row.id] = !!row.answer
        })
        setAnswers(initial)
        setSaved(initSaved)
      })
      .catch(() => setError('항목 불러오기 실패'))
      .finally(() => setLoading(false))
  }, [])

  const saveAnswer = useCallback(async (itemId: number, answer: string) => {
    if (!answer.trim()) return
    setSaving(p => ({ ...p, [itemId]: true }))
    try {
      await fetch(`/api/missing-items/${itemId}/answer`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer }),
      })
      setSaved(p => ({ ...p, [itemId]: true }))
    } catch {
      // silent fail — user can retry
    } finally {
      setSaving(p => ({ ...p, [itemId]: false }))
    }
  }, [])

  async function handleFinalize() {
    if (!projectId) return
    setFinalizing(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/finalize`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json()).error ?? '최종화 실패')
      const data = await res.json()
      setFinalSpec(data.content)
    } catch (e) {
      setError(String(e))
    } finally {
      setFinalizing(false)
    }
  }

  function handleContinue() {
    router.push(isPipelineMode ? '/dashboard?resume=1' : '/tc-list')
  }

  const answeredCount = items.filter(it => saved[it.id]).length
  const totalCount    = items.length
  const allAnswered   = totalCount > 0 && answeredCount === totalCount
  const progress      = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0

  const countOf = (p: Priority) => items.filter(it => it.priority === p).length

  // ── Final spec modal ──────────────────────────────────────────────
  if (finalSpec) {
    return (
      <>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '4px' }}>✅ 최종 기획서 생성 완료</div>
          <div style={{ fontSize: '12px', color: 'var(--gray-400)' }}>AI가 원본 기획서와 보완 항목을 합쳐 최종 기획서를 생성했습니다</div>
        </div>

        <div className="card" style={{ marginBottom: '16px', maxHeight: '480px', overflowY: 'auto' }}>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px', lineHeight: 1.8, color: '#374151', fontFamily: 'inherit' }}>
            {finalSpec}
          </pre>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => setFinalSpec(null)}>← 돌아가기</button>
          <button
            onClick={handleContinue}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 22px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg,var(--success),#059669)',
              color: 'white', fontWeight: 700, fontSize: '14px',
              boxShadow: '0 4px 14px rgba(16,185,129,.35)',
            }}
          >
            {isPipelineMode ? '🚀 파이프라인 계속 →' : '다음 →'}
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Pipeline banner */}
      {isPipelineMode && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '12px',
          background: 'linear-gradient(135deg,#FEF3C7,#FDE68A)',
          border: '1px solid #F59E0B', borderRadius: '10px',
          padding: '14px 16px', marginBottom: '18px',
        }}>
          <span style={{ fontSize: '20px', flexShrink: 0 }}>⚡</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#78350F', marginBottom: '3px' }}>
              자동 실행 중 · 1단계 완료 — 사용자 확인 필요
            </div>
            <div style={{ fontSize: '11px', color: '#92400E', lineHeight: 1.7 }}>
              기획서 분석에서 누락 항목이 감지되었습니다. 아래 항목을 모두 보완한 후
              <strong> &ldquo;최종 기획서 생성&rdquo;</strong> 버튼을 눌러 파이프라인을 이어가세요.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div className="page-title">📋 누락 항목 보완</div>
        <div className="page-subtitle">AI가 감지한 누락 항목에 대해 답변해주세요</div>
      </div>

      {/* Priority badges */}
      <div style={{ display: 'flex', gap: '7px', marginBottom: '14px', flexWrap: 'wrap' }}>
        {(['critical', 'high', 'medium', 'low'] as Priority[]).map(p => (
          countOf(p) > 0 && (
            <span key={p} style={{
              fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '20px',
              background: PRIORITY_META[p].bg, color: PRIORITY_META[p].color,
              border: `1px solid ${PRIORITY_META[p].color}30`,
            }}>
              {PRIORITY_META[p].dot} {PRIORITY_META[p].label} {countOf(p)}건
            </span>
          )
        ))}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{ fontSize: '11px', color: 'var(--gray-400)', whiteSpace: 'nowrap' }}>답변 진행률</span>
          <div style={{ flex: 1, height: '8px', background: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '4px', transition: 'width .4s',
              background: allAnswered ? 'var(--success)' : 'var(--primary)',
              width: `${progress}%`,
            }} />
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: allAnswered ? 'var(--success)' : 'var(--primary)', whiteSpace: 'nowrap' }}>
            {answeredCount} / {totalCount}
          </span>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
            <div className="empty-state-text">항목 불러오는 중...</div>
          </div>
        </div>
      )}

      {/* No project state */}
      {!loading && !projectId && (
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <div className="empty-state-icon">📄</div>
            <div className="empty-state-text">기획서가 업로드되지 않았습니다</div>
            <div className="empty-state-sub">기획서를 먼저 업로드해주세요</div>
            <button className="btn btn-primary" style={{ marginTop: '16px' }} onClick={() => router.push('/upload')}>
              기획서 업로드 →
            </button>
          </div>
        </div>
      )}

      {/* Empty items state */}
      {!loading && projectId && items.length === 0 && (
        <div className="card">
          <div className="empty-state" style={{ padding: '60px 24px' }}>
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-text">누락 항목이 없습니다</div>
            <div className="empty-state-sub">AI 분석 결과 기획서에 누락된 항목이 없습니다</div>
            <button
              onClick={handleContinue}
              style={{
                marginTop: '16px', padding: '12px 24px', borderRadius: '10px', border: 'none',
                cursor: 'pointer', fontWeight: 700, fontSize: '14px', color: 'white',
                background: 'linear-gradient(135deg,var(--success),#059669)',
                boxShadow: '0 4px 14px rgba(16,185,129,.35)',
              }}
            >
              {isPipelineMode ? '🚀 파이프라인 계속 →' : '다음으로 →'}
            </button>
          </div>
        </div>
      )}

      {error && <div className="alert alert-danger" style={{ marginBottom: '12px' }}>❌ {error}</div>}

      {/* Form cards — Naver form style */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          {items.map((item, idx) => {
            const p      = PRIORITY_META[item.priority]
            const ans    = answers[item.id] ?? ''
            const isSaved = saved[item.id]
            const isSaving = saving[item.id]

            const suggestions: string[] = Array.isArray(item.suggestions)
              ? item.suggestions
              : (typeof item.suggestions === 'string' ? JSON.parse(item.suggestions) : [])
            const isCustom = showCustom[item.id] ?? false

            return (
              <div key={item.id} className="card" style={{
                borderLeft: `4px solid ${p.color}`,
                transition: 'box-shadow .2s',
              }}>
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
                  <div style={{
                    width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                    background: isSaved ? 'var(--success)' : 'var(--primary)',
                    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px', fontWeight: 700,
                  }}>
                    {isSaved ? '✓' : idx + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                      <span style={{
                        fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
                        background: p.bg, color: p.color, border: `1px solid ${p.color}30`,
                      }}>
                        {p.dot} {p.label}
                      </span>
                      {isSaved && (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--success)' }}>✅ 저장됨</span>
                      )}
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#1F2937', lineHeight: 1.5 }}>
                      {item.question} <span style={{ color: '#EF4444', fontSize: '13px' }}>*</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                {item.description && (
                  <div style={{
                    fontSize: '12px', color: '#6B7280', lineHeight: 1.7,
                    background: '#F9FAFB', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px',
                  }}>
                    💡 {item.description}
                  </div>
                )}

                {/* Suggestion chips */}
                {suggestions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                    {suggestions.map((s, i) => {
                      const isSelected = ans === s && !isCustom
                      return (
                        <button
                          key={i}
                          onClick={() => {
                            setAnswers(prev => ({ ...prev, [item.id]: s }))
                            setSaved(prev => ({ ...prev, [item.id]: false }))
                            setShowCustom(prev => ({ ...prev, [item.id]: false }))
                            saveAnswer(item.id, s)
                          }}
                          style={{
                            padding: '8px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                            cursor: 'pointer', transition: 'all .15s',
                            border: `2px solid ${isSelected ? p.color : '#E5E7EB'}`,
                            background: isSelected ? p.bg : 'white',
                            color: isSelected ? p.color : '#374151',
                          }}
                        >
                          {isSelected ? '✓ ' : ''}{s}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => {
                        setShowCustom(prev => ({ ...prev, [item.id]: true }))
                        setAnswers(prev => ({ ...prev, [item.id]: '' }))
                        setSaved(prev => ({ ...prev, [item.id]: false }))
                      }}
                      style={{
                        padding: '8px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                        cursor: 'pointer', transition: 'all .15s',
                        border: `2px solid ${isCustom ? '#6B7280' : '#E5E7EB'}`,
                        background: isCustom ? '#F9FAFB' : 'white',
                        color: '#6B7280',
                      }}
                    >
                      ✏️ 기타
                    </button>
                  </div>
                )}

                {/* Answer textarea — suggestions 없거나 기타 선택 시 표시 */}
                {(suggestions.length === 0 || isCustom) && (
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={ans}
                    onChange={e => {
                      setAnswers(prev => ({ ...prev, [item.id]: e.target.value }))
                      setSaved(prev => ({ ...prev, [item.id]: false }))
                    }}
                    onBlur={() => saveAnswer(item.id, ans)}
                    rows={4}
                    placeholder="답변을 입력해주세요..."
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '12px 14px', fontSize: '13px', lineHeight: 1.7,
                      border: `2px solid ${isSaved ? 'var(--success)' : ans.trim() ? 'var(--primary)' : '#E5E7EB'}`,
                      borderRadius: '10px', resize: 'vertical', outline: 'none',
                      fontFamily: 'inherit', color: '#1F2937', background: isSaved ? '#F0FDF4' : 'white',
                      transition: 'border-color .2s, background .2s',
                    }}
                  />
                  {isSaving && (
                    <div style={{
                      position: 'absolute', bottom: '10px', right: '10px',
                      fontSize: '11px', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: '4px',
                    }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', border: '2px solid #D1D5DB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
                      저장 중
                    </div>
                  )}
                </div>
                )}

                {/* Manual save button — 기타 직접 입력 시에만 표시 */}
                {(suggestions.length === 0 || isCustom) && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button
                    onClick={() => saveAnswer(item.id, ans)}
                    disabled={!ans.trim() || isSaving}
                    style={{
                      fontSize: '12px', fontWeight: 600, padding: '6px 14px', borderRadius: '8px',
                      border: '1px solid var(--primary)', cursor: ans.trim() ? 'pointer' : 'default',
                      color: isSaved ? 'var(--success)' : 'var(--primary)',
                      background: isSaved ? '#F0FDF4' : 'white', opacity: !ans.trim() ? 0.4 : 1,
                      borderColor: isSaved ? 'var(--success)' : 'var(--primary)',
                    }}
                  >
                    {isSaved ? '✅ 저장됨' : '저장'}
                  </button>
                </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={() => router.push('/dashboard')}>← 대시보드</button>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {!allAnswered && (
              <span style={{ fontSize: '11px', color: 'var(--gray-400)' }}>
                {totalCount - answeredCount}개 항목 미답변
              </span>
            )}
            <button
              onClick={handleFinalize}
              disabled={!allAnswered || finalizing}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '13px 22px', borderRadius: '10px', border: 'none',
                cursor: allAnswered ? 'pointer' : 'default',
                fontWeight: 700, fontSize: '14px', color: 'white',
                background: allAnswered
                  ? 'linear-gradient(135deg,var(--success),#059669)'
                  : '#9CA3AF',
                boxShadow: allAnswered ? '0 4px 14px rgba(16,185,129,.35)' : 'none',
                opacity: finalizing ? 0.7 : 1,
                transition: 'all .2s',
              }}
            >
              {finalizing
                ? (<><div style={{ width: '14px', height: '14px', borderRadius: '50%', border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'white', animation: 'spin 1s linear infinite' }} />최종 기획서 생성 중...</>)
                : '✅ 최종 기획서 생성'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
