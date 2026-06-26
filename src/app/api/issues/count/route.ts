import { NextResponse } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'

export async function GET() {
  try {
    const [[row]] = await pool.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM issues WHERE status != 'done'"
    )
    return NextResponse.json({ count: (row as RowDataPacket).cnt ?? 0 })
  } catch (err) {
    return NextResponse.json({ count: 0 })
  }
}
