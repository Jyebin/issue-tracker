import { type NextRequest, NextResponse } from 'next/server'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

interface TC {
  title: string
  module: string
  type: 'auto' | 'manual' | 'mixed'
  priority: 'critical' | 'high' | 'medium' | 'low'
  steps: string[]
  expected: string
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = parseInt(params.id)

    await pool.execute('DELETE FROM test_cases WHERE project_id = ?', [projectId])

    const [[spec]] = await pool.execute<RowDataPacket[]>(
      'SELECT original_text FROM specs WHERE project_id = ? LIMIT 1',
      [projectId]
    )
    const [qaRows] = await pool.execute<RowDataPacket[]>(
      `SELECT mi.question, mia.answer
       FROM missing_items mi
       LEFT JOIN missing_item_answers mia ON mi.id = mia.missing_item_id
       WHERE mi.project_id = ? AND mia.answer IS NOT NULL`,
      [projectId]
    )

    const specText = spec?.original_text ?? ''
    const qaText   = (qaRows as RowDataPacket[])
      .map(r => `Q: ${r.question}\nA: ${r.answer}`)
      .join('\n\n')

    const apiKey = process.env.ANTHROPIC_API_KEY

    if (!apiKey) {
      const mockTCs: TC[] = [
        { title: '로그인 성공 시나리오',  module: '인증', type: 'auto',   priority: 'critical', steps: ['사용자명 입력', '비밀번호 입력', '로그인 버튼 클릭'], expected: '대시보드로 이동' },
        { title: '잘못된 비밀번호 입력',  module: '인증', type: 'auto',   priority: 'high',     steps: ['잘못된 비밀번호 입력', '로그인 클릭'], expected: '오류 메시지 표시' },
        { title: '세션 만료 처리',        module: '인증', type: 'manual', priority: 'medium',   steps: ['로그인 후 장시간 대기', '페이지 요청'], expected: '로그인 페이지로 리다이렉트' },
      ]
      await saveTCs(projectId, mockTCs)
      return NextResponse.json({ count: mockTCs.length })
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({ apiKey })

    // tool_use로 구조화된 출력을 강제 → JSON 파싱 오류 원천 차단
    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      tools: [{
        name:        'save_test_cases',
        description: '생성한 테스트 케이스 목록을 저장한다',
        input_schema: {
          type: 'object',
          properties: {
            testCases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title:    { type: 'string', description: 'TC 제목' },
                  module:   { type: 'string', description: '기능 모듈명' },
                  type:     { type: 'string', enum: ['auto', 'manual', 'mixed'] },
                  priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
                  steps:    { type: 'array', items: { type: 'string' }, description: '테스트 단계 목록' },
                  expected: { type: 'string', description: '기대 결과' },
                },
                required: ['title', 'module', 'type', 'priority', 'steps', 'expected'],
              },
            },
          },
          required: ['testCases'],
        },
      }],
      tool_choice: { type: 'tool', name: 'save_test_cases' },
      messages: [{
        role: 'user',
        content: `당신은 시니어 QA 엔지니어입니다. 아래 기획서와 보완 Q&A를 바탕으로 테스트 케이스를 생성하고 save_test_cases 툴을 호출하세요.

기획서:
---
${specText.slice(0, 8000)}
---

보완 Q&A:
---
${qaText.slice(0, 3000) || '없음'}
---`,
      }],
    })

    // tool_use 블록에서 input 추출
    const toolBlock = msg.content.find(b => b.type === 'tool_use')
    const input = toolBlock && 'input' in toolBlock ? toolBlock.input as { testCases: TC[] } : { testCases: [] }
    const tcs: TC[] = input.testCases ?? []

    await saveTCs(projectId, tcs)
    return NextResponse.json({ count: tcs.length })

  } catch (err) {
    console.error('[generate-tc]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function saveTCs(projectId: number, tcs: TC[]) {
  for (const tc of tcs) {
    await pool.execute<ResultSetHeader>(
      'INSERT INTO test_cases (project_id, title, module, type, priority, steps, expected) VALUES (?,?,?,?,?,?,?)',
      [projectId, tc.title, tc.module ?? '기타', tc.type ?? 'manual', tc.priority ?? 'medium', JSON.stringify(tc.steps ?? []), tc.expected ?? '']
    )
  }
}
