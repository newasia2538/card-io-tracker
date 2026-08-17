import { useEffect, useMemo, useState } from 'react'

import { ensureAuthSession, getSupabaseClient } from './lib/auth'
import { apiClient as defaultApiClient, type ApiClient } from './lib/api'
import { getDefaultCurrency, summarizeTransactions } from './lib/currency'
import type { AuthSession, CurrencyCode, ExchangeRate, TransactionAction, TransactionDraft, TransactionRecord } from './types'
import {
  AccountUpgradeDialog,
  type AccountUpgradeAuthClient,
} from './components/AccountUpgradeDialog'
import { Summary } from './components/Summary'
import { TransactionForm } from './components/TransactionForm'
import { TransactionList } from './components/TransactionList'

export interface AppProps {
  apiClient?: ApiClient
  authClient?: AccountUpgradeAuthClient
  authLoader?: () => Promise<AuthSession>
  locale?: string
}

export function App({
  apiClient = defaultApiClient,
  authClient = getSupabaseClient().auth as unknown as AccountUpgradeAuthClient,
  authLoader = ensureAuthSession,
  locale = navigator.language,
}: AppProps) {
  const defaultCurrency = getDefaultCurrency(locale)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [buyTransactions, setBuyTransactions] = useState<TransactionRecord[]>([])
  const [sellTransactions, setSellTransactions] = useState<TransactionRecord[]>([])
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [activeTab, setActiveTab] = useState<TransactionAction>('BUY')
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>(defaultCurrency)
  const [editingTransaction, setEditingTransaction] = useState<TransactionRecord | null>(null)
  const [resetSignal, setResetSignal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Loading your ledger…')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false)

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

    async function bootstrap() {
      setIsLoading(true)
      setErrorMessage(null)
      setStatusMessage('Loading your ledger…')

      try {
        const nextSession = await authLoader()
        if (isCancelled) {
          return
        }

        setSession(nextSession)
        await refreshTransactions(apiClient, setBuyTransactions, setSellTransactions, setExchangeRate)
        if (!isCancelled) {
          setStatusMessage('Ledger ready.')
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(toErrorMessage(error))
          setStatusMessage('Unable to load your ledger.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      isCancelled = true
    }
  }, [apiClient, authLoader])

  async function handleSubmit(draft: TransactionDraft) {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      if (editingTransaction) {
        await apiClient.updateTransaction(editingTransaction.id, draft)
        await refreshTransactions(apiClient, setBuyTransactions, setSellTransactions, setExchangeRate)
        setStatusMessage('Transaction updated.')
      } else {
        await apiClient.createTransaction(draft)
        await refreshTransactions(apiClient, setBuyTransactions, setSellTransactions, setExchangeRate)
        setStatusMessage('Transaction saved.')
      }

      setEditingTransaction(null)
      setResetSignal((value) => value + 1)
    } catch (error) {
      setErrorMessage(toErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    setErrorMessage(null)

    try {
      await apiClient.deleteTransaction(id)
      await refreshTransactions(apiClient, setBuyTransactions, setSellTransactions, setExchangeRate)
      setStatusMessage('Transaction deleted.')
    } catch (error) {
      setErrorMessage(toErrorMessage(error))
    }
  }

  function handleClearEdit() {
    setEditingTransaction(null)
    setResetSignal((value) => value + 1)
  }

  function handleUpgraded(nextSession: AuthSession) {
    setSession(nextSession)
    setIsUpgradeOpen(false)
    setStatusMessage('Account upgraded.')
  }

  return (
    <main className="app-shell">
      <section className="app-hero">
        <div>
          <p className="eyebrow">Card Ledger</p>
          <h1>Card Ledger</h1>
          <p className="hero-copy">
            Track BUY and SELL activity with canonical THB totals and original-currency history.
          </p>
        </div>

        <div className="status-panel">
          <p aria-live="polite" role="status">
            {isLoading ? 'Loading your ledger…' : statusMessage}
          </p>
          {errorMessage ? <p role="alert">{errorMessage}</p> : null}
          {session?.isAnonymous ? (
            <button onClick={() => setIsUpgradeOpen((open) => !open)} type="button">
              Upgrade account
            </button>
          ) : null}
        </div>
      </section>

      <section className="app-layout">
        <div className="app-column">
          <TransactionForm
            defaultCurrency={defaultCurrency}
            editingTransaction={editingTransaction}
            getExchangeRate={apiClient.getExchangeRate}
            isSubmitting={isSubmitting}
            onClearEdit={handleClearEdit}
            onSubmit={handleSubmit}
            resetSignal={resetSignal}
          />

          {session?.isAnonymous && isUpgradeOpen ? (
            <AccountUpgradeDialog
              authClient={authClient}
              onClose={() => setIsUpgradeOpen(false)}
              onUpgraded={handleUpgraded}
            />
          ) : null}
        </div>

        <div className="app-column">
          <Summary
            displayCurrency={displayCurrency}
            exchangeRate={exchangeRate}
            onDisplayCurrencyChange={setDisplayCurrency}
            totals={totals}
          />

          <TransactionList
            activeTab={activeTab}
            buyTransactions={buyTransactions}
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

async function refreshTransactions(
  client: ApiClient,
  setBuyTransactions: React.Dispatch<React.SetStateAction<TransactionRecord[]>>,
  setSellTransactions: React.Dispatch<React.SetStateAction<TransactionRecord[]>>,
  setExchangeRate: React.Dispatch<React.SetStateAction<ExchangeRate | null>>,
) {
  const [buy, sell, rateResult] = await Promise.all([
    client.listTransactions('BUY'),
    client.listTransactions('SELL'),
    client
      .getExchangeRate()
      .then((rate) => ({ rate, ok: true as const }))
      .catch(() => ({ ok: false as const })),
  ])

  setBuyTransactions(buy)
  setSellTransactions(sell)
  if (rateResult.ok) {
    setExchangeRate(rateResult.rate)
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}
