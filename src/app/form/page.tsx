'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadPipeline } from '@/lib/pipelineStore'
import MissingItemCard, { PRIORITY_META, type Priority, type SharedMissingItem } from '@/components/MissingItemCard'

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

function FormPageContent() {
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

      {/* Form cards */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          {items.map((item, idx) => {
            const suggestions: string[] = Array.isArray(item.suggestions)
              ? item.suggestions
              : (typeof item.suggestions === 'string' ? JSON.parse(item.suggestions as string) : [])

            const sharedItem: SharedMissingItem = {
              id: item.id,
              question: item.question,
              description: item.description,
              priority: item.priority,
              suggestions,
            }

            return (
              <MissingItemCard
                key={item.id}
                item={sharedItem}
                index={idx}
                answer={answers[item.id] ?? ''}
                isAnswered={!!saved[item.id]}
                isSaving={!!saving[item.id]}
                isCustom={!!showCustom[item.id]}
                onChipSelect={s => {
                  setAnswers(prev => ({ ...prev, [item.id]: s }))
                  setSaved(prev => ({ ...prev, [item.id]: false }))
                  setShowCustom(prev => ({ ...prev, [item.id]: false }))
                  saveAnswer(item.id, s)
                }}
                onChipEdit={() => {
                  setShowCustom(prev => ({ ...prev, [item.id]: true }))
                  setSaved(prev => ({ ...prev, [item.id]: false }))
                }}
                onCustomOpen={() => {
                  setShowCustom(prev => ({ ...prev, [item.id]: true }))
                  setAnswers(prev => ({ ...prev, [item.id]: '' }))
                  setSaved(prev => ({ ...prev, [item.id]: false }))
                }}
                onAnswerChange={v => {
                  setAnswers(prev => ({ ...prev, [item.id]: v }))
                  setSaved(prev => ({ ...prev, [item.id]: false }))
                }}
                onBlur={() => saveAnswer(item.id, answers[item.id] ?? '')}
                onSave={() => saveAnswer(item.id, answers[item.id] ?? '')}
              />
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


export default function FormPage() {
  return (
    <Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', fontSize: '14px' }}>로딩 중...</div>}>
      <FormPageContent />
    </Suspense>
  )
}
