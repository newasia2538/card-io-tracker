export type TransactionAction = 'BUY' | 'SELL'

export type TransactionFilter = 'ALL' | TransactionAction

export type Language = 'en' | 'th'

export type Theme = 'day' | 'night'

export type CurrencyCode = 'THB' | 'USD'

export type ProfitLossStatus = 'profit' | 'loss' | 'neutral'

export interface AuthSession {
  accessToken: string
  userId: string
  isAnonymous: boolean
}

export interface TransactionDraft {
  action: TransactionAction
  cardType: string
  customCardType: string | null
  price: string
  currency: CurrencyCode
  transactionDate: string
}

export interface TransactionRecord extends TransactionDraft {
  id: string
  userId: string
  priceThb: string
  exchangeRateToThb: string
  exchangeRateDate: string
  createdAt: string
  updatedAt: string
}

export interface ExchangeRate {
  base: CurrencyCode
  quote: CurrencyCode
  rate: string
  providerDate: string
  stale: boolean
}

export interface SummaryTotals {
  totalBuyTHB: string
  totalSellTHB: string
  profitLossTHB: string
  totalBuyUSD: string | null
  totalSellUSD: string | null
  profitLossUSD: string | null
  profitLossStatus: ProfitLossStatus
}
