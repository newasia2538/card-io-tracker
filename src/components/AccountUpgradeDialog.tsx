import { useState } from 'react'

import type { AuthSession } from '../types'

type SessionLike = {
  access_token?: string
  user?: {
    id?: string
    is_anonymous?: boolean
  } | null
}

export interface AccountUpgradeAuthClient {
  getSession: () => Promise<{
    data: {
      session: SessionLike | null
    }
    error: Error | null
  }>
  updateUser: (attributes: { email?: string; password?: string }) => Promise<{
    error: Error | null
  }>
}

export interface AccountUpgradeDialogProps {
  authClient: AccountUpgradeAuthClient
  onClose?: () => void
  onUpgraded: (session: AuthSession) => void
}

export function AccountUpgradeDialog({
  authClient,
  onClose,
  onUpgraded,
}: AccountUpgradeDialogProps) {
  const [phase, setPhase] = useState<'email' | 'pending' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await authClient.updateUser({ email: email.trim() })
      if (result.error) {
        throw result.error
      }

      setPhase('pending')
      setMessage('Verification email sent. Verify it, then continue to set your password.')
    } catch (nextError) {
      setError(toUpgradeErrorMessage(nextError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleVerificationRefresh() {
    setIsSubmitting(true)
    setError(null)

    try {
      const sessionResult = await authClient.getSession()
      if (sessionResult.error) {
        throw sessionResult.error
      }

      const session = toAuthSession(sessionResult.data.session)
      if (!session || session.isAnonymous) {
        setMessage('Verification is still pending. Finish the email step and try again.')
        return
      }

      setPhase('password')
      setMessage('Email verified. Set a password to finish upgrading your account.')
    } catch (nextError) {
      setError(toUpgradeErrorMessage(nextError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const updateResult = await authClient.updateUser({ password })
      if (updateResult.error) {
        throw updateResult.error
      }

      const sessionResult = await authClient.getSession()
      if (sessionResult.error) {
        throw sessionResult.error
      }

      const session = toAuthSession(sessionResult.data.session)
      if (!session) {
        throw new Error('The upgraded session is not available yet.')
      }

      onUpgraded(session)
    } catch (nextError) {
      setError(toUpgradeErrorMessage(nextError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="panel upgrade-panel" aria-label="Upgrade account">
      <div className="panel-header">
        <h2>Upgrade account</h2>
        <p>Keep the same rows and user identity while adding email/password access.</p>
      </div>

      {phase === 'email' ? (
        <form className="upgrade-form" onSubmit={handleEmailSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              aria-label="Email"
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              Send verification email
            </button>
            {onClose ? (
              <button disabled={isSubmitting} onClick={onClose} type="button">
                Close
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {phase === 'pending' ? (
        <div className="upgrade-form">
          <button disabled={isSubmitting} onClick={() => void handleVerificationRefresh()} type="button">
            I've verified my email
          </button>
          {onClose ? (
            <button disabled={isSubmitting} onClick={onClose} type="button">
              Close
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === 'password' ? (
        <form className="upgrade-form" onSubmit={handlePasswordSubmit}>
          <label className="field">
            <span>Password</span>
            <input
              aria-label="Password"
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              Set password
            </button>
            {onClose ? (
              <button disabled={isSubmitting} onClick={onClose} type="button">
                Close
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}

function toAuthSession(session: SessionLike | null): AuthSession | null {
  if (!session?.access_token || !session.user?.id) {
    return null
  }

  return {
    accessToken: session.access_token,
    userId: session.user.id,
    isAnonymous: session.user.is_anonymous ?? false,
  }
}

function toUpgradeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('already')) {
      return 'This email is already registered. Try another email address.'
    }

    return error.message
  }

  return 'Something went wrong while upgrading the account.'
}
