import { type NextRequest, NextResponse } from 'next/server'
import type { ResultSetHeader } from 'mysql2'
import pool from '@/lib/db'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const planId = parseInt(params.id)
    const { name, projectId } = await req.json() as { name: string; projectId: number }
    if (!name?.trim()) return NextResponse.json({ error: '이름 필요' }, { status: 400 })

    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO test_cycles (plan_id, project_id, name) VALUES (?, ?, ?)',
      [planId, projectId, name.trim()]
    )
    return NextResponse.json({
      cycle: {
        id: result.insertId, plan_id: planId, name: name.trim(),
        status: 'not_started', tcCount: 0, passCount: 0, failCount: 0,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
