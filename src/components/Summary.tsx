import { getCurrencySymbol } from '../lib/currency'
import { getTranslations } from '../lib/i18n'
import type { CurrencyCode, ExchangeRate, Language, SummaryTotals } from '../types'

export interface SummaryProps {
  displayCurrency: CurrencyCode
  exchangeRate: ExchangeRate | null
  language?: Language
  onDisplayCurrencyChange: (currency: CurrencyCode) => void
  totals: SummaryTotals
}

export function Summary({
  displayCurrency,
  exchangeRate,
  language = 'en',
  onDisplayCurrencyChange,
  totals,
}: SummaryProps) {
  const translations = getTranslations(language)
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
      ? translations.profit
      : totals.profitLossStatus === 'loss'
        ? translations.loss
        : translations.breakEven

  return (
    <section className="panel" aria-labelledby="summary-title">
      <div className="panel-header summary-header">
        <div>
          <h2 id="summary-title">{translations.summaryTitle}</h2>
        </div>

        <div className="summary-switch" aria-label={translations.displayCurrency}>
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
        <SummaryItem currency={displayCurrency} label={translations.buy.toUpperCase()} locale={language} value={summaryValues.buy} />
        <SummaryItem currency={displayCurrency} label={translations.sell.toUpperCase()} locale={language} value={summaryValues.sell} />
        <SummaryItem
          className={`summary-tone-${totals.profitLossStatus}`}
          currency={displayCurrency}
          detail={profitLossLabel}
          label="P/L"
          locale={language}
          value={summaryValues.profitLoss}
        />
      </dl>

      {exchangeRate ? (
        <p className="summary-meta">
          {translations.rateDate(exchangeRate.providerDate)}
          {exchangeRate.stale ? ` · ${translations.cachedRate}` : ''}
        </p>
      ) : displayCurrency === 'USD' ? (
        <p className="summary-meta">{translations.usdSummaryUnavailable}</p>
      ) : null}
    </section>
  )
}

function SummaryItem({
  className = '',
  currency,
  detail,
  label,
  locale,
  value,
}: {
  className?: string
  currency: CurrencyCode
  detail?: string
  label: string
  locale: Language
  value: string | null
}) {
  return (
    <div className={`summary-card ${className}`.trim()}>
      <dt>{label}</dt>
      <dd>{value ? formatAmount(value, currency, locale) : getTranslations(locale).unavailable}</dd>
      {detail ? <p>{detail}</p> : null}
    </div>
  )
}

function formatAmount(amount: string, currency: CurrencyCode, language: Language): string {
  const value = Number(amount)
  const prefix = value < 0 ? '-' : ''
  const formatted = new Intl.NumberFormat(language === 'th' ? 'th-TH' : 'en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(Math.abs(value))

  return `${prefix}${getCurrencySymbol(currency)}${formatted}`
}
