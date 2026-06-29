import { type NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const [[row]] = await pool.execute<RowDataPacket[]>(
      'SELECT id, project_id, title, module, type, priority, status, steps, expected FROM test_cases WHERE id = ?',
      [parseInt(params.id)]
    )
    if (!row) return NextResponse.json({ error: 'TC를 찾을 수 없습니다' }, { status: 404 })
    return NextResponse.json({ tc: row })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json() as { status?: string; expected?: string[] }
    if (body.status !== undefined) {
      await pool.execute(
        'UPDATE test_cases SET status = ? WHERE id = ?',
        [body.status, parseInt(params.id)]
      )
    }
    if (body.expected !== undefined) {
      await pool.execute(
        'UPDATE test_cases SET expected = ? WHERE id = ?',
        [JSON.stringify(body.expected), parseInt(params.id)]
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
