import { type NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = parseInt(params.id)
  if (!projectId) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  try {
    // 외래키 CASCADE가 없는 테이블 먼저 삭제
    await pool.execute('DELETE FROM test_code WHERE project_id = ?', [projectId])
    await pool.execute('DELETE FROM test_cases WHERE project_id = ?', [projectId])
    await pool.execute('DELETE FROM issues WHERE project_id = ?', [projectId])
    // projects 삭제 시 specs, missing_items, missing_item_answers, final_specs CASCADE 삭제
    await pool.execute('DELETE FROM projects WHERE id = ?', [projectId])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[reset]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
