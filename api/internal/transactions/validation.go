package transactions

import (
	"context"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"strings"
	"time"

	"cardledger/api/internal/rates"
)

var allowedCardTypes = map[string]struct{}{
	"Sport card":     {},
	"Pokemon card":   {},
	"One Piece Card": {},
	"JH Card":        {},
	"Others":         {},
}

var decimalPattern = regexp.MustCompile(`^[+-]?\d+(?:\.\d+)?$`)
var errInvalidUSDRate = errors.New("invalid USD/THB rate")

func ValidateAndCanonicalize(ctx context.Context, input TransactionInput, provider rates.RateProvider) (CanonicalTransaction, error) {
	action := strings.TrimSpace(input.Action)
	if action != "BUY" && action != "SELL" {
		return CanonicalTransaction{}, errors.New("action must be BUY or SELL")
	}

	cardType := strings.TrimSpace(input.CardType)
	if _, ok := allowedCardTypes[cardType]; !ok {
		return CanonicalTransaction{}, errors.New("card_type is invalid")
	}

	customCardType, err := validateCustomCardType(cardType, input.CustomCardType)
	if err != nil {
		return CanonicalTransaction{}, err
	}

	price := strings.TrimSpace(input.Price)
	priceRat, err := parsePositiveDecimal(price)
	if err != nil {
		return CanonicalTransaction{}, err
	}

	currency := strings.TrimSpace(input.Currency)
	if currency != "THB" && currency != "USD" {
		return CanonicalTransaction{}, errors.New("currency must be THB or USD")
	}

	transactionDate, err := parseDate(strings.TrimSpace(input.TransactionDate), "transaction_date must be YYYY-MM-DD")
	if err != nil {
		return CanonicalTransaction{}, err
	}

	result := CanonicalTransaction{
		Action:          action,
		CardType:        cardType,
		CustomCardType:  customCardType,
		Price:           price,
		Currency:        currency,
		TransactionDate: transactionDate.Format("2006-01-02"),
	}

	if currency == "THB" {
		result.PriceTHB = formatRounded(priceRat, 2)
		result.ExchangeRateToTHB = "1"
		result.ExchangeRateDate = result.TransactionDate
		return result, nil
	}

	if provider == nil {
		return CanonicalTransaction{}, errors.New("rate provider is required for USD transactions")
	}

	rate, err := provider.USDToTHB(ctx)
	if err != nil {
		return CanonicalTransaction{}, fmt.Errorf("get USD/THB rate: %w", err)
	}

	rateRat, err := parsePositiveRate(rate.Value)
	if err != nil {
		return CanonicalTransaction{}, fmt.Errorf("%w: exchange rate must be positive: %v", errInvalidUSDRate, err)
	}
	if rate.Base != "USD" || rate.Quote != "THB" {
		return CanonicalTransaction{}, fmt.Errorf("%w: exchange rate must be USD/THB", errInvalidUSDRate)
	}

	result.PriceTHB = formatRounded(new(big.Rat).Mul(priceRat, rateRat), 2)
	result.ExchangeRateToTHB = rate.Value
	result.ExchangeRateDate = rate.ProviderDate.Format("2006-01-02")
	return result, nil
}

func validateCustomCardType(cardType string, custom *string) (*string, error) {
	if cardType == "Others" {
		if custom == nil || strings.TrimSpace(*custom) == "" {
			return nil, errors.New("custom_card_type is required for Others")
		}
		value := strings.TrimSpace(*custom)
		return &value, nil
	}

	if custom != nil && strings.TrimSpace(*custom) != "" {
		return nil, errors.New("custom_card_type is only allowed when card_type is Others")
	}

	return nil, nil
}

func parsePositiveDecimal(value string) (*big.Rat, error) {
	rat, err := parsePositiveRate(value)
	if err != nil {
		return nil, err
	}
	if fractionalDigits(value) > 2 {
		return nil, errors.New("price must have at most 2 decimal places")
	}
	return rat, nil
}

func parsePositiveRate(value string) (*big.Rat, error) {
	if !decimalPattern.MatchString(value) {
		return nil, errors.New("price must be a decimal")
	}

	rat, ok := new(big.Rat).SetString(value)
	if !ok {
		return nil, errors.New("price must be a decimal")
	}
	if rat.Sign() <= 0 {
		return nil, errors.New("price must be positive")
	}
	return rat, nil
}

func fractionalDigits(value string) int {
	index := strings.IndexByte(value, '.')
	if index == -1 {
		return 0
	}

	return len(value) - index - 1
}

func parseDate(value string, message string) (time.Time, error) {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil || parsed.Format("2006-01-02") != value {
		return time.Time{}, errors.New(message)
	}
	return parsed, nil
}

func formatRounded(value *big.Rat, scale int) string {
	scaled := new(big.Rat).Mul(value, pow10(scale))
	quotient, remainder := new(big.Int), new(big.Int)
	quotient.QuoRem(scaled.Num(), scaled.Denom(), remainder)

	doubleRemainder := new(big.Int).Mul(remainder, big.NewInt(2))
	if doubleRemainder.Cmp(scaled.Denom()) >= 0 {
		quotient.Add(quotient, big.NewInt(1))
	}

	return formatScaledInteger(quotient, scale)
}

func pow10(scale int) *big.Rat {
	return new(big.Rat).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(scale)), nil))
}

func formatScaledInteger(value *big.Int, scale int) string {
	sign := ""
	if value.Sign() < 0 {
		sign = "-"
		value = new(big.Int).Abs(value)
	}

	digits := value.String()
	if scale == 0 {
		return sign + digits
	}

	if len(digits) <= scale {
		digits = strings.Repeat("0", scale-len(digits)+1) + digits
	}

	split := len(digits) - scale
	return sign + digits[:split] + "." + digits[split:]
}
