import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function GET() {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(`
      SELECT
        p.id,
        p.title,
        p.status,
        p.created_at,
        s.file_name,
        s.file_type,
        COUNT(DISTINCT mi.id)  AS missing_count,
        COUNT(DISTINCT tc.id)  AS tc_count
      FROM projects p
      LEFT JOIN specs       s  ON s.project_id  = p.id
      LEFT JOIN missing_items mi ON mi.project_id = p.id
      LEFT JOIN test_cases  tc ON tc.project_id  = p.id
      GROUP BY p.id, s.file_name, s.file_type
      ORDER BY p.created_at DESC
      LIMIT 30
    `)
    return NextResponse.json({ projects: rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
