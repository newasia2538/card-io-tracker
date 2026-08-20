import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AccountSignInDialog } from './AccountSignInDialog'

describe('AccountSignInDialog', () => {
  it('signs in with email and password and returns the registered session', async () => {
    const user = userEvent.setup()
    const signInWithPassword = vi.fn().mockResolvedValue({
      data: {
        session: {
          access_token: 'registered-token',
          user: {
            id: 'user-123',
            email: 'collector@example.com',
            is_anonymous: false,
          },
        },
      },
      error: null,
    })
    const onSignedIn = vi.fn()

    render(
      <AccountSignInDialog
        authClient={createAuthClient({ signInWithPassword })}
        hasAnonymousTransactions={false}
        onSignedIn={onSignedIn}
      />,
    )

    await user.type(screen.getByLabelText('Email'), ' collector@example.com ')
    await user.type(screen.getByLabelText('Password'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: 'SIGN IN' }))

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'collector@example.com',
        password: 'new-password-123',
      })
      expect(onSignedIn).toHaveBeenCalledWith({
        accessToken: 'registered-token',
        userId: 'user-123',
        email: 'collector@example.com',
        isAnonymous: false,
      })
    })
  })

  it('warns before replacing an anonymous session with existing rows', async () => {
    const user = userEvent.setup()
    const signInWithPassword = vi.fn()

    render(
      <AccountSignInDialog
        authClient={createAuthClient({ signInWithPassword })}
        hasAnonymousTransactions
        onSignedIn={vi.fn()}
      />,
    )

    expect(
      screen.getByText(
        'Your current anonymous records stay in that anonymous account after sign-in.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Email')).not.toBeInTheDocument()
    expect(signInWithPassword).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Continue to sign in' }))

    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('shows authentication errors without reporting a signed-in session', async () => {
    const user = userEvent.setup()
    const onSignedIn = vi.fn()

    render(
      <AccountSignInDialog
        authClient={createAuthClient({
          signInWithPassword: vi.fn().mockResolvedValue({
            data: { session: null },
            error: new Error('Invalid login credentials'),
          }),
        })}
        hasAnonymousTransactions={false}
        onSignedIn={onSignedIn}
      />,
    )

    await user.type(screen.getByLabelText('Email'), 'collector@example.com')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'SIGN IN' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('closes without calling Supabase', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const signInWithPassword = vi.fn()

    render(
      <AccountSignInDialog
        authClient={createAuthClient({ signInWithPassword })}
        hasAnonymousTransactions={false}
        onClose={onClose}
        onSignedIn={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(signInWithPassword).not.toHaveBeenCalled()
  })
})

function createAuthClient(overrides: Record<string, unknown> = {}) {
  return {
    getSession: vi.fn(),
    updateUser: vi.fn(),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  }
}
