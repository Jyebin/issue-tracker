import { type NextRequest, NextResponse } from 'next/server'
import type { ResultSetHeader } from 'mysql2'
import pool from '@/lib/db'

const ANALYSIS_PROMPT = `당신은 시니어 QA 엔지니어입니다. 이 기획서를 분석해서 테스트 케이스를 작성할 때 필요한데 누락된 정보를 찾아주세요.

누락 항목을 찾고, 반드시 아래 JSON 형식으로만 응답하세요. 설명이나 다른 텍스트 없이 JSON만 출력하세요.
priority 값은 반드시 "critical", "high", "medium", "low" 중 하나의 문자열이어야 합니다.
suggestions는 해당 질문에 대한 현실적인 답변 후보 3개를 짧고 명확하게 작성하세요.

{
  "featureCount": 8,
  "missingItems": [
    {
      "question": "질문 내용",
      "description": "이 정보가 필요한 이유",
      "priority": "high",
      "suggestions": ["후보 답변 1", "후보 답변 2", "후보 답변 3"]
    }
  ]
}`

function parseClaudeJson(raw: string): { featureCount: number; missingItems: { question: string; description: string; priority: string }[] } {
  const stripped = raw.replace(/```[\w]*\n?/g, '').trim()
  const start = stripped.indexOf('{')
  const end   = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('JSON 블록 없음')
  return JSON.parse(stripped.slice(start, end + 1))
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
    }

    const buffer   = Buffer.from(await file.arrayBuffer())
    const fileName = file.name
    const ext      = fileName.split('.').pop()?.toLowerCase() ?? ''

    const apiKey = process.env.ANTHROPIC_API_KEY

    // ── mock 모드 (API 키 없음) ───────────────────────────────────────
    if (!apiKey) {
      let extractedText = ''
      try {
        if (ext === 'docx' || ext === 'doc') {
          const mammoth = await import('mammoth')
          extractedText = (await mammoth.extractRawText({ buffer })).value
        } else if (ext !== 'pdf' && ext !== 'png' && ext !== 'jpg' && ext !== 'jpeg') {
          extractedText = buffer.toString('utf-8')
        }
      } catch { /* ignore */ }

      const [projRes] = await pool.execute<ResultSetHeader>(
        'INSERT INTO projects (title, status) VALUES (?, ?)',
        [fileName, 'analyzing']
      )
      const projectId = projRes.insertId
      const [specRes] = await pool.execute<ResultSetHeader>(
        'INSERT INTO specs (project_id, file_name, file_type, original_text) VALUES (?, ?, ?, ?)',
        [projectId, fileName, ext, extractedText || '[파일]']
      )
      const specId = specRes.insertId

      const mockItems = [
        { question: '로그인 실패 시 계정 잠금 정책은?', description: '연속 실패 횟수, 잠금 해제 방법이 명세 없음', priority: 'critical' },
        { question: '비밀번호 유효성 검사 기준은?', description: '최소 길이, 특수문자 포함 여부 등이 불명확', priority: 'high' },
        { question: '세션 만료 시간은?', description: '자동 로그아웃 시점이 명세 없음', priority: 'medium' },
      ]
      for (let idx = 0; idx < mockItems.length; idx++) {
        const item = mockItems[idx]
        await pool.execute(
          'INSERT INTO missing_items (project_id, spec_id, question, description, priority, order_index) VALUES (?,?,?,?,?,?)',
          [projectId, specId, item.question, item.description, item.priority, idx]
        )
      }
      await pool.execute('UPDATE projects SET status=? WHERE id=?', ['needs_input', projectId])
      return NextResponse.json({ projectId, featureCount: 8, missingCount: mockItems.length })
    }

    // ── Claude API 분석 ──────────────────────────────────────────────
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({ apiKey })

    let extractedText = ''
    let analysisContent: Parameters<typeof client.messages.create>[0]['messages'][0]['content']

    if (ext === 'pdf') {
      // PDF → Claude 네이티브 문서 지원
      const base64 = buffer.toString('base64')
      analysisContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as never,
        { type: 'text', text: ANALYSIS_PROMPT },
      ]
    } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
      // 이미지 → Claude Vision
      const base64    = buffer.toString('base64')
      const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg'
      analysisContent = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: ANALYSIS_PROMPT },
      ]
    } else {
      // 텍스트 계열 → 직접 추출 후 전송
      try {
        if (ext === 'docx' || ext === 'doc') {
          const mammoth = await import('mammoth')
          extractedText = (await mammoth.extractRawText({ buffer })).value
        } else {
          extractedText = buffer.toString('utf-8')
        }
      } catch {
        extractedText = buffer.toString('utf-8')
      }
      if (!extractedText.trim()) {
        return NextResponse.json({ error: '텍스트를 추출할 수 없습니다' }, { status: 422 })
      }
      analysisContent = `기획서:\n---\n${extractedText.slice(0, 12000)}\n---\n\n${ANALYSIS_PROMPT}`
    }

    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: analysisContent }],
    })

    const raw = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'

    let parsed: { featureCount: number; missingItems: { question: string; description: string; priority: string; suggestions?: string[] }[] }
    try {
      parsed = parseClaudeJson(raw)
    } catch (parseErr) {
      console.error('[upload] JSON 파싱 실패:', raw.slice(0, 300), parseErr)
      parsed = { featureCount: 0, missingItems: [] }
    }

    // ── DB 저장 ──────────────────────────────────────────────────────
    const [projRes] = await pool.execute<ResultSetHeader>(
      'INSERT INTO projects (title, status) VALUES (?, ?)',
      [fileName, 'analyzing']
    )
    const projectId = projRes.insertId

    const [specRes] = await pool.execute<ResultSetHeader>(
      'INSERT INTO specs (project_id, file_name, file_type, original_text) VALUES (?, ?, ?, ?)',
      [projectId, fileName, ext, extractedText || '[이진 파일]']
    )
    const specId = specRes.insertId

    const missingItems = parsed.missingItems ?? []
    for (let idx = 0; idx < missingItems.length; idx++) {
      const item = missingItems[idx]
      const suggestions = Array.isArray(item.suggestions) ? JSON.stringify(item.suggestions) : null
      await pool.execute(
        'INSERT INTO missing_items (project_id, spec_id, question, description, priority, suggestions, order_index) VALUES (?,?,?,?,?,?,?)',
        [projectId, specId, item.question, item.description, item.priority ?? 'medium', suggestions, idx]
      )
    }

    await pool.execute('UPDATE projects SET status=? WHERE id=?', ['needs_input', projectId])

    return NextResponse.json({
      projectId,
      featureCount: parsed.featureCount ?? 0,
      missingCount: missingItems.length,
    })
  } catch (err) {
    console.error('[upload]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
