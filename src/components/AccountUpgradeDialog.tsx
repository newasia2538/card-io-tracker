import { useState } from 'react'

import { getTranslations } from '../lib/i18n'
import type { AuthSession, Language } from '../types'

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
  language?: Language
  onClose?: () => void
  onUpgraded: (session: AuthSession) => void
}

export function AccountUpgradeDialog({
  authClient,
  language = 'en',
  onClose,
  onUpgraded,
}: AccountUpgradeDialogProps) {
  const [phase, setPhase] = useState<'email' | 'pending' | 'password'>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [messageKey, setMessageKey] = useState<UpgradeMessageKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const translations = getTranslations(language)

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
      setMessageKey('verificationSent')
    } catch (nextError) {
      setError(toUpgradeErrorMessage(nextError, translations))
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
        setMessageKey('verificationPending')
        return
      }

      setPhase('password')
      setMessageKey('emailVerified')
    } catch (nextError) {
      setError(toUpgradeErrorMessage(nextError, translations))
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
      setError(toUpgradeErrorMessage(nextError, translations))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="panel upgrade-panel" aria-label={translations.upgradeAccount}>
      <div className="panel-header">
        <h2>{translations.upgradeAccount}</h2>
      </div>

      {phase === 'email' ? (
        <form className="upgrade-form" onSubmit={handleEmailSubmit}>
          <label className="field">
            <span>{translations.email}</span>
            <input
              aria-label={translations.email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              {translations.sendVerificationEmail}
            </button>
            {onClose ? (
              <button disabled={isSubmitting} onClick={onClose} type="button">
                {translations.close}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {phase === 'pending' ? (
        <div className="upgrade-form">
          <button disabled={isSubmitting} onClick={() => void handleVerificationRefresh()} type="button">
            {translations.verifiedEmail}
          </button>
          {onClose ? (
            <button disabled={isSubmitting} onClick={onClose} type="button">
              {translations.close}
            </button>
          ) : null}
        </div>
      ) : null}

      {phase === 'password' ? (
        <form className="upgrade-form" onSubmit={handlePasswordSubmit}>
          <label className="field">
            <span>{translations.password}</span>
            <input
              aria-label={translations.password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          </label>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              {translations.setPassword}
            </button>
            {onClose ? (
              <button disabled={isSubmitting} onClick={onClose} type="button">
                {translations.close}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      {messageKey ? <p role="status">{translations[messageKey]}</p> : null}
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

type UpgradeMessageKey = 'verificationSent' | 'verificationPending' | 'emailVerified'

function toUpgradeErrorMessage(
  error: unknown,
  translations: ReturnType<typeof getTranslations>,
): string {
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes('already')) {
      return translations.emailAlreadyRegistered
    }

    return error.message
  }

  return translations.upgradeError
}
