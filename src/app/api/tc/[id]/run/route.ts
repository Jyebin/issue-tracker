import { type NextRequest } from 'next/server'
import type { RowDataPacket } from 'mysql2'
import pool from '@/lib/db'
import { spawn } from 'child_process'
import { writeFile, unlink, mkdir, copyFile, readdir, rm } from 'fs/promises'
import { Dirent } from 'fs'
import path from 'path'

async function findWebm(dir: string): Promise<string | null> {
  let entries: Dirent[]
  try { entries = await readdir(dir, { withFileTypes: true }) } catch { return null }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isFile() && e.name.endsWith('.webm')) return full
    if (e.isDirectory()) { const f = await findWebm(full); if (f) return f }
  }
  return null
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const tcId = parseInt(params.id)
  const { projectId } = await req.json() as { projectId: number }

  const [[tc]] = await pool.execute<RowDataPacket[]>(
    'SELECT id, title FROM test_cases WHERE id = ?', [tcId]
  )
  if (!tc) return new Response(JSON.stringify({ error: 'TC 없음' }), { status: 404 })

  const tcTag = `TC-${String(tcId).padStart(3, '0')}`
  const [codeRows] = await pool.execute<RowDataPacket[]>(
    'SELECT file_name, content FROM test_code WHERE project_id = ? AND file_name LIKE ?',
    [projectId, `%${tcTag}%`]
  )
  const codeFile = (codeRows as RowDataPacket[])[0]
  if (!codeFile) return new Response(JSON.stringify({ error: '매칭된 코드 파일이 없습니다' }), { status: 404 })

  const root      = process.cwd()
  const timestamp = Date.now()
  const tmpDir    = path.join(root, 'temp-tests')
  const outDir    = path.join(root, 'temp-test-results', `${tcTag}-${timestamp}`)
  const pubDir    = path.join(root, 'public', 'videos')
  const tmpFile   = path.join(tmpDir, `${tcTag}.spec.ts`)

  await mkdir(tmpDir,  { recursive: true })
  await mkdir(outDir,  { recursive: true })
  await mkdir(pubDir,  { recursive: true })
  await writeFile(tmpFile, codeFile.content as string, 'utf-8')

  const encoder = new TextEncoder()
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      send({ type: 'start', message: `${tcTag} 테스트 녹화 시작` })
      send({ type: 'info',  message: `파일: ${codeFile.file_name}` })

      const child = spawn(
        'npx',
        [
          'playwright', 'test', tmpFile,
          '--video=on',
          '--reporter=list',
          `--output=${outDir}`,
          '--timeout=30000',
          '--workers=1',
        ],
        { cwd: root, shell: true, env: { ...process.env, FORCE_COLOR: '0' } }
      )

      child.stdout.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) send({ type: 'log', message: line })
        }
      })
      child.stderr.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          if (line.trim()) send({ type: 'err', message: line })
        }
      })

      child.on('close', async (code) => {
        const passed = code === 0
        // 영상 파일이 기록될 시간 대기
        await sleep(1500)

        const webmSrc = await findWebm(outDir)
        let videoUrl: string | null = null
        if (webmSrc) {
          const videoName = `${tcTag}-${timestamp}.webm`
          const dest      = path.join(pubDir, videoName)
          try {
            await copyFile(webmSrc, dest)
            videoUrl = `/videos/${videoName}`
            send({ type: 'video', url: videoUrl })
          } catch (e) {
            send({ type: 'err', message: `영상 저장 실패: ${e}` })
          }
        } else {
          send({ type: 'err', message: '녹화된 영상 파일을 찾지 못했습니다' })
        }

        send({ type: 'done', passed })

        // 임시 파일 정리
        try { await unlink(tmpFile) }   catch { /* ignore */ }
        try { await rm(outDir, { recursive: true, force: true }) } catch { /* ignore */ }
        controller.close()
      })

      child.on('error', async (err) => {
        send({ type: 'err',  message: `실행 오류: ${err.message}` })
        send({ type: 'done', passed: false })
        try { await unlink(tmpFile) } catch { /* ignore */ }
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
