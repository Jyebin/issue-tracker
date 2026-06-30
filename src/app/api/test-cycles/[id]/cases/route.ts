import { type NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cycleId = parseInt(params.id)
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT tcc.id, tcc.test_case_id, tcc.status AS cycle_status,
              t.title, t.module, t.type, t.priority, t.steps, t.expected
       FROM test_cycle_cases tcc
       JOIN test_cases t ON t.id = tcc.test_case_id
       WHERE tcc.cycle_id = ?
       ORDER BY tcc.id`,
      [cycleId]
    )
    return NextResponse.json({ cases: rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cycleId = parseInt(params.id)
    const { tcIds } = await req.json() as { tcIds: number[] }
    if (!Array.isArray(tcIds) || tcIds.length === 0)
      return NextResponse.json({ error: 'tcIds 필요' }, { status: 400 })

    for (const tcId of tcIds) {
      await pool.execute(
        'INSERT IGNORE INTO test_cycle_cases (cycle_id, test_case_id) VALUES (?, ?)',
        [cycleId, tcId]
      )
    }
    return NextResponse.json({ ok: true, added: tcIds.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
