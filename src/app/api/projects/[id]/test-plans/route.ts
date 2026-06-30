import { type NextRequest, NextResponse } from 'next/server'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import pool from '@/lib/db'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = parseInt(params.id)

    const [planRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, name FROM test_plans WHERE project_id = ? ORDER BY id',
      [projectId]
    )
    const [cycleRows] = await pool.execute<RowDataPacket[]>(
      `SELECT tc.id, tc.plan_id, tc.name, tc.status,
              COUNT(tcc.id)                                             AS tc_count,
              SUM(CASE WHEN tcc.status = 'pass' THEN 1 ELSE 0 END)    AS pass_count,
              SUM(CASE WHEN tcc.status = 'fail' THEN 1 ELSE 0 END)    AS fail_count
       FROM test_cycles tc
       LEFT JOIN test_cycle_cases tcc ON tcc.cycle_id = tc.id
       WHERE tc.project_id = ?
       GROUP BY tc.id, tc.plan_id, tc.name, tc.status
       ORDER BY tc.plan_id, tc.id`,
      [projectId]
    )

    const plans = (planRows as RowDataPacket[]).map(p => ({
      id:   p.id,
      name: p.name,
      cycles: (cycleRows as RowDataPacket[])
        .filter(c => c.plan_id === p.id)
        .map(c => ({
          id:         c.id,
          plan_id:    c.plan_id,
          name:       c.name,
          status:     c.status as string,
          tcCount:    Number(c.tc_count),
          passCount:  Number(c.pass_count),
          failCount:  Number(c.fail_count),
        })),
    }))

    return NextResponse.json({ plans })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const projectId = parseInt(params.id)
    const { name } = await req.json() as { name: string }
    if (!name?.trim()) return NextResponse.json({ error: '이름 필요' }, { status: 400 })

    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO test_plans (project_id, name) VALUES (?, ?)',
      [projectId, name.trim()]
    )
    return NextResponse.json({ plan: { id: result.insertId, name: name.trim(), cycles: [] } })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
