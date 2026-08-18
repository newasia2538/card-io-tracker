import { useMemo, useState } from 'react'

import { getTranslations } from '../lib/i18n'
import { getCurrencySymbol } from '../lib/currency'
import type { Language, TransactionFilter, TransactionRecord } from '../types'

export interface TransactionListProps {
  activeTab: TransactionFilter
  buyTransactions: TransactionRecord[]
  language?: Language
  onDelete: (id: string) => Promise<void>
  onEdit: (transaction: TransactionRecord) => void
  onTabChange: (action: TransactionFilter) => void
  sellTransactions: TransactionRecord[]
}

export function TransactionList({
  activeTab,
  buyTransactions,
  language = 'en',
  onDelete,
  onEdit,
  onTabChange,
  sellTransactions,
}: TransactionListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null)
  const translations = getTranslations(language)
  const allTransactions = useMemo(
    () => sortTransactionsLatestFirst([...buyTransactions, ...sellTransactions]),
    [buyTransactions, sellTransactions],
  )
  const visibleTransactions =
    activeTab === 'ALL'
      ? allTransactions
      : activeTab === 'BUY'
        ? sortTransactionsLatestFirst([...buyTransactions])
        : sortTransactionsLatestFirst([...sellTransactions])

  async function handleDelete(id: string) {
    setIsDeletingId(id)

    try {
      await onDelete(id)
      setPendingDeleteId(null)
    } finally {
      setIsDeletingId(null)
    }
  }

  return (
    <section className="panel" aria-labelledby="transactions-title">
      <div className="panel-header">
        <h2 id="transactions-title">{translations.transactionsTitle}</h2>
      </div>

      <div className="tab-strip" aria-label={translations.transactionTabs}>
        <button
          aria-pressed={activeTab === 'ALL'}
          onClick={() => onTabChange('ALL')}
          type="button"
        >
          {translations.all} ({allTransactions.length})
        </button>
        <button
          aria-pressed={activeTab === 'BUY'}
          onClick={() => onTabChange('BUY')}
          type="button"
        >
          {translations.buy} ({buyTransactions.length})
        </button>
        <button
          aria-pressed={activeTab === 'SELL'}
          onClick={() => onTabChange('SELL')}
          type="button"
        >
          {translations.sell} ({sellTransactions.length})
        </button>
      </div>

      {visibleTransactions.length === 0 ? (
        <p className="empty-state">
          {translations.noTransactions(
            activeTab === 'ALL'
              ? translations.all
              : activeTab === 'BUY'
                ? translations.buy.toUpperCase()
                : translations.sell.toUpperCase(),
          )}
        </p>
      ) : (
        <div className="transaction-table-wrap">
          <table className="transaction-table">
            <thead>
              <tr>
                <th data-label={translations.transactionDate} scope="col">
                  {translations.transactionDate}
                </th>
                <th data-label={translations.cardType} scope="col">
                  {translations.cardType}
                </th>
                <th data-label="USD" scope="col">USD</th>
                <th data-label="THB" scope="col">THB</th>
                <th data-label={translations.actions} scope="col">
                  {translations.actions}
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.map((transaction) => {
                const label = getTransactionLabel(transaction)
                const isPendingDelete = pendingDeleteId === transaction.id
                const isDeleting = isDeletingId === transaction.id

                return (
                  <tr className={`transaction-row transaction-row--${transaction.action.toLowerCase()}`} key={transaction.id}>
                    <td data-label={translations.transactionDate}>{transaction.transactionDate}</td>
                    <td data-label={translations.cardType}>{label}</td>
                    <td data-label="USD">{formatOriginalAmount(transaction.price, transaction.currency, language)}</td>
                    <td data-label="THB">{formatThbAmount(transaction.priceThb, language)}</td>
                    <td data-label={translations.actions}>
                      <div className="transaction-row__actions">
                        <button aria-label={translations.edit(label)} onClick={() => onEdit(transaction)} type="button">
                          {translations.editAction}
                        </button>

                        {isPendingDelete ? (
                          <>
                            <button
                              disabled={isDeleting}
                              onClick={() => void handleDelete(transaction.id)}
                              type="button"
                            >
                              {translations.confirmDelete}
                            </button>
                            <button
                              disabled={isDeleting}
                              onClick={() => setPendingDeleteId(null)}
                              type="button"
                            >
                              {translations.cancel}
                            </button>
                          </>
                        ) : (
                          <button aria-label={translations.delete(label)} onClick={() => setPendingDeleteId(transaction.id)} type="button">
                            {translations.deleteAction}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function sortTransactionsLatestFirst(transactions: TransactionRecord[]): TransactionRecord[] {
  return transactions.sort((left, right) => {
    const dateOrder = right.transactionDate.localeCompare(left.transactionDate)
    if (dateOrder !== 0) {
      return dateOrder
    }

    return right.createdAt.localeCompare(left.createdAt)
  })
}

function getTransactionLabel(transaction: TransactionRecord): string {
  if (transaction.cardType === 'Others' && transaction.customCardType) {
    return transaction.customCardType
  }

  return transaction.cardType
}

function formatOriginalAmount(amount: string, currency: 'THB' | 'USD', language: Language): string {
  const formatted = new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(amount))

  return `${getCurrencySymbol(currency)}${formatted}`
}

function formatThbAmount(amount: string, language: Language): string {
  const formatted = new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(amount))

  return `${getCurrencySymbol('THB')}${formatted}`
}
