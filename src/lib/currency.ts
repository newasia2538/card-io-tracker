import Decimal from 'decimal.js'

import type {
  CurrencyCode,
  ProfitLossStatus,
  SummaryTotals,
  TransactionRecord,
} from '../types'

export function getDefaultCurrency(locale: string = navigator.language): CurrencyCode {
  return locale.toLowerCase().startsWith('th') ? 'THB' : 'USD'
}

export function toThb(
  amount: string,
  currency: CurrencyCode,
  usdToThbRate: string,
): string {
  if (currency === 'THB') {
    return formatDecimal(amount)
  }

  return formatDecimal(new Decimal(amount).mul(new Decimal(usdToThbRate)))
}

export function fromThb(
  amountThb: string,
  currency: CurrencyCode,
  usdToThbRate: string,
): string {
  if (currency === 'THB') {
    return formatDecimal(amountThb)
  }

  return formatDecimal(new Decimal(amountThb).div(new Decimal(usdToThbRate)))
}

export function summarizeTransactions(
  transactions: TransactionRecord[],
  usdToThbRate: string | null,
): SummaryTotals {
  let totalBuyTHB = new Decimal(0)
  let totalSellTHB = new Decimal(0)

  for (const transaction of transactions) {
    const amount = new Decimal(transaction.priceThb)
    if (transaction.action === 'BUY') {
      totalBuyTHB = totalBuyTHB.add(amount)
    } else {
      totalSellTHB = totalSellTHB.add(amount)
    }
  }

  const profitLossTHB = totalSellTHB.sub(totalBuyTHB)
  const totalBuyTHBString = formatDecimal(totalBuyTHB)
  const totalSellTHBString = formatDecimal(totalSellTHB)
  const profitLossTHBString = formatDecimal(profitLossTHB)

  if (!usdToThbRate) {
    return {
      totalBuyTHB: totalBuyTHBString,
      totalSellTHB: totalSellTHBString,
      profitLossTHB: profitLossTHBString,
      totalBuyUSD: null,
      totalSellUSD: null,
      profitLossUSD: null,
      profitLossStatus: getProfitLossStatus(profitLossTHBString),
    }
  }

  const totalBuyUSD = fromThb(totalBuyTHBString, 'USD', usdToThbRate)
  const totalSellUSD = fromThb(totalSellTHBString, 'USD', usdToThbRate)
  const profitLossUSD = fromThb(profitLossTHBString, 'USD', usdToThbRate)

  return {
    totalBuyTHB: totalBuyTHBString,
    totalSellTHB: totalSellTHBString,
    profitLossTHB: profitLossTHBString,
    totalBuyUSD,
    totalSellUSD,
    profitLossUSD,
    profitLossStatus: getProfitLossStatus(profitLossTHBString),
  }
}

export function getProfitLossStatus(amount: string): ProfitLossStatus {
  const value = new Decimal(amount)
  if (value.gt(0)) {
    return 'profit'
  }
  if (value.lt(0)) {
    return 'loss'
  }
  return 'neutral'
}

export function getCurrencySymbol(currency: CurrencyCode): string {
  return currency === 'THB' ? '฿' : '$'
}

export function formatMoney(amount: string, currency: CurrencyCode, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(new Decimal(amount).toNumber())
}

function formatDecimal(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)
}
