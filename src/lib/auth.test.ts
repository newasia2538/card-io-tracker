import { describe, expect, it, vi } from 'vitest'

import { ensureAuthSession } from './auth'

describe('ensureAuthSession', () => {
  it('reuses an existing Supabase session', async () => {
    const getSession = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'existing-token',
          user: {
            id: 'user-123',
            is_anonymous: true,
          },
        },
      },
      error: null,
    })
    const signInAnonymously = vi.fn()

    await expect(
      ensureAuthSession({
        auth: {
          getSession,
          signInAnonymously,
        },
      }),
    ).resolves.toEqual({
      accessToken: 'existing-token',
      userId: 'user-123',
      isAnonymous: true,
    })

    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  it('signs in anonymously only when no session exists', async () => {
    const signInAnonymously = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'new-token',
          user: {
            id: 'user-456',
            is_anonymous: true,
          },
        },
      },
      error: null,
    })

    await expect(
      ensureAuthSession({
        auth: {
          getSession: vi.fn().mockResolvedValue({
            data: { session: null },
            error: null,
          }),
          signInAnonymously,
        },
      }),
    ).resolves.toEqual({
      accessToken: 'new-token',
      userId: 'user-456',
      isAnonymous: true,
    })

    expect(signInAnonymously).toHaveBeenCalledTimes(1)
  })
})
