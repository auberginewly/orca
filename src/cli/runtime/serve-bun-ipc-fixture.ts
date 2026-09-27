import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { spawnProcess } from '../../shared/child-process/run-process'
import { superviseForegroundServe, readServeUpdateHandoff } from './serve-update-supervisor'

async function verify(): Promise<void> {
  const [executable, root] = process.argv.slice(2)
  assert(executable && root && process.versions.bun)
  for (const reportedVersion of ['2.0.0', 'wrong-version']) {
    const handoffPath = join(root, 'handoff.json')
    const child = spawnProcess({
      program: executable,
      args: [
        '-e',
        `
        process.on('SIGTERM', () => process.exit(0));
        process.once('message', () => {
          process.send({type:'orca:serve-ready',version:${JSON.stringify(reportedVersion)},runtimeId:'ipc-runtime'});
          setTimeout(() => process.exit(0), 250);
        });
      `
      ],
      env: { ORCA_BACKGROUND_LAUNCH: '1', ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    })
    child.stdout.resume()
    child.stderr.resume()
    assert(child.pid)
    const handoff = {
      schemaVersion: 1 as const,
      phase: 'install-requested' as const,
      fromVersion: '1.0.0',
      targetVersion: '2.0.0',
      servingPid: child.pid
    }
    await writeFile(handoffPath, JSON.stringify(handoff))
    try {
      const supervised = superviseForegroundServe({
        executable,
        childArgs: [],
        spawnOptions: {},
        spawnChild: () => {
          throw new Error('Readiness verification must not spawn another child')
        },
        child,
        handoffPath,
        expectedHandoff: handoff
      })
      child.send('report-readiness')
      const code = await supervised
      assert.equal(code, reportedVersion === '2.0.0' ? 0 : 1)
      if (code === 0) {
        assert.equal(await readServeUpdateHandoff(handoffPath), null)
      } else {
        const failure = JSON.parse(await readFile(handoffPath, 'utf8'))
        assert.equal(failure.phase, 'failed')
        assert.match(failure.reason, /wrong-version/)
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }
    }
  }
  console.log('Bun supervisor verified real child IPC and durable readiness outcomes')
}

void verify().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
