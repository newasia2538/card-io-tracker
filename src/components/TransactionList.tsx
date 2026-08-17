import { useState } from 'react'

import { getCurrencySymbol } from '../lib/currency'
import type { TransactionAction, TransactionRecord } from '../types'

export interface TransactionListProps {
  activeTab: TransactionAction
  buyTransactions: TransactionRecord[]
  onDelete: (id: string) => Promise<void>
  onEdit: (transaction: TransactionRecord) => void
  onTabChange: (action: TransactionAction) => void
  sellTransactions: TransactionRecord[]
}

export function TransactionList({
  activeTab,
  buyTransactions,
  onDelete,
  onEdit,
  onTabChange,
  sellTransactions,
}: TransactionListProps) {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null)
  const visibleTransactions = activeTab === 'BUY' ? buyTransactions : sellTransactions

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
        <h2 id="transactions-title">Transactions</h2>
        <p>Latest entries appear first inside each action tab.</p>
      </div>

      <div className="tab-strip" aria-label="Transaction tabs">
        <button
          aria-pressed={activeTab === 'BUY'}
          onClick={() => onTabChange('BUY')}
          type="button"
        >
          Buy ({buyTransactions.length})
        </button>
        <button
          aria-pressed={activeTab === 'SELL'}
          onClick={() => onTabChange('SELL')}
          type="button"
        >
          Sell ({sellTransactions.length})
        </button>
      </div>

      {visibleTransactions.length === 0 ? (
        <p className="empty-state">No {activeTab} transactions yet.</p>
      ) : (
        <ol className="transaction-list">
          {visibleTransactions.map((transaction) => {
            const label = getTransactionLabel(transaction)

            return (
              <li key={transaction.id} className="transaction-row">
                <div className="transaction-row__main">
                  <div>
                    <span className={`action-pill action-pill--${transaction.action.toLowerCase()}`}>
                      {transaction.action}
                    </span>
                    <h3>{label}</h3>
                  </div>
                  <p>{transaction.transactionDate}</p>
                </div>

                <div className="transaction-row__meta">
                  <p>{formatOriginalAmount(transaction.price, transaction.currency)}</p>
                  <p>Original currency</p>
                </div>

                <div className="transaction-row__actions">
                  <button onClick={() => onEdit(transaction)} type="button">
                    Edit {label}
                  </button>

                  {pendingDeleteId === transaction.id ? (
                    <>
                      <button
                        disabled={isDeletingId === transaction.id}
                        onClick={() => void handleDelete(transaction.id)}
                        type="button"
                      >
                        Confirm delete
                      </button>
                      <button
                        disabled={isDeletingId === transaction.id}
                        onClick={() => setPendingDeleteId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setPendingDeleteId(transaction.id)} type="button">
                      Delete {label}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function getTransactionLabel(transaction: TransactionRecord): string {
  if (transaction.cardType === 'Others' && transaction.customCardType) {
    return transaction.customCardType
  }

  return transaction.cardType
}

function formatOriginalAmount(amount: string, currency: 'THB' | 'USD'): string {
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Number(amount))

  return `${getCurrencySymbol(currency)}${formatted} ${currency}`
}
