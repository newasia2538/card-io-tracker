import { useState, type FormEvent } from 'react'

import {
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
  const [phase, setPhase] = useState<'warning' | 'form'>(
    hasAnonymousTransactions ? 'warning' : 'form',
  )
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const translations = getTranslations(language)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

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
      setError(toSignInErrorMessage(nextError, translations))
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
            <button onClick={() => setPhase('form')} type="button">
              {translations.continueToSignIn}
            </button>
            {onClose ? (
              <button onClick={onClose} type="button">
                {translations.close}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
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
        </form>
      )}

      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}

function toSignInErrorMessage(
  error: unknown,
  translations: ReturnType<typeof getTranslations>,
): string {
  if (error instanceof Error) {
    return error.message
  }

  return translations.signInError
}
