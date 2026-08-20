import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AccountUpgradeDialog } from './AccountUpgradeDialog'
import type { AuthSession } from '../types'

describe('AccountUpgradeDialog', () => {
  const upgradedSession: AuthSession = {
    accessToken: 'verified-token',
    userId: 'user-123',
    email: 'collector@example.com',
    isAnonymous: false,
  }

  it('sends verification first, then allows password setup after refresh', async () => {
    const user = userEvent.setup()
    const updateUser = vi
      .fn()
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: null })
    const onUpgraded = vi.fn()

    render(
      <AccountUpgradeDialog
        authClient={{
          getSession: vi.fn().mockResolvedValue({
            data: {
              session: {
                access_token: upgradedSession.accessToken,
                user: {
                  id: upgradedSession.userId,
                  email: upgradedSession.email,
                  is_anonymous: false,
                },
              },
            },
            error: null,
          }),
          updateUser,
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        }}
        onUpgraded={onUpgraded}
      />,
    )

    expect(screen.getByRole('region', { name: 'Upgrade account' })).toBeInTheDocument()
    expect(screen.queryByText('Keep the same rows and user identity while adding email/password access.')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'collector@example.com')
    await user.click(screen.getByRole('button', { name: 'Send verification email' }))

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ email: 'collector@example.com' })
    })

    expect(
      screen.getByText('Verification email sent. Verify it, then continue to set your password.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "I've verified my email" }))
    await user.type(screen.getByLabelText('Password'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: 'Set password' }))

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ password: 'new-password-123' })
    })

    expect(onUpgraded).toHaveBeenCalledWith(upgradedSession)
  })

  it('shows an existing-email conflict without changing the session', async () => {
    const user = userEvent.setup()

    render(
      <AccountUpgradeDialog
        authClient={{
          getSession: vi.fn(),
          updateUser: vi.fn().mockResolvedValue({
            error: new Error('This email is already registered.'),
          }),
          signInWithPassword: vi.fn(),
          signOut: vi.fn(),
        }}
        onUpgraded={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('Email'), 'collector@example.com')
    await user.click(screen.getByRole('button', { name: 'Send verification email' }))

    expect(
      screen.getByText('This email is already registered. Try another email address.'),
    ).toBeInTheDocument()
  })
})
