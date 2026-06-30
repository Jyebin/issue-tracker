import { type NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    const { status } = await req.json() as { status: string }

    await pool.execute(
      'UPDATE test_cycle_cases SET status = ?, executed_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id]
    )

    // 사이클 전체 상태 재계산
    const [[caseRow]] = await pool.execute<RowDataPacket[]>(
      'SELECT cycle_id FROM test_cycle_cases WHERE id = ?',
      [id]
    )
    if (caseRow) {
      const [allCases] = await pool.execute<RowDataPacket[]>(
        'SELECT status FROM test_cycle_cases WHERE cycle_id = ?',
        [caseRow.cycle_id]
      )
      const statuses = (allCases as RowDataPacket[]).map(r => r.status as string)
      let cycleStatus = 'not_started'
      if (statuses.some(s => s !== 'pending')) cycleStatus = 'in_progress'
      if (statuses.every(s => s === 'pass' || s === 'fail' || s === 'na')) cycleStatus = 'done'
      await pool.execute(
        'UPDATE test_cycles SET status = ? WHERE id = ?',
        [cycleStatus, caseRow.cycle_id]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
