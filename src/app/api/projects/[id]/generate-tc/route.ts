import { type NextRequest, NextResponse } from 'next/server'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

interface TC {
  title: string
  module: string
  type: 'auto' | 'manual' | 'mixed'
  priority: 'critical' | 'high' | 'medium' | 'low'
  steps: string[]
  expected: string[]  // 스텝별 기대결과 배열 (steps와 동일 길이)
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
        { title: '로그인 성공 시나리오',  module: '인증', type: 'auto',   priority: 'critical', steps: ['사용자명 입력', '비밀번호 입력', '로그인 버튼 클릭'], expected: ['이메일 입력 필드 활성화', '비밀번호 필드 활성화', '대시보드로 이동'] },
        { title: '잘못된 비밀번호 입력',  module: '인증', type: 'auto',   priority: 'high',     steps: ['잘못된 비밀번호 입력', '로그인 클릭'], expected: ['비밀번호 필드에 오류 표시', '오류 메시지 표시'] },
        { title: '세션 만료 처리',        module: '인증', type: 'manual', priority: 'medium',   steps: ['로그인 후 장시간 대기', '페이지 요청'], expected: ['세션 유지 상태', '로그인 페이지로 리다이렉트'] },
      ]
      await saveTCs(projectId, mockTCs)
      return NextResponse.json({ count: mockTCs.length })
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({
      apiKey,
      ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
    })

    // tool_use로 구조화된 출력을 강제 → JSON 파싱 오류 원천 차단
    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 8192,
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
                  expected: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '스텝별 기대 결과 목록. steps 배열과 반드시 동일한 개수. 각 단계 수행 직후 확인해야 할 구체적 결과를 작성 (예: URL 변경, UI 요소 상태, 노출 메시지 등)',
                  },
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

규칙:
- expected 배열은 steps 배열과 반드시 동일한 개수여야 합니다
- expected의 각 항목은 해당 단계 직후 확인해야 할 구체적인 결과입니다
  - URL 이동 시 → 실제 URL 경로 포함 (예: "/login 페이지로 이동됨")
  - UI 변화 시 → 구체적인 상태 설명 (예: "이메일 입력 필드에 커서 활성화")
  - 오류 시 → 오류 메시지 문구 포함 (예: "'이메일 또는 비밀번호가 올바르지 않습니다' 메시지 표시")
  - 특별한 변화 없는 단계 → "이전 상태 유지" 대신 실제 관찰 가능한 결과 기술

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
    console.log('[generate-tc] stop_reason:', msg.stop_reason, '/ content types:', msg.content.map(b => b.type))
    if (msg.stop_reason === 'max_tokens') {
      console.error('[generate-tc] max_tokens 초과 — TC 출력이 잘림')
      return NextResponse.json({ error: 'AI 응답이 max_tokens 초과로 잘렸습니다. 관리자에게 문의하세요.' }, { status: 500 })
    }
    const toolBlock = msg.content.find(b => b.type === 'tool_use')
    if (!toolBlock) {
      const textBlock = msg.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined
      console.error('[generate-tc] tool_use block missing. text content:', textBlock?.text?.slice(0, 500))
      return NextResponse.json({ error: 'AI가 tool_use 형식으로 응답하지 않았습니다', rawText: textBlock?.text?.slice(0, 300) }, { status: 500 })
    }
    const input = 'input' in toolBlock ? toolBlock.input as { testCases: TC[] } : { testCases: [] }
    const tcs: TC[] = input.testCases ?? []
    console.log('[generate-tc] generated:', tcs.length, 'TCs | input keys:', Object.keys(input), '| raw input preview:', JSON.stringify(input).slice(0, 400))

    await saveTCs(projectId, tcs)
    return NextResponse.json({ count: tcs.length })

  } catch (err) {
    console.error('[generate-tc]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

async function saveTCs(projectId: number, tcs: TC[]) {
  for (const tc of tcs) {
    // expected를 항상 JSON 배열로 저장
    const expectedArr = Array.isArray(tc.expected)
      ? tc.expected
      : tc.expected ? [tc.expected] : []
    await pool.execute<ResultSetHeader>(
      'INSERT INTO test_cases (project_id, title, module, type, priority, steps, expected) VALUES (?,?,?,?,?,?,?)',
      [projectId, tc.title, tc.module ?? '기타', tc.type ?? 'manual', tc.priority ?? 'medium', JSON.stringify(tc.steps ?? []), JSON.stringify(expectedArr)]
    )
  }
}
