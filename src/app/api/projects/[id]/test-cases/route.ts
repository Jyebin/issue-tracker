import { type NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = parseInt(params.id)
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, title, module, type, priority, status, steps, expected FROM test_cases WHERE project_id = ? ORDER BY id',
      [projectId]
    )
    return NextResponse.json({ testCases: rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
