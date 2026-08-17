import { useEffect, useState } from 'react'

import { toThb } from '../lib/currency'
import type { CurrencyCode, ExchangeRate, TransactionDraft, TransactionRecord } from '../types'

const CARD_TYPE_OPTIONS = [
  'Sport card',
  'Pokemon card',
  'One Piece Card',
  'JH Card',
  'Others',
] as const

type FormErrors = Partial<Record<'price' | 'customCardType' | 'transactionDate' | 'exchangeRate', string>>

export interface TransactionFormProps {
  defaultCurrency: CurrencyCode
  editingTransaction: TransactionRecord | null
  getExchangeRate: () => Promise<ExchangeRate>
  isSubmitting?: boolean
  onClearEdit: () => void
  onSubmit: (draft: TransactionDraft) => Promise<void>
  resetSignal: number
}

export function TransactionForm({
  defaultCurrency,
  editingTransaction,
  getExchangeRate,
  isSubmitting = false,
  onClearEdit,
  onSubmit,
  resetSignal,
}: TransactionFormProps) {
  const [draft, setDraft] = useState<TransactionDraft>(() => createInitialDraft(defaultCurrency))
  const [errors, setErrors] = useState<FormErrors>({})
  const [exchangeRate, setExchangeRate] = useState<ExchangeRate | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)
  const [isLoadingRate, setIsLoadingRate] = useState(false)

  useEffect(() => {
    if (editingTransaction) {
      setDraft({
        action: editingTransaction.action,
        cardType: editingTransaction.cardType,
        customCardType: editingTransaction.customCardType,
        price: trimTrailingZeros(editingTransaction.price),
        currency: editingTransaction.currency,
        transactionDate: editingTransaction.transactionDate,
      })
      return
    }

    setDraft(createInitialDraft(defaultCurrency))
  }, [defaultCurrency, editingTransaction, resetSignal])

  useEffect(() => {
    setErrors({})
  }, [draft.action, draft.cardType, draft.currency, draft.customCardType, draft.price, draft.transactionDate])

  useEffect(() => {
    let isCancelled = false

    if (draft.currency !== 'USD' || !draft.price.trim()) {
      setExchangeRate(null)
      setIsLoadingRate(false)
      setRateError(null)
      return () => {
        isCancelled = true
      }
    }

    setExchangeRate(null)
    setIsLoadingRate(true)
    setRateError(null)

    getExchangeRate()
      .then((nextRate) => {
        if (isCancelled) {
          return
        }

        setExchangeRate(nextRate)
      })
      .catch((error: unknown) => {
        if (isCancelled) {
          return
        }

        setExchangeRate(null)
        setRateError(toErrorMessage(error))
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingRate(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [draft.currency, draft.price, getExchangeRate])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const validationErrors = validateDraft(draft, exchangeRate)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    await onSubmit(normalizeDraft(draft))
  }

  function updateDraft<K extends keyof TransactionDraft>(key: K, value: TransactionDraft[K]) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [key]: value,
      ...(key === 'cardType' && value !== 'Others'
        ? { customCardType: null }
        : {}),
    }))
  }

  function handleClear() {
    setDraft(createInitialDraft(defaultCurrency))
    setErrors({})
    setRateError(null)
    onClearEdit()
  }

  const pricePreview =
    draft.currency === 'USD' && exchangeRate
      ? toThb(draft.price || '0', 'USD', exchangeRate.rate)
      : draft.currency === 'THB' && draft.price.trim()
        ? toThb(draft.price, 'THB', '1')
        : null

  const submitLabel = editingTransaction ? 'UPDATE' : 'SAVE'

  return (
    <section className="panel" aria-labelledby="transaction-form-title">
      <div className="panel-header">
        <h2 id="transaction-form-title">Transaction form</h2>
        <p>Capture BUY and SELL transactions with original currency details.</p>
      </div>

      <form className="ledger-form" onSubmit={handleSubmit}>
        <fieldset className="segment-control">
          <legend>Action</legend>
          <label className="segment-option">
            <input
              checked={draft.action === 'BUY'}
              name="action"
              onChange={() => updateDraft('action', 'BUY')}
              type="radio"
            />
            BUY
          </label>
          <label className="segment-option">
            <input
              checked={draft.action === 'SELL'}
              name="action"
              onChange={() => updateDraft('action', 'SELL')}
              type="radio"
            />
            SELL
          </label>
        </fieldset>

        <label className="field">
          <span>Card Type</span>
          <select
            aria-label="Card Type"
            onChange={(event) => updateDraft('cardType', event.target.value)}
            value={draft.cardType}
          >
            {CARD_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {draft.cardType === 'Others' ? (
          <label className="field">
            <span>Custom card type</span>
            <input
              aria-invalid={Boolean(errors.customCardType)}
              aria-label="Custom card type"
              onChange={(event) => updateDraft('customCardType', event.target.value)}
              type="text"
              value={draft.customCardType ?? ''}
            />
            {errors.customCardType ? <span className="field-error">{errors.customCardType}</span> : null}
          </label>
        ) : null}

        <label className="field">
          <span>Price</span>
          <input
            aria-invalid={Boolean(errors.price)}
            aria-label="Price"
            inputMode="decimal"
            onChange={(event) => updateDraft('price', event.target.value)}
            placeholder="0.00"
            type="text"
            value={draft.price}
          />
          {errors.price ? <span className="field-error">{errors.price}</span> : null}
        </label>

        <label className="field">
          <span>Currency</span>
          <select
            aria-label="Currency"
            onChange={(event) => updateDraft('currency', event.target.value as CurrencyCode)}
            value={draft.currency}
          >
            <option value="THB">🇹🇭 THB ฿</option>
            <option value="USD">🇺🇸 USD $</option>
          </select>
        </label>

        {draft.currency === 'USD' ? (
          <div className="rate-preview" aria-live="polite">
            {isLoadingRate ? <p>Loading latest USD rate…</p> : null}
            {exchangeRate ? (
              <>
                <p>1 USD = ฿{exchangeRate.rate} THB</p>
                {pricePreview ? <p>≈ ฿{pricePreview} THB</p> : null}
                <p>Provider date: {exchangeRate.providerDate}</p>
                {exchangeRate.stale ? <p>Cached rate</p> : null}
              </>
            ) : null}
            {rateError ? <p className="field-error">{rateError}</p> : null}
            {errors.exchangeRate ? <span className="field-error">{errors.exchangeRate}</span> : null}
          </div>
        ) : pricePreview ? (
          <div className="rate-preview" aria-live="polite">
            <p>Canonical THB amount: ฿{pricePreview}</p>
          </div>
        ) : null}

        <label className="field">
          <span>Transaction date</span>
          <input
            aria-invalid={Boolean(errors.transactionDate)}
            aria-label="Transaction date"
            onChange={(event) => updateDraft('transactionDate', event.target.value)}
            type="date"
            value={draft.transactionDate}
          />
          {errors.transactionDate ? <span className="field-error">{errors.transactionDate}</span> : null}
        </label>

        <div className="form-actions">
          <button disabled={isSubmitting} type="submit">
            {submitLabel}
          </button>
          <button disabled={isSubmitting} onClick={handleClear} type="button">
            CLEAR
          </button>
        </div>
      </form>
    </section>
  )
}

