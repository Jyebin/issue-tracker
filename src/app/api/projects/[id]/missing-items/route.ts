import { type NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = parseInt(params.id)
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT mi.id, mi.question, mi.description, mi.priority, mi.order_index,
            mia.answer, mia.answered_at
     FROM missing_items mi
     LEFT JOIN missing_item_answers mia ON mi.id = mia.missing_item_id
     WHERE mi.project_id = ?
     ORDER BY mi.order_index`,
    [projectId]
  )
  return NextResponse.json({ items: rows })
}
