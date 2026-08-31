import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { AccountSettingsDialog } from './AccountSettingsDialog'
import type { AuthSession } from '../types'

describe('AccountSettingsDialog', () => {
  const session: AuthSession = {
    accessToken: 'registered-token',
    userId: 'user-123',
    email: 'collector@example.com',
    isAnonymous: false,
  }

  it('signs out from the account settings modal', async () => {
    const user = userEvent.setup()
    const onSignOut = vi.fn()

    render(
      <AccountSettingsDialog
        onClose={vi.fn()}
        onSignOut={onSignOut}
        session={session}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('closes when the user presses Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <AccountSettingsDialog
        onClose={onClose}
        onSignOut={vi.fn()}
        session={session}
      />,
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
