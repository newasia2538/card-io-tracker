import { useState, type FormEvent } from 'react'

import {
  getAuthRedirectUrl,
  toAuthSession,
  type AccountAuthClient,
} from '../lib/auth'
import { getTranslations } from '../lib/i18n'
import type { AuthSession, Language } from '../types'

export interface AccountSignInDialogProps {
  authClient: AccountAuthClient
  hasAnonymousTransactions: boolean
  language?: Language
  onClose?: () => void
  onSignedIn: (session: AuthSession) => void
}

export function AccountSignInDialog({
  authClient,
  hasAnonymousTransactions,
  language = 'en',
  onClose,
  onSignedIn,
}: AccountSignInDialogProps) {
  const [phase, setPhase] = useState<'warning' | 'form' | 'reset' | 'magic-link'>(
    hasAnonymousTransactions ? 'warning' : 'form',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const translations = getTranslations(language)

  function switchPhase(nextPhase: typeof phase) {
    setPhase(nextPhase)
    setError(null)
    setMessage(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      const result = await authClient.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (result.error) {
        throw result.error
      }

      const session = toAuthSession(result.data.session)
      if (!session || session.isAnonymous) {
        throw new Error(translations.signInError)
      }

      onSignedIn(session)
    } catch (nextError) {
      setError(toSignInErrorMessage(nextError, translations.signInError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      if (!authClient.resetPasswordForEmail) {
        throw new Error(translations.passwordResetError)
      }

      const result = await authClient.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl('recovery'),
      })
      if (result.error) {
        throw result.error
      }

      setMessage(translations.passwordResetSent)
    } catch (nextError) {
      setError(toSignInErrorMessage(nextError, translations.passwordResetError))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      if (!authClient.signInWithOtp) {
        throw new Error(translations.signInLinkError)
      }

      const result = await authClient.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: getAuthRedirectUrl('magic-link'),
          shouldCreateUser: false,
        },
      })
      if (result.error) {
        throw result.error
      }

      setMessage(translations.signInLinkSent)
    } catch (nextError) {
      setError(toSignInErrorMessage(nextError, translations.signInLinkError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="panel sign-in-panel" aria-label={translations.signInTitle}>
      <div className="panel-header">
        <h2>{translations.signInTitle}</h2>
      </div>

      {phase === 'warning' ? (
        <div className="upgrade-form sign-in-warning">
          <p>{translations.signInWarning}</p>
          <div className="form-actions">
            <button onClick={() => switchPhase('form')} type="button">
              {translations.continueToSignIn}
            </button>
            {onClose ? (
              <button onClick={onClose} type="button">
                {translations.close}
              </button>
            ) : null}
          </div>
        </div>
      ) : phase === 'form' ? (
        <form className="upgrade-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>{translations.email}</span>
            <input
              aria-label={translations.email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>{translations.password}</span>
            <input
              aria-label={translations.password}
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              {translations.signInButton}
            </button>
            {onClose ? (
              <button disabled={isSubmitting} onClick={onClose} type="button">
                {translations.close}
              </button>
            ) : null}
          </div>
          <div className="auth-flow-links">
            <button
              className="auth-flow-link"
              disabled={isSubmitting}
              onClick={() => switchPhase('reset')}
              type="button"
            >
              {translations.forgotPassword}
            </button>
            <button
              className="auth-flow-link"
              disabled={isSubmitting}
              onClick={() => switchPhase('magic-link')}
              type="button"
            >
              {translations.emailSignInLink}
            </button>
          </div>
        </form>
      ) : phase === 'reset' ? (
        <form className="upgrade-form" onSubmit={handlePasswordReset}>
          <label className="field">
            <span>{translations.email}</span>
            <input
              aria-label={translations.email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              {translations.sendPasswordReset}
            </button>
            <button disabled={isSubmitting} onClick={() => switchPhase('form')} type="button">
              {translations.backToSignIn}
            </button>
          </div>
        </form>
      ) : (
        <form className="upgrade-form" onSubmit={handleMagicLink}>
          <label className="field">
            <span>{translations.email}</span>
            <input
              aria-label={translations.email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <div className="form-actions">
            <button disabled={isSubmitting} type="submit">
              {translations.sendSignInLink}
            </button>
            <button disabled={isSubmitting} onClick={() => switchPhase('form')} type="button">
              {translations.backToSignIn}
            </button>
          </div>
        </form>
      )}

      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}

function toSignInErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}
