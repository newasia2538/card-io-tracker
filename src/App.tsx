import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  ensureAuthSession,
  getSupabaseClient,
  type AccountAuthClient,
} from './lib/auth'
import { apiClient as defaultApiClient, type ApiClient } from './lib/api'
import { getDefaultCurrency, summarizeTransactions } from './lib/currency'
import { getTranslations, type Translations } from './lib/i18n'
import type {
  AuthSession,
  CurrencyCode,
  ExchangeRate,
  Language,
  Theme,
  TransactionDraft,
  TransactionFilter,
  TransactionRecord,
} from './types'
import { AccountSignInDialog } from './components/AccountSignInDialog'
import { AccountUpgradeDialog } from './components/AccountUpgradeDialog'
import { Summary } from './components/Summary'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'

export interface AppProps {
  apiClient?: ApiClient
  authClient?: AccountAuthClient
  authLoader?: () => Promise<AuthSession>
  locale?: string
}

export function App({
  apiClient = defaultApiClient,
  authClient = getSupabaseClient().auth as unknown as AccountAuthClient,
  authLoader = ensureAuthSession,
  locale = navigator.language,
}: AppProps) {
  const defaultCurrency = getDefaultCurrency(locale)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [buyTransactions, setBuyTransactions] = useState<TransactionRecord[]>([])
  const [sellTransactions, setSellTransactions] = useState<TransactionRecord[]>([])
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [activeTab, setActiveTab] = useState<TransactionFilter>('ALL')
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(defaultCurrency)
  const [language, setLanguage] = useState<Language>('en')
  const [theme, setTheme] = useState<Theme>(getDefaultTheme)
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusKey, setStatusKey] = useState<StatusKey>('loading')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState<string | null>(null)
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false)
  const [isSignInOpen, setIsSignInOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)
  const accountGenerationRef = useRef(0)
  const translations = getTranslations(language)
  const statusMessage = getStatusMessage(translations, statusKey)
  const getExchangeRate = useCallback(
    () => apiClient.getExchangeRate(session ?? undefined),
    [apiClient, session],
  )

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const allTransactions = useMemo(
    () => [...buyTransactions, ...sellTransactions],
    [buyTransactions, sellTransactions],
  )

  const totals = useMemo(
    () => summarizeTransactions(allTransactions, exchangeRate?.rate ?? null),
    [allTransactions, exchangeRate],
  )

  useEffect(() => {
    let isCancelled = false
    const accountGeneration = accountGenerationRef.current
    const isStale = () => isCancelled || accountGeneration !== accountGenerationRef.current

    async function bootstrap() {
      setIsLoading(true)
      setErrorMessage(null)
      setBootstrapErrorMessage(null)
      setStatusKey('loading')

      try {
        const nextSession = await authLoader()
        if (isStale()) {
          return
        }

        setSession(nextSession)
        await refreshAndApplyTransactions({
          client: apiClient,
          isCancelled: isStale,
          session: nextSession,
          setBuyTransactions,
          setExchangeRate,
          setSellTransactions,
        })
        if (isStale()) {
          return
        }
        setBootstrapErrorMessage(null)
        setStatusKey('ready')
      } catch (error) {
        if (!isStale()) {
          setBootstrapErrorMessage(toErrorMessage(error))
          setStatusKey('unavailable')
        }
      } finally {
        if (!isStale()) {
          setIsLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      isCancelled = true
    }
  }, [apiClient, authLoader, bootstrapAttempt])

  async function handleSubmit(draft: TransactionDraft) {
    const accountGeneration = accountGenerationRef.current
    const isStale = () => accountGeneration !== accountGenerationRef.current
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      if (editingTransaction) {
        await apiClient.updateTransaction(editingTransaction.id, draft, session ?? undefined)
        await refreshAndApplyTransactions({
          client: apiClient,
          isCancelled: isStale,
          session: session ?? undefined,
          setBuyTransactions,
          setExchangeRate,
          setSellTransactions,
        })
        if (isStale()) {
          return
        }
        setStatusKey('updated')
      } else {
        await apiClient.createTransaction(draft, session ?? undefined)
        await refreshAndApplyTransactions({
          client: apiClient,
          isCancelled: isStale,
          session: session ?? undefined,
          setBuyTransactions,
          setExchangeRate,
          setSellTransactions,
        })
        if (isStale()) {
          return
        }
        setStatusKey('saved')
      }

      setEditingTransaction(null)
      setResetSignal((value) => value + 1)
    } catch (error) {
      if (!isStale()) {
        setErrorMessage(toErrorMessage(error))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    const accountGeneration = accountGenerationRef.current
    const isStale = () => accountGeneration !== accountGenerationRef.current
    setErrorMessage(null)
    const isDeletingEditingTransaction = editingTransaction?.id === id

    try {
      await apiClient.deleteTransaction(id, session ?? undefined)
      await refreshAndApplyTransactions({
        client: apiClient,
        isCancelled: isStale,
        session: session ?? undefined,
        setBuyTransactions,
        setExchangeRate,
        setSellTransactions,
      })
      if (isStale()) {
        return
      }
      if (isDeletingEditingTransaction) {
        setEditingTransaction(null)
        setResetSignal((value) => value + 1)
      }
      setStatusKey('deleted')
    } catch (error) {
      if (!isStale()) {
        setErrorMessage(toErrorMessage(error))
      }
    }
  }

  function handleClearEdit() {
    setEditingTransaction(null)
    setResetSignal((value) => value + 1)
  }

  async function applyAuthenticatedSession(
    nextSession: AuthSession,
    nextStatusKey: 'upgraded' | 'signedIn',
  ) {
    const accountGeneration = accountGenerationRef.current + 1
    accountGenerationRef.current = accountGeneration
    const isStale = () => accountGeneration !== accountGenerationRef.current
    setSession(nextSession)
    setBuyTransactions([])
    setSellTransactions([])
    setExchangeRate(null)
    setEditingTransaction(null)
    setResetSignal((value) => value + 1)
    setIsLoading(true)
    setBootstrapErrorMessage(null)
    setErrorMessage(null)
    setStatusKey('loading')

    try {
      await refreshAndApplyTransactions({
        client: apiClient,
        isCancelled: isStale,
        session: nextSession,
        setBuyTransactions,
        setExchangeRate,
        setSellTransactions,
      })
      if (isStale()) {
        return
      }
      setIsUpgradeOpen(false)
      setIsSignInOpen(false)
      setStatusKey(nextStatusKey)
    } catch (error) {
      if (!isStale()) {
        setBootstrapErrorMessage(toErrorMessage(error))
        setStatusKey('unavailable')
      }
    } finally {
      if (!isStale()) {
        setIsLoading(false)
      }
    }
  }

  function handleUpgraded(nextSession: AuthSession) {
    if (session?.isAnonymous && nextSession.userId !== session.userId) {
      setErrorMessage(translations.sessionMismatch)
      setStatusKey('upgradeUnavailable')
      return
    }

    void applyAuthenticatedSession(nextSession, 'upgraded')
  }

  function handleSignedIn(nextSession: AuthSession) {
    if (nextSession.isAnonymous) {
      setErrorMessage(translations.signInError)
      return
    }

    void applyAuthenticatedSession(nextSession, 'signedIn')
  }

  async function handleSignOut() {
    setIsSigningOut(true)
    setErrorMessage(null)

    try {
      const result = await authClient.signOut()
      if (result.error) {
        throw result.error
      }

      accountGenerationRef.current += 1
      setSession(null)
      setBuyTransactions([])
      setSellTransactions([])
      setExchangeRate(null)
      setEditingTransaction(null)
      setResetSignal((value) => value + 1)
      setIsUpgradeOpen(false)
      setIsSignInOpen(false)
      setBootstrapErrorMessage(null)
      setStatusKey('loading')
      setBootstrapAttempt((value) => value + 1)
    } catch (error) {
      setErrorMessage(toErrorMessage(error) || translations.signOutError)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <main className="app-shell" data-language={language} data-theme={theme}>
      <section className="app-hero">
        <div className="app-hero__brand">
          <img
            alt="CardIO app icon"
            className="app-hero__icon"
            decoding="async"
            height="72"
            src="/icon.webp"
            width="72"
          />
          <div>
            <p className="eyebrow">{translations.heroEyebrow}</p>
            <h1>{translations.brandName}</h1>
            <p className="hero-copy">{translations.brandDescription}</p>
          </div>
        </div>

        <div className="app-hero__side">
          <div className="preference-switches">
            <div className="preference-switch" aria-label={translations.themeSwitchLabel} role="group">
              <button
                aria-pressed={theme === 'day'}
                onClick={() => setTheme('day')}
                type="button"
              >
                {translations.day}
              </button>
              <button
                aria-pressed={theme === 'night'}
                onClick={() => setTheme('night')}
                type="button"
              >
                {translations.night}
              </button>
            </div>
            <div className="preference-switch" aria-label={translations.languageSwitchLabel} role="group">
              <button
                aria-pressed={language === 'en'}
                onClick={() => setLanguage('en')}
                type="button"
              >
                {translations.english}
              </button>
              <button
                aria-pressed={language === 'th'}
                onClick={() => setLanguage('th')}
                type="button"
              >
                {translations.thai}
              </button>
            </div>
          </div>

          <div className="status-panel">
            <p aria-live="polite" role="status">
              {isLoading ? translations.loadingLedger : statusMessage}
            </p>
            {bootstrapErrorMessage || errorMessage ? (
              <p role="alert">{bootstrapErrorMessage ?? errorMessage}</p>
            ) : null}
            {bootstrapErrorMessage && !isLoading ? (
              <button onClick={() => setBootstrapAttempt((value) => value + 1)} type="button">
                {translations.retryLoadingLedger}
              </button>
            ) : null}
            {session?.isAnonymous ? (
              <>
                <button onClick={() => setIsUpgradeOpen((open) => !open)} type="button">
                  {translations.createAccount}
                </button>
                <button onClick={() => setIsSignInOpen(true)} type="button">
                  {translations.signIn}
                </button>
              </>
            ) : session ? (
              <>
                <span aria-label={translations.accountEmail} className="account-email">
                  {session.email ?? translations.accountEmail}
                </span>
                <button
                  disabled={isSigningOut}
                  onClick={() => void handleSignOut()}
                  type="button"
                >
                  {translations.signOut}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className="app-layout">
        <div className="app-column">
          {session?.isAnonymous && isUpgradeOpen ? (
            <AccountUpgradeDialog
              authClient={authClient}
              language={language}
              onClose={() => setIsUpgradeOpen(false)}
              onSignIn={() => {
                setIsUpgradeOpen(false)
                setIsSignInOpen(true)
              }}
              onUpgraded={handleUpgraded}
            />
          ) : null}

          {session?.isAnonymous && isSignInOpen ? (
            <AccountSignInDialog
              authClient={authClient}
              hasAnonymousTransactions={allTransactions.length > 0}
              language={language}
              onClose={() => setIsSignInOpen(false)}
              onSignedIn={handleSignedIn}
            />
          ) : null}

          <TransactionForm
            defaultCurrency={defaultCurrency}
            editingTransaction={editingTransaction}
            getExchangeRate={getExchangeRate}
            isSubmitting={isSubmitting}
            language={language}
            onClearEdit={handleClearEdit}
            onSubmit={handleSubmit}
            resetSignal={resetSignal}
          />
        </div>

        <div className="app-column">
          <Summary
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate}
            language={language}
            onDisplayCurrencyChange={setDisplayCurrency}
            totals={totals}
          />

          <TransactionList
            activeTab={activeTab}
            buyTransactions={buyTransactions}
            language={language}
            onDelete={handleDelete}
            onEdit={setEditingTransaction}
            onTabChange={setActiveTab}
            sellTransactions={sellTransactions}
          />
        </div>
      </section>
    </main>
  )
}

type StatusKey =
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'saved'
  | 'updated'
  | 'deleted'
  | 'upgraded'
  | 'signedIn'
  | 'upgradeUnavailable'

function getStatusMessage(translations: Translations, statusKey: StatusKey): string {
  switch (statusKey) {
    case 'loading':
      return translations.loadingLedger
    case 'ready':
      return translations.ledgerReady
    case 'unavailable':
      return translations.ledgerUnavailable
    case 'saved':
      return translations.transactionSaved
    case 'updated':
      return translations.transactionUpdated
    case 'deleted':
      return translations.transactionDeleted
    case 'upgraded':
      return translations.accountUpgraded
    case 'signedIn':
      return translations.signedIn
    case 'upgradeUnavailable':
      return translations.unableToUpgrade
  }
}

type RefreshedTransactions = {
  buyTransactions: TransactionRecord[]
  sellTransactions: TransactionRecord[]
  exchangeRate: ExchangeRate | null
}

async function refreshTransactions(
  client: ApiClient,
  session?: AuthSession,
): Promise<RefreshedTransactions> {
  const [buy, sell, rateResult] = await Promise.all([
    client.listTransactions('BUY', session),
    client.listTransactions('SELL', session),
    client
      .getExchangeRate(session)
      .then((rate) => ({ rate, ok: true as const }))
      .catch(() => ({ ok: false as const })),
  ])

  return {
    buyTransactions: buy,
    sellTransactions: sell,
    exchangeRate: rateResult.ok ? rateResult.rate : null,
  }
}

function applyTransactionState(
  ledgerData: RefreshedTransactions,
  setBuyTransactions: React.Dispatch<React.SetStateAction<TransactionRecord[]>>,
  setSellTransactions: React.Dispatch<React.SetStateAction<TransactionRecord[]>>,
  setExchangeRate: React.Dispatch<React.SetStateAction<ExchangeRate | null>>,
) {
  setBuyTransactions(ledgerData.buyTransactions)
  setSellTransactions(ledgerData.sellTransactions)
  setExchangeRate(ledgerData.exchangeRate)
}

function getDefaultTheme(): Theme {
  const hour = new Date().getHours()
  return hour >= 6 && hour < 18 ? 'day' : 'night'
}

async function refreshAndApplyTransactions({
  client,
  session,
  setBuyTransactions,
  setExchangeRate,
  setSellTransactions,
  isCancelled = () => false,
}: {
  client: ApiClient
  session?: AuthSession
  setBuyTransactions: React.Dispatch<React.SetStateAction<TransactionRecord[]>>
  setExchangeRate: React.Dispatch<React.SetStateAction<ExchangeRate | null>>
  setSellTransactions: React.Dispatch<React.SetStateAction<TransactionRecord[]>>
  isCancelled?: () => boolean
}) {
  if (isCancelled()) {
    return
  }

  setExchangeRate(null)

  const ledgerData = await refreshTransactions(client, session)
  if (isCancelled()) {
    return
  }

  applyTransactionState(ledgerData, setBuyTransactions, setSellTransactions, setExchangeRate)
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}
