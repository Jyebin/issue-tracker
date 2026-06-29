'use client'

import React from 'react'

export type Priority = 'critical' | 'high' | 'medium' | 'low'

export const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string; dot: string }> = {
  critical: { label: 'Critical', color: '#EF4444', bg: '#FEF2F2', dot: '🔴' },
  high:     { label: 'High',     color: '#F97316', bg: '#FFF7ED', dot: '🟠' },
  medium:   { label: 'Medium',   color: '#F59E0B', bg: '#FFFBEB', dot: '🟡' },
  low:      { label: 'Low',      color: '#6B7280', bg: '#F9FAFB', dot: '⚪' },
}

export type SharedMissingItem = {
  id: number
  question: string
  description: string | null
  priority: Priority
  suggestions: string[]
}

interface MissingItemCardProps {
  item: SharedMissingItem
  index: number
  answer: string
  isAnswered: boolean    // shows ✓ circle
  isSaving?: boolean     // shows spinner in textarea
  isCustom: boolean      // "기타" textarea open
  onChipSelect: (s: string) => void  // select a chip (not already selected)
  onChipEdit: () => void             // re-click selected chip → open edit
  onCustomOpen: () => void           // "기타" button
  onAnswerChange: (value: string) => void
  onBlur?: () => void                // auto-save on blur (form page)
  onSave?: () => void                // manual save button (form page only)
}

export default function MissingItemCard({
  item, index, answer, isAnswered, isSaving, isCustom,
  onChipSelect, onChipEdit, onCustomOpen, onAnswerChange, onBlur, onSave,
}: MissingItemCardProps) {
  const p   = PRIORITY_META[item.priority] ?? PRIORITY_META.medium
  const ans = answer ?? ''

  return (
    <div className="card" style={{ borderLeft: `4px solid ${p.color}`, transition: 'box-shadow .2s' }}>

      {/* Header: number circle + priority badge + question */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '12px' }}>
        <div style={{
          width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
          background: isAnswered ? 'var(--success)' : 'var(--primary)',
          color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 700,
        }}>
          {isAnswered ? '✓' : index + 1}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
            <span style={{
              fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '12px',
              background: p.bg, color: p.color, border: `1px solid ${p.color}30`,
            }}>
              {p.dot} {p.label}
            </span>
            {isAnswered && (
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--success)' }}>✅ 완료</span>
            )}
          </div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#1F2937', lineHeight: 1.5 }}>
            {item.question} <span style={{ color: '#EF4444', fontSize: '13px' }}>*</span>
          </div>
        </div>
      </div>

      {/* Description bubble */}
      {item.description && (
        <div style={{
          fontSize: '12px', color: '#6B7280', lineHeight: 1.7,
          background: '#F9FAFB', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px',
        }}>
          💡 {item.description}
        </div>
      )}

      {/* Suggestion chips */}
      {item.suggestions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {item.suggestions.map((s, i) => {
            const isSelected = ans === s && !isCustom
            return (
              <span key={i} className={isSelected ? 'tooltip-wrap' : ''}>
                {isSelected && <span className="tooltip-box">내용 편집</span>}
                <button
                  onClick={() => isSelected ? onChipEdit() : onChipSelect(s)}
                  style={{
                    padding: '8px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    cursor: 'pointer', transition: 'all .15s',
                    border: `2px solid ${isSelected ? p.color : '#E5E7EB'}`,
                    background: isSelected ? p.bg : 'white',
                    color: isSelected ? p.color : '#374151',
                  }}
                >
                  {isSelected ? '✓ ' : ''}{s}{isSelected ? ' ✏️' : ''}
                </button>
              </span>
            )
          })}
          <button
            onClick={onCustomOpen}
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

      {/* Textarea */}
      {(item.suggestions.length === 0 || isCustom) && (
        <div style={{ position: 'relative' }}>
          <textarea
            value={ans}
            onChange={e => onAnswerChange(e.target.value)}
            onBlur={onBlur}
            rows={4}
            placeholder="답변을 입력해주세요..."
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '12px 14px', fontSize: '13px', lineHeight: 1.7,
              border: `2px solid ${isAnswered ? 'var(--success)' : ans.trim() ? 'var(--primary)' : '#E5E7EB'}`,
              borderRadius: '10px', resize: 'vertical', outline: 'none',
              fontFamily: 'inherit', color: '#1F2937',
              background: isAnswered ? '#F0FDF4' : 'white',
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

      {/* Manual save button (optional — shown only when onSave is provided) */}
      {onSave && (item.suggestions.length === 0 || isCustom) && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button
            onClick={onSave}
            disabled={!ans.trim() || isSaving}
            style={{
              fontSize: '12px', fontWeight: 600, padding: '6px 14px', borderRadius: '8px',
              cursor: ans.trim() ? 'pointer' : 'default',
              color: isAnswered ? 'var(--success)' : 'var(--primary)',
              background: isAnswered ? '#F0FDF4' : 'white',
              border: `1px solid ${isAnswered ? 'var(--success)' : 'var(--primary)'}`,
              opacity: !ans.trim() ? 0.4 : 1,
            }}
          >
            {isAnswered ? '✅ 저장됨' : '저장'}
          </button>
        </div>
      )}
    </div>
  )
}
