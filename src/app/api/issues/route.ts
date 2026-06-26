import { type NextRequest, NextResponse } from 'next/server'
import type { ResultSetHeader } from 'mysql2'
import pool from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      project_id: number
      tc_id?: number
      title: string
      priority?: string
      module?: string
      description?: string
    }
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO issues (project_id, tc_id, title, priority, module, description, status) VALUES (?,?,?,?,?,?,?)',
      [body.project_id, body.tc_id ?? null, body.title, body.priority ?? 'medium', body.module ?? null, body.description ?? null, 'open']
    )
    return NextResponse.json({ id: result.insertId })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
