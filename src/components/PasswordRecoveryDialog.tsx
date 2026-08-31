import { useState, type FormEvent } from 'react'

import type { AccountAuthClient } from '../lib/auth'
import { getTranslations } from '../lib/i18n'
import type { Language } from '../types'

export interface PasswordRecoveryDialogProps {
  authClient: Pick<AccountAuthClient, 'updateUser'>
  language?: Language
  onCompleted: () => void
}

export function PasswordRecoveryDialog({
  authClient,
  language = 'en',
  onCompleted,
}: PasswordRecoveryDialogProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const translations = getTranslations(language)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (newPassword !== confirmation) {
      setError(translations.passwordsDoNotMatch)
      return
    }

    setIsSubmitting(true)

    try {
      const result = await authClient.updateUser({ password: newPassword })
      if (result.error) {
        throw result.error
      }

      onCompleted()
    } catch (nextError) {
      setError(toRecoveryErrorMessage(nextError, translations.passwordUpdateError))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="panel password-recovery-panel" aria-label={translations.passwordRecoveryTitle}>
      <div className="panel-header">
        <h2>{translations.passwordRecoveryTitle}</h2>
      </div>

      <form className="upgrade-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>{translations.newPassword}</span>
          <input
            aria-label={translations.newPassword}
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            type="password"
            value={newPassword}
          />
        </label>

        <label className="field">
          <span>{translations.confirmPassword}</span>
          <input
            aria-label={translations.confirmPassword}
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type="password"
            value={confirmation}
          />
        </label>

        <div className="form-actions">
          <button disabled={isSubmitting} type="submit">
            {translations.updatePassword}
          </button>
        </div>
      </form>

      {error ? <p role="alert">{error}</p> : null}
    </section>
  )
}

function toRecoveryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }

  return fallback
}
