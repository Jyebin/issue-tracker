import { type NextRequest, NextResponse } from 'next/server'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = parseInt(params.id)

    await pool.execute('DELETE FROM test_code WHERE project_id = ?', [projectId])

    // auto/mixed TC만 가져옴
    const [tcRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, title, module, steps, expected
       FROM test_cases
       WHERE project_id = ? AND type IN ('auto', 'mixed')
       ORDER BY id`,
      [projectId]
    )
    const tcs = tcRows as { id: number; title: string; module: string; steps: string | string[]; expected: string }[]

    if (tcs.length === 0) {
      return NextResponse.json({ error: '자동화 가능한 TC(auto/mixed)가 없습니다' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY

    // mock fallback
    if (!apiKey) {
      const mockCode = `import { test, expect } from '@playwright/test'

test.describe('자동 생성 테스트', () => {
  test('TC-001: 로그인 성공', async ({ page }) => {
    await page.goto('/')
    await page.fill('[data-testid="username"]', 'standard_user')
    await page.fill('[data-testid="password"]', 'secret_sauce')
    await page.click('[data-testid="login-button"]')
    await expect(page).toHaveURL('/inventory.html')
  })
})`
      const [res] = await pool.execute<ResultSetHeader>(
        'INSERT INTO test_code (project_id, file_name, content) VALUES (?, ?, ?)',
        [projectId, 'tests/generated.spec.ts', mockCode]
      )
      void res
      return NextResponse.json({ count: 1 })
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({
      apiKey,
      ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
    })

    let count = 0
    for (const tc of tcs) {
      let steps: string[] = []
      try {
        steps = Array.isArray(tc.steps) ? tc.steps : JSON.parse(String(tc.steps || '[]'))
      } catch { steps = [] }

      const modName = tc.module || '기타'
      const tcId    = `TC-${String(tc.id).padStart(3, '0')}`

      const msg = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        tools: [{
          name:        'save_playwright_code',
          description: '생성한 Playwright 코드를 저장한다',
          input_schema: {
            type: 'object',
            properties: {
              code: { type: 'string', description: '완성된 Playwright TypeScript 코드 전체' },
            },
            required: ['code'],
          },
        }],
        tool_choice: { type: 'tool', name: 'save_playwright_code' },
        messages: [{
          role: 'user',
          content: `아래 테스트 케이스 1개를 Playwright TypeScript 코드로 작성하고 save_playwright_code 툴을 호출하세요.

${tcId}: ${tc.title ?? ''}
모듈: ${modName}
단계: ${steps.join(' → ')}
기대결과: ${tc.expected ?? ''}

규칙:
- import { test, expect } from '@playwright/test' 포함
- test.describe('${modName}', ...) 로 묶기
- test() 블록 1개 작성
- data-testid 선택자 우선 사용
- 주석으로 TC ID 표시`,
        }],
      })

      const toolBlock = msg.content.find(b => b.type === 'tool_use')
      const code: string = (toolBlock && 'input' in toolBlock
        ? (toolBlock.input as { code?: string }).code
        : undefined) ?? ''

      if (code.trim()) {
        const safeName = `${tcId}_${tc.title?.replace(/[^a-zA-Z0-9가-힣_-]/g, '_').slice(0, 30) ?? modName}`
        await pool.execute<ResultSetHeader>(
          'INSERT INTO test_code (project_id, file_name, content) VALUES (?, ?, ?)',
          [projectId, `tests/${safeName}.spec.ts`, code]
        )
        count++
      }
    }

    return NextResponse.json({ count })
  } catch (err) {
    console.error('[generate-code]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
