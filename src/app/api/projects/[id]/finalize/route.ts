import { type NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import pool from '@/lib/db'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = parseInt(params.id)

  // 원본 기획서
  const [specRows] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM specs WHERE project_id = ? ORDER BY id DESC LIMIT 1',
    [projectId]
  )
  const spec = specRows[0]
  if (!spec) return NextResponse.json({ error: '기획서 없음' }, { status: 404 })

  // 보완된 Q&A
  const [qaRows] = await pool.execute<RowDataPacket[]>(
    `SELECT mi.question, mi.priority, mia.answer
     FROM missing_items mi
     JOIN missing_item_answers mia ON mi.id = mia.missing_item_id
     WHERE mi.project_id = ?
     ORDER BY mi.order_index`,
    [projectId]
  )

  const apiKey = process.env.ANTHROPIC_API_KEY
  let finalContent = ''

  if (apiKey) {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client    = new Anthropic({ apiKey })

    const qaPart = (qaRows as { question: string; answer: string }[])
      .map((r, i) => `Q${i + 1}. ${r.question}\nA: ${r.answer}`)
      .join('\n\n')

    const msg = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role:    'user',
        content: `아래의 원본 기획서와 보완 Q&A를 합쳐서 완성된 기획서를 작성해주세요. 마크다운 형식으로 작성해주세요.

원본 기획서:
---
${(spec.original_text as string).slice(0, 8000)}
---

보완 Q&A:
${qaPart}
`,
      }],
    })
    finalContent = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } else {
    // mock
    finalContent = `# 최종 기획서\n\n원본 기획서에 ${qaRows.length}건의 보완 항목이 추가되었습니다.`
  }

  const [res] = await pool.execute<ResultSetHeader>(
    'INSERT INTO final_specs (project_id, content) VALUES (?,?)',
    [projectId, finalContent]
  )
  await pool.execute('UPDATE projects SET status=? WHERE id=?', ['done', projectId])

  return NextResponse.json({ ok: true, finalSpecId: res.insertId, content: finalContent })
}
