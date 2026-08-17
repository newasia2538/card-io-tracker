package transactions

import "context"

type TransactionInput struct {
	Action          string  `json:"action"`
	CardType        string  `json:"card_type"`
	CustomCardType  *string `json:"custom_card_type"`
	Price           string  `json:"price"`
	Currency        string  `json:"currency"`
	TransactionDate string  `json:"transaction_date"`
}

type CanonicalTransaction struct {
	Action            string
	CardType          string
	CustomCardType    *string
	Price             string
	Currency          string
	TransactionDate   string
	PriceTHB          string
	ExchangeRateToTHB string
	ExchangeRateDate  string
}

type StoredTransaction struct {
	UserID            string
	Action            string
	CardType          string
	CustomCardType    *string
	Price             string
	Currency          string
	PriceTHB          string
	ExchangeRateToTHB string
	ExchangeRateDate  string
	TransactionDate   string
}

type Transaction struct {
	ID                string  `json:"id"`
	UserID            string  `json:"user_id"`
	Action            string  `json:"action"`
	CardType          string  `json:"card_type"`
	CustomCardType    *string `json:"custom_card_type"`
	Price             string  `json:"price"`
	Currency          string  `json:"currency"`
	PriceTHB          string  `json:"price_thb"`
	ExchangeRateToTHB string  `json:"exchange_rate_to_thb"`
	ExchangeRateDate  string  `json:"exchange_rate_date"`
	TransactionDate   string  `json:"transaction_date"`
	CreatedAt         string  `json:"created_at"`
	UpdatedAt         string  `json:"updated_at"`
}

type TransactionStore interface {
	List(context.Context, string, string) ([]Transaction, error)
	Create(context.Context, string, StoredTransaction) (Transaction, error)
	Update(context.Context, string, string, StoredTransaction) (Transaction, error)
	Delete(context.Context, string, string) error
}
