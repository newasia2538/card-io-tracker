import { useEffect, useRef } from 'react'

import { getTranslations } from '../lib/i18n'
import type { AuthSession, Language } from '../types'

export interface AccountSettingsDialogProps {
  isSigningOut?: boolean
  language?: Language
  onClose: () => void
  onSignOut: () => void
  session: AuthSession
}

export function AccountSettingsDialog({
  isSigningOut = false,
  language = 'en',
  onClose,
  onSignOut,
  session,
}: AccountSettingsDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const translations = getTranslations(language)

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null
    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousBodyOverflow
      previousActiveElement?.focus()
    }
  }, [onClose])

  function handleBackdropMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }

  return (
    <div
      className="account-settings-backdrop"
      onMouseDown={handleBackdropMouseDown}
    >
      <section
        aria-labelledby="account-settings-title"
        aria-modal="true"
        className="account-settings-modal"
        role="dialog"
      >
        <div className="account-settings-modal__header">
          <div>
            <p className="eyebrow">{translations.accountSettings}</p>
            <h2 id="account-settings-title">{translations.accountSettings}</h2>
          </div>
          <button
            aria-label={translations.closeAccountSettings}
            className="account-settings-modal__close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="account-settings-profile">
          <div aria-hidden="true" className="account-settings-avatar">
            {getAccountInitials(session.email)}
          </div>
          <div className="account-settings-profile__copy">
            <strong>{session.email ?? translations.accountEmail}</strong>
            <span>{translations.registeredAccount}</span>
          </div>
        </div>

        <div className="account-settings-section">
          <h3>{translations.accountAccess}</h3>
          <p>{translations.accountAccessDescription}</p>
          <dl className="account-settings-details">
            <div>
              <dt>{translations.accountStatus}</dt>
              <dd>
                <span className="account-settings-status">{translations.active}</span>
              </dd>
            </div>
            <div>
              <dt>{translations.accountDataOwnership}</dt>
              <dd>{translations.yourAccountData}</dd>
            </div>
          </dl>
        </div>

        <div className="account-settings-section account-settings-section--danger">
          <h3>{translations.accountSecurity}</h3>
          <p>{translations.accountSecurityDescription}</p>
          <button
            className="account-settings-sign-out"
            disabled={isSigningOut}
            onClick={onSignOut}
            type="button"
          >
            {translations.signOut}
          </button>
        </div>
      </section>
    </div>
  )
}

function getAccountInitials(email: string | null): string {
  if (!email) {
    return 'AC'
  }

  return email.slice(0, 2).toUpperCase()
}
