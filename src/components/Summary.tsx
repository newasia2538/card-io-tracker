import { getCurrencySymbol } from '../lib/currency'
import type { CurrencyCode, ExchangeRate, SummaryTotals } from '../types'

export interface SummaryProps {
  displayCurrency: CurrencyCode
  exchangeRate: ExchangeRate | null
  onDisplayCurrencyChange: (currency: CurrencyCode) => void
  totals: SummaryTotals
}

export function Summary({
  displayCurrency,
  exchangeRate,
  onDisplayCurrencyChange,
  totals,
}: SummaryProps) {
  const summaryValues =
    displayCurrency === 'THB'
      ? {
          buy: totals.totalBuyTHB,
          sell: totals.totalSellTHB,
          profitLoss: totals.profitLossTHB,
        }
      : {
          buy: totals.totalBuyUSD,
          sell: totals.totalSellUSD,
          profitLoss: totals.profitLossUSD,
        }

  const profitLossLabel =
    totals.profitLossStatus === 'profit'
      ? 'Profit'
      : totals.profitLossStatus === 'loss'
        ? 'Loss'
        : 'Break even'

  return (
    <section className="panel" aria-labelledby="summary-title">
      <div className="panel-header summary-header">
        <div>
          <h2 id="summary-title">Ledger summary</h2>
          <p>Canonical totals are always based on saved THB amounts.</p>
        </div>

        <div className="summary-switch" aria-label="Display currency">
          <button
            aria-pressed={displayCurrency === 'THB'}
            onClick={() => onDisplayCurrencyChange('THB')}
            type="button"
          >
            THB
          </button>
          <button
            aria-pressed={displayCurrency === 'USD'}
            onClick={() => onDisplayCurrencyChange('USD')}
            type="button"
          >
            USD
          </button>
        </div>
      </div>

      <dl className="summary-grid">
        <SummaryItem currency={displayCurrency} label="BUY" value={summaryValues.buy} />
        <SummaryItem currency={displayCurrency} label="SELL" value={summaryValues.sell} />
        <SummaryItem
          className={`summary-tone-${totals.profitLossStatus}`}
          currency={displayCurrency}
          detail={profitLossLabel}
          label="P/L"
          value={summaryValues.profitLoss}
        />
      </dl>

      {exchangeRate ? (
        <p className="summary-meta">
          Rate date: {exchangeRate.providerDate}
          {exchangeRate.stale ? ' · Cached rate' : ''}
        </p>
      ) : displayCurrency === 'USD' ? (
        <p className="summary-meta">USD summary unavailable until exchange rate loads.</p>
      ) : null}
    </section>
  )
}

function SummaryItem({
  className = '',
  currency,
  detail,
  label,
  value,
}: {
  className?: string
  currency: CurrencyCode
  detail?: string
  label: string
  value: string | null
}) {
  return (
    <div className={`summary-card ${className}`.trim()}>
      <dt>{label}</dt>
      <dd>{value ? formatAmount(value, currency) : 'Unavailable'}</dd>
      {detail ? <p>{detail}</p> : null}
    </div>
  )
}

function formatAmount(amount: string, currency: CurrencyCode): string {
  const value = Number(amount)
  const prefix = value < 0 ? '-' : ''
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Math.abs(value))

  return `${prefix}${getCurrencySymbol(currency)}${formatted}`
}
