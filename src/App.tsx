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
  const [bootstrapErrorMessage, setBootstrapErrorMessage] = useState<string | null>(null)
  const [isUpgradeOpen, setIsUpgradeOpen] = useState(false)
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0)

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
      setBootstrapErrorMessage(null)
      setStatusMessage('Loading your ledger…')

      try {
        const nextSession = await authLoader()
        if (isCancelled) {
          return
        }

        setSession(nextSession)

        const ledgerData = await refreshTransactions(apiClient)
        if (isCancelled) {
          return
        }

        applyTransactionState(ledgerData, setBuyTransactions, setSellTransactions, setExchangeRate)
        setBootstrapErrorMessage(null)
        setStatusMessage('Ledger ready.')
      } catch (error) {
        if (!isCancelled) {
          setBootstrapErrorMessage(toErrorMessage(error))
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
  }, [apiClient, authLoader, bootstrapAttempt])

  async function handleSubmit(draft: TransactionDraft) {
    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      if (editingTransaction) {
        await apiClient.updateTransaction(editingTransaction.id, draft)
        applyTransactionState(
          await refreshTransactions(apiClient),
          setBuyTransactions,
          setSellTransactions,
          setExchangeRate,
        )
        setStatusMessage('Transaction updated.')
      } else {
        await apiClient.createTransaction(draft)
        applyTransactionState(
          await refreshTransactions(apiClient),
          setBuyTransactions,
          setSellTransactions,
          setExchangeRate,
        )
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
    const isDeletingEditingTransaction = editingTransaction?.id === id

    try {
      await apiClient.deleteTransaction(id)
      applyTransactionState(
        await refreshTransactions(apiClient),
        setBuyTransactions,
        setSellTransactions,
        setExchangeRate,
      )
      if (isDeletingEditingTransaction) {
        setEditingTransaction(null)
        setResetSignal((value) => value + 1)
      }
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
    if (session?.isAnonymous && nextSession.userId !== session.userId) {
      setErrorMessage('The upgraded session did not match the current anonymous account. Please try again with the same account.')
      setStatusMessage('Unable to upgrade your account.')
      return
    }

    setErrorMessage(null)
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
          {bootstrapErrorMessage || errorMessage ? (
            <p role="alert">{bootstrapErrorMessage ?? errorMessage}</p>
          ) : null}
          {bootstrapErrorMessage && !isLoading ? (
            <button onClick={() => setBootstrapAttempt((value) => value + 1)} type="button">
              Retry loading ledger
            </button>
          ) : null}
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

type RefreshedTransactions = {
  buyTransactions: TransactionRecord[]
  sellTransactions: TransactionRecord[]
  exchangeRate: ExchangeRate | null
}

async function refreshTransactions(
  client: ApiClient,
): Promise<RefreshedTransactions> {
  const [buy, sell, rateResult] = await Promise.all([
    client.listTransactions('BUY'),
    client.listTransactions('SELL'),
    client
      .getExchangeRate()
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
  if (ledgerData.exchangeRate) {
    setExchangeRate(ledgerData.exchangeRate)
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Something went wrong.'
}
