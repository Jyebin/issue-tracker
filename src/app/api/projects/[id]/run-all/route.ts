import { type NextRequest } from 'next/server'
import type { ResultSetHeader, RowDataPacket } from 'mysql2'
import pool from '@/lib/db'
import { spawn } from 'child_process'
import { writeFile, mkdir, rm, readdir } from 'fs/promises'
import type { Dirent } from 'fs'
import path from 'path'

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function findWebm(dir: string): Promise<string[]> {
  const result: string[] = []
  let entries: Dirent[]
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return result }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isFile() && e.name.endsWith('.webm')) result.push(full)
    else if (e.isDirectory()) result.push(...await findWebm(full))
  }
  return result
}

// TC 파일명에서 TC ID 추출: "TC-003_타이틀.spec.ts" → 3
function extractTcId(filename: string): number | null {
  const m = filename.match(/TC-(\d+)/i)
  return m ? parseInt(m[1]) : null
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const projectId = parseInt(params.id)

  const [codeRows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, file_name, content FROM test_code WHERE project_id = ? ORDER BY file_name',
    [projectId]
  )
  if (!codeRows.length) {
    return new Response(JSON.stringify({ error: '생성된 테스트 코드가 없습니다' }), { status: 404 })
  }

  const root      = process.cwd()
  const ts        = Date.now()
  const tmpDir    = path.join(root, 'temp-tests',        `run-${ts}`)
  const outDir    = path.join(root, 'temp-test-results', `run-${ts}`)
  const pubDir    = path.join(root, 'public', 'videos')

  await mkdir(tmpDir, { recursive: true })
  await mkdir(outDir, { recursive: true })
  await mkdir(pubDir, { recursive: true })

  for (const row of codeRows) {
    const name = path.basename(row.file_name as string)
    await writeFile(path.join(tmpDir, name), row.content as string, 'utf-8')
  }

  const encoder = new TextEncoder()
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      send({ type: 'start', total: codeRows.length })

      const failedTcIds: number[] = []
      let passCount = 0
      let failCount = 0

      const child = spawn(
        'npx',
        [
          'playwright', 'test', tmpDir,
          '--video=on',
          '--reporter=list',
          `--output=${outDir}`,
          '--timeout=30000',
          '--workers=1',
        ],
        { cwd: root, shell: true, env: { ...process.env, FORCE_COLOR: '0' } }
      )

      child.stdout.on('data', (chunk: Buffer) => {
        for (const raw of chunk.toString().split('\n')) {
          const line = raw.trim()
          if (!line) continue
          // playwright list reporter: "  ✓  file > test (Xms)" or "  ×  file > test"
          if (line.startsWith('✓') || line.startsWith('✔') || line.match(/^\d+ passed/)) {
            passCount++
            send({ type: 'pass', message: line })
          } else if (line.startsWith('×') || line.startsWith('✘') || line.startsWith('F') || line.match(/^\d+ failed/)) {
            failCount++
            // try to extract TC id from line
            const tcId = extractTcId(line)
            if (tcId) failedTcIds.push(tcId)
            send({ type: 'fail', message: line })
          } else {
            send({ type: 'log', message: line })
          }
        }
      })

      child.stderr.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) send({ type: 'err', message: line.trim() })
        }
      })

      child.on('close', async (code) => {
        await sleep(1500)
        const passed = code === 0

        // 영상 공개 폴더로 이동
        const videos = await findWebm(outDir)
        const videoUrls: string[] = []
        for (const src of videos) {
          const name = `proj${projectId}-${path.basename(path.dirname(src))}-${path.basename(src)}`
          try {
            const { copyFile } = await import('fs/promises')
            await copyFile(src, path.join(pubDir, name))
            videoUrls.push(`/videos/${name}`)
          } catch { /* skip */ }
        }

        // 실패 TC 이슈 자동 생성
        let issueCount = 0
        for (const tcId of failedTcIds) {
          try {
            const [[tc]] = await pool.execute<RowDataPacket[]>(
              'SELECT title, module, priority FROM test_cases WHERE id = ?', [tcId]
            )
            if (tc) {
              await pool.execute<ResultSetHeader>(
                'INSERT INTO issues (project_id, tc_id, title, priority, module, description, status) VALUES (?,?,?,?,?,?,?)',
                [projectId, tcId, `[Auto-Fail] ${tc.title}`, tc.priority ?? 'medium', tc.module ?? null, `자동 실행 중 실패한 TC`, 'open']
              )
              // TC 상태도 failed로 업데이트
              await pool.execute('UPDATE test_cases SET status = ? WHERE id = ?', ['failed', tcId])
              issueCount++
            }
          } catch { /* skip */ }
        }

        send({ type: 'done', passed, passCount, failCount, issueCount, videoUrls })

        try { await rm(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
        try { await rm(outDir, { recursive: true, force: true }) } catch { /* ignore */ }
        controller.close()
      })

      child.on('error', (err) => {
        send({ type: 'err', message: err.message })
        send({ type: 'done', passed: false, passCount: 0, failCount: 0, issueCount: 0, videoUrls: [] })
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  })
}