function createInitialDraft(defaultCurrency: CurrencyCode): TransactionDraft {
  return {
    action: 'BUY',
    cardType: 'Sport card',
    customCardType: null,
    price: '',
    currency: defaultCurrency,
    transactionDate: formatLocalDate(new Date()),
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validateDraft(draft: TransactionDraft, exchangeRate: ExchangeRate | null): FormErrors {
  const errors: FormErrors = {}

  if (!draft.price.trim()) {
    errors.price = 'Price is required.'
  } else if (!Number.isFinite(Number(draft.price)) || Number(draft.price) <= 0) {
    errors.price = 'Price must be greater than 0.'
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.transactionDate)) {
    errors.transactionDate = 'Transaction date must use YYYY-MM-DD.'
  }

  if (draft.cardType === 'Others' && !draft.customCardType?.trim()) {
    errors.customCardType = 'Custom card type is required.'
  }

  if (draft.currency === 'USD' && !exchangeRate) {
    errors.exchangeRate = 'A USD to THB rate is required before saving.'
  }

  return errors
}

function normalizeDraft(draft: TransactionDraft): TransactionDraft {
  return {
    ...draft,
    price: draft.price.trim(),
    customCardType: draft.cardType === 'Others' ? draft.customCardType?.trim() ?? '' : null,
  }
}

function trimTrailingZeros(value: string): string {
  return value.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unable to load the USD to THB rate right now.'
}
