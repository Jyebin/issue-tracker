import { type NextRequest, NextResponse } from 'next/server'
import type { ResultSetHeader } from 'mysql2'
import pool from '@/lib/db'

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

    // ── 1. 텍스트 추출 ──────────────────────────────────────────────
    let extractedText = ''
    try {
      if (ext === 'pdf') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>
        const data     = await pdfParse(buffer)
        extractedText  = data.text
      } else if (ext === 'docx' || ext === 'doc') {
        const mammoth = await import('mammoth')
        const result  = await mammoth.extractRawText({ buffer })
        extractedText = result.value
      } else {
        extractedText = buffer.toString('utf-8')
      }
    } catch {
      extractedText = buffer.toString('utf-8')
    }

    if (!extractedText.trim()) {
      return NextResponse.json({ error: '텍스트를 추출할 수 없습니다' }, { status: 422 })
    }

    // ── 2. DB: 프로젝트 + 기획서 저장 ───────────────────────────────
    const [projRes] = await pool.execute<ResultSetHeader>(
      'INSERT INTO projects (title, status) VALUES (?, ?)',
      [fileName, 'analyzing']
    )
    const projectId = projRes.insertId

    const [specRes] = await pool.execute<ResultSetHeader>(
      'INSERT INTO specs (project_id, file_name, file_type, original_text) VALUES (?, ?, ?, ?)',
      [projectId, fileName, ext, extractedText]
    )
    const specId = specRes.insertId

    // ── 3. Claude로 누락 항목 분석 ──────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // API 키 없을 때 mock 데이터 반환 (개발 편의)
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

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({ apiKey })

    const prompt = `당신은 시니어 QA 엔지니어입니다. 아래 기획서를 분석해서 테스트 케이스를 작성할 때 필요한데 누락된 정보를 찾아주세요.

기획서:
---
${extractedText.slice(0, 12000)}
---

누락 항목을 찾고, 반드시 아래 JSON 형식으로만 응답하세요 (마크다운 코드블록 없이 순수 JSON):
{
  "featureCount": <감지된 기능 수, 숫자>,
  "missingItems": [
    {
      "question": "<PM/개발자에게 물어볼 구체적인 질문 (한국어)>",
      "description": "<이 정보가 테스트에 왜 필요한지 (한국어)>",
      "priority": "critical" | "high" | "medium" | "low"
    }
  ]
}`

    const msg      = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    })

    const raw     = msg.content[0].type === 'text' ? msg.content[0].text.trim() : '{}'
    // JSON 블록이 있다면 안쪽만 꺼냄
    const jsonStr = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '')
    const parsed  = JSON.parse(jsonStr) as {
      featureCount: number
      missingItems: { question: string; description: string; priority: string }[]
    }

    const missingItems = parsed.missingItems ?? []
    for (let idx = 0; idx < missingItems.length; idx++) {
      const item = missingItems[idx]
      await pool.execute(
        'INSERT INTO missing_items (project_id, spec_id, question, description, priority, order_index) VALUES (?,?,?,?,?,?)',
        [projectId, specId, item.question, item.description, item.priority ?? 'medium', idx]
      )
    }

    await pool.execute('UPDATE projects SET status=? WHERE id=?', ['needs_input', projectId])

    return NextResponse.json({
      projectId,
      featureCount: parsed.featureCount ?? 0,
      missingCount: (parsed.missingItems ?? []).length,
    })
  } catch (err) {
    console.error('[upload]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
