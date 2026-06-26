'use client'

import { useState, useEffect } from 'react'

interface CodeFile {
  id: number
  file_name: string
  content: string
}

export default function CodeViewerClient() {
  const [projectId, setProjectId]   = useState<number | null>(null)
  const [files, setFiles]           = useState<CodeFile[]>([])
  const [selected, setSelected]     = useState<CodeFile | null>(null)
  const [loading, setLoading]       = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    const pid = localStorage.getItem('testflow_project_id')
    if (!pid) { setLoading(false); return }
    const id = Number(pid)
    setProjectId(id)
    fetchFiles(id)
  }, [])

  async function fetchFiles(pid: number) {
    setLoading(true)
    try {
      const res  = await fetch(`/api/projects/${pid}/test-code`)
      const data = await res.json()
      const list: CodeFile[] = data.files ?? []
      setFiles(list)
      if (list.length > 0) setSelected(list[0])
    } catch {
      setError('파일 불러오기 실패')
    } finally {
      setLoading(false)
    }
  }

  async function generateCode() {
    if (!projectId) return
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/generate-code`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '코드 생성 실패')
      await fetchFiles(projectId)
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  function handleCopy() {
    if (!selected) return
    navigator.clipboard.writeText(selected.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function handleDownload() {
    if (!selected) return
    const blob = new Blob([selected.content], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = selected.file_name.split('/').pop() ?? 'test.spec.ts'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleDownloadAll() {
    files.forEach(f => {
      const blob = new Blob([f.content], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = f.file_name.split('/').pop() ?? 'test.spec.ts'
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  return (
    <>
      <div className="page-header">
        <div className="page-title">💻 테스트 코드</div>
        <div className="page-subtitle">AI가 생성한 Playwright 자동화 코드입니다</div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '12px' }}>❌ {error}</div>}

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* File list */}
        <div>
          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--gray-200)', background: 'var(--gray-50)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--gray-500)' }}>생성된 파일 목록</span>
              {files.length > 0 && (
                <span style={{ fontSize: '10px', color: 'var(--gray-400)' }}>{files.length}개 파일</span>
              )}
            </div>

            {loading ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', border: '3px solid #E5E7EB', borderTopColor: 'var(--primary)', animation: 'spin 1s linear infinite', margin: '0 auto 10px' }} />
                <div className="empty-state-text" style={{ fontSize: '12px' }}>불러오는 중...</div>
              </div>
            ) : files.length === 0 ? (
              <div className="empty-state" style={{ padding: '32px 16px' }}>
                <div className="empty-state-icon">💻</div>
                <div className="empty-state-text">생성된 파일 없음</div>
                <div className="empty-state-sub">아래 버튼으로 코드를 생성하세요</div>
              </div>
            ) : (
              <div>
                {files.map(f => (
                  <div
                    key={f.id}
                    onClick={() => setSelected(f)}
                    style={{
                      padding: '10px 14px', cursor: 'pointer', fontSize: '12px',
                      borderBottom: '1px solid var(--gray-100)',
                      background: selected?.id === f.id ? 'var(--primary-light)' : 'white',
                      color: selected?.id === f.id ? 'var(--primary)' : '#374151',
                      fontWeight: selected?.id === f.id ? 600 : 400,
                      fontFamily: 'monospace',
                      display: 'flex', alignItems: 'center', gap: '8px',
                    }}
                  >
                    <span>📄</span>
                    <span style={{ wordBreak: 'break-all' }}>{f.file_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginBottom: '8px' }}
            onClick={generateCode}
            disabled={generating || !projectId}
          >
            {generating ? '⏳ 코드 생성 중...' : '⚡ TC로 코드 생성'}
          </button>

          {files.length > 0 && (
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={handleDownloadAll}>
              📦 전체 코드 다운로드
            </button>
          )}
        </div>

        {/* Code block */}
        <div style={{ background: '#1E1E2E', borderRadius: '10px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid #313244' }}>
            <span style={{ color: '#CDD6F4', fontSize: '12px', fontFamily: 'monospace' }}>
              {selected ? selected.file_name : '파일을 선택하세요'}
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="btn btn-sm"
                style={{ background: '#313244', color: '#CDD6F4', border: 'none' }}
                onClick={handleCopy}
                disabled={!selected}
              >
                {copied ? '✅ 복사됨' : '복사'}
              </button>
              <button
                className="btn btn-sm"
                style={{ background: '#313244', color: '#CDD6F4', border: 'none' }}
                onClick={handleDownload}
                disabled={!selected}
              >
                다운로드
              </button>
            </div>
          </div>

          <div className="code-block" style={{ minHeight: '400px', maxHeight: '600px', overflowY: 'auto' }}>
            {selected ? (
              <pre style={{ margin: 0, fontSize: '12px', lineHeight: 1.7, color: '#CDD6F4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {selected.content}
              </pre>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', flexDirection: 'column', gap: '8px', color: '#585B70' }}>
                <div style={{ fontSize: '24px' }}>💻</div>
                <div style={{ fontSize: '12px' }}>파일을 선택하면 코드가 표시됩니다</div>
              </div>
            )}
          </div>

          <div style={{ padding: '8px 14px', borderTop: '1px solid #313244', background: '#181825' }}>
            <span style={{ fontSize: '10px', color: '#585B70' }}>⚠️ data-testid 없을 경우 선택자 수동 수정 필요</span>
          </div>
        </div>
      </div>
    </>
  )
}
