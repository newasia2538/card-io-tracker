import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PasswordRecoveryDialog } from './PasswordRecoveryDialog'

describe('PasswordRecoveryDialog', () => {
  it('updates the password after the recovery link returns to the app', async () => {
    const user = userEvent.setup()
    const updateUser = vi.fn().mockResolvedValue({ error: null })
    const onCompleted = vi.fn()

    render(
      <PasswordRecoveryDialog
        authClient={{ updateUser }}
        onCompleted={onCompleted}
      />,
    )

    await user.type(screen.getByLabelText('New password'), 'new-password-123')
    await user.type(screen.getByLabelText('Confirm password'), 'new-password-123')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith({ password: 'new-password-123' })
      expect(onCompleted).toHaveBeenCalledTimes(1)
    })
  })

  it('rejects mismatched passwords without calling Supabase', async () => {
    const user = userEvent.setup()
    const updateUser = vi.fn()

    render(
      <PasswordRecoveryDialog
        authClient={{ updateUser }}
        onCompleted={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText('New password'), 'new-password-123')
    await user.type(screen.getByLabelText('Confirm password'), 'different-password')
    await user.click(screen.getByRole('button', { name: 'Update password' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
    expect(updateUser).not.toHaveBeenCalled()
  })
})
