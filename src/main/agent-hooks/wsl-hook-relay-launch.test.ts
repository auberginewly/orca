import { describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn((..._args: unknown[]) => ({ pid: 1 }))
}))

vi.mock('../../shared/child-process/run-process', () => ({ spawnProcess: spawnMock }))

import { spawnWslRelayProcess } from './wsl-hook-relay-launch'

describe('spawnWslRelayProcess', () => {
  it('names an explicit Windows directory rather than inheriting one', () => {
    spawnWslRelayProcess('Ubuntu', {}, '1.2.3', '/home/ada/bun')

    // Why (#16463): the guest path is inside the `sh -c` command, so the Windows
    // cwd only decides whether CreateProcessW succeeds. Omitting it inherits
    // Orca's own — a `\\wsl.localhost` worktree the user can delete, after which
    // every relay launch fails `spawn wsl.exe ENOENT` for the rest of the session.
    expect(spawnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        program: 'wsl.exe',
        args: expect.arrayContaining(['-d', 'Ubuntu', '--exec', '/home/ada/bun']),
        cwd: expect.any(String)
      })
    )
  })
})
