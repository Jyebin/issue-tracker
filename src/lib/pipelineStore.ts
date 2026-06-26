'use client'

export type StepState    = 'idle' | 'running' | 'done' | 'needs_input'
export type PipelineStatus = 'paused' | 'done'

export type PipelineResult = {
  status:    PipelineStatus
  fileName:  string
  projectId: number | null
  stepStates: StepState[]
  logs:      { m: string; t: string }[]
  elapsed:   number
  savedAt:   number
  results?: {
    tcCount:    number
    passCount:  number
    failCount:  number
    issueCount: number
  }
}

const KEY = 'testflow_pipeline'

export function savePipeline(data: PipelineResult) {
  try { localStorage.setItem(KEY, JSON.stringify(data)) } catch {}
}

export function loadPipeline(): PipelineResult | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PipelineResult) : null
  } catch { return null }
}

export function clearPipeline() {
  try { localStorage.removeItem(KEY) } catch {}
}

export function timeAgo(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 1000)
  if (d < 60)    return '방금 전'
  if (d < 3600)  return `${Math.floor(d / 60)}분 전`
  if (d < 86400) return `${Math.floor(d / 3600)}시간 전`
  return `${Math.floor(d / 86400)}일 전`
}
