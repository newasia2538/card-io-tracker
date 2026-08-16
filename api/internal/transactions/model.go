package transactions

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
