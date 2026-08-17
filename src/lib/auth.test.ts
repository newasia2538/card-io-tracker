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

  it('shares a single anonymous sign-in across concurrent callers for the same client', async () => {
    const anonymousResult = {
      data: {
        session: {
          access_token: 'shared-token',
          user: {
            id: 'user-789',
            is_anonymous: true,
          },
        },
      },
      error: null,
    }
    const signInAnonymously = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(anonymousResult), 0)
        }),
    )
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
        signInAnonymously,
      },
    }

    const [first, second] = await Promise.all([
      ensureAuthSession(client),
      ensureAuthSession(client),
    ])

    expect(first).toEqual({
      accessToken: 'shared-token',
      userId: 'user-789',
      isAnonymous: true,
    })
    expect(second).toEqual(first)
    expect(signInAnonymously).toHaveBeenCalledTimes(1)
  })

  it('clears the in-flight anonymous sign-in after rejection so later callers can retry', async () => {
    const signInAnonymously = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary auth outage'))
      .mockResolvedValueOnce({
        data: {
          session: {
            access_token: 'retry-token',
            user: {
              id: 'user-retry',
              is_anonymous: true,
            },
          },
        },
        error: null,
      })
    const client = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
        signInAnonymously,
      },
    }

    await expect(ensureAuthSession(client)).rejects.toThrow('temporary auth outage')
    await expect(ensureAuthSession(client)).resolves.toEqual({
      accessToken: 'retry-token',
      userId: 'user-retry',
      isAnonymous: true,
    })

    expect(signInAnonymously).toHaveBeenCalledTimes(2)
  })
})
