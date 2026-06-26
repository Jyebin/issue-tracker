import { type NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const itemId = parseInt(params.id)
  const { answer } = (await req.json()) as { answer: string }

  await pool.execute(
    `INSERT INTO missing_item_answers (missing_item_id, answer)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE answer = ?, answered_at = CURRENT_TIMESTAMP`,
    [itemId, answer, answer]
  )
  return NextResponse.json({ ok: true })
}
