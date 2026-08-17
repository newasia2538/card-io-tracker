package graphql

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"cardledger/api/internal/transactions"
)

type ErrorKind string

const (
	ErrorKindConflict     ErrorKind = "conflict"
	ErrorKindNotFound     ErrorKind = "not_found"
	ErrorKindUnauthorized ErrorKind = "unauthorized"
	ErrorKindUnexpected   ErrorKind = "unexpected"
)

type Error struct {
	Kind    ErrorKind
	Message string
	Err     error
}

func (e *Error) StoreErrorKind() string {
	if e == nil {
		return ""
	}
	return string(e.Kind)
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	if e.Err != nil {
		return e.Err.Error()
	}
	return string(e.Kind)
}

func (e *Error) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

type Client struct {
	baseURL string
	apiKey  string
	client  *http.Client
}

type graphQLRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables,omitempty"`
}

type graphQLErrorPayload struct {
	Message    string `json:"message"`
	Extensions struct {
		Code string `json:"code"`
	} `json:"extensions"`
}

type graphQLResponse struct {
	Data struct {
		TransactionsCollection struct {
			Edges []struct {
				Node transactions.Transaction `json:"node"`
			} `json:"edges"`
		} `json:"transactionsCollection"`
		InsertIntoTransactionsCollection struct {
			Records []transactions.Transaction `json:"records"`
		} `json:"insertIntoTransactionsCollection"`
		UpdateTransactionsCollection struct {
			AffectedCount int                        `json:"affectedCount"`
			Records       []transactions.Transaction `json:"records"`
		} `json:"updateTransactionsCollection"`
		DeleteFromTransactionsCollection struct {
			AffectedCount int `json:"affectedCount"`
		} `json:"deleteFromTransactionsCollection"`
	} `json:"data"`
	Errors []graphQLErrorPayload `json:"errors"`
}

func NewClient(baseURL, apiKey string, client *http.Client) *Client {
	if client == nil {
		client = http.DefaultClient
	}
	return &Client{
		baseURL: strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:  strings.TrimSpace(apiKey),
		client:  client,
	}
}

func (c *Client) List(ctx context.Context, userJWT string, action string) ([]transactions.Transaction, error) {
	variables := map[string]any{}
	if trimmed := strings.TrimSpace(action); trimmed != "" {
		variables["filter"] = map[string]any{
			"action": map[string]any{"eq": trimmed},
		}
	}

	var response graphQLResponse
	if err := c.do(ctx, userJWT, graphQLRequest{
		Query:     listTransactionsQuery,
		Variables: variables,
	}, &response); err != nil {
		return nil, err
	}

	records := make([]transactions.Transaction, 0, len(response.Data.TransactionsCollection.Edges))
	for _, edge := range response.Data.TransactionsCollection.Edges {
		records = append(records, edge.Node)
	}
	return records, nil
}

func (c *Client) Create(ctx context.Context, userJWT string, input transactions.StoredTransaction) (transactions.Transaction, error) {
	var response graphQLResponse
	if err := c.do(ctx, userJWT, graphQLRequest{
		Query: createTransactionMutation,
		Variables: map[string]any{
			"input": []any{storedTransactionVariables(input)},
		},
	}, &response); err != nil {
		return transactions.Transaction{}, err
	}

	if len(response.Data.InsertIntoTransactionsCollection.Records) == 0 {
		return transactions.Transaction{}, &Error{Kind: ErrorKindUnexpected, Message: "graphql create returned no records"}
	}

	return response.Data.InsertIntoTransactionsCollection.Records[0], nil
}

func (c *Client) Update(ctx context.Context, userJWT string, id string, input transactions.StoredTransaction) (transactions.Transaction, error) {
	var response graphQLResponse
	if err := c.do(ctx, userJWT, graphQLRequest{
		Query: updateTransactionMutation,
		Variables: map[string]any{
			"filter": map[string]any{
				"id": map[string]any{"eq": strings.TrimSpace(id)},
			},
			"set": storedTransactionVariables(input),
		},
	}, &response); err != nil {
		return transactions.Transaction{}, err
	}

	if response.Data.UpdateTransactionsCollection.AffectedCount == 0 || len(response.Data.UpdateTransactionsCollection.Records) == 0 {
		return transactions.Transaction{}, &Error{Kind: ErrorKindNotFound, Message: "transaction not found"}
	}

	return response.Data.UpdateTransactionsCollection.Records[0], nil
}

func (c *Client) Delete(ctx context.Context, userJWT string, id string) error {
	var response graphQLResponse
	if err := c.do(ctx, userJWT, graphQLRequest{
		Query: deleteTransactionMutation,
		Variables: map[string]any{
			"filter": map[string]any{
				"id": map[string]any{"eq": strings.TrimSpace(id)},
			},
		},
	}, &response); err != nil {
		return err
	}

	if response.Data.DeleteFromTransactionsCollection.AffectedCount == 0 {
		return &Error{Kind: ErrorKindNotFound, Message: "transaction not found"}
	}
	return nil
}

func (c *Client) do(ctx context.Context, userJWT string, payload graphQLRequest, out *graphQLResponse) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal graphql request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/graphql/v1", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("build graphql request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(userJWT))

	res, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("execute graphql request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusUnauthorized || res.StatusCode == http.StatusForbidden {
		return &Error{Kind: ErrorKindUnauthorized, Message: "graphql unauthorized"}
	}
	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusMultipleChoices {
		return &Error{
			Kind:    ErrorKindUnexpected,
			Message: fmt.Sprintf("graphql unexpected status %d", res.StatusCode),
		}
	}

	decoder := json.NewDecoder(res.Body)
	if err := decoder.Decode(out); err != nil {
		return fmt.Errorf("decode graphql response: %w", err)
	}
	if len(out.Errors) > 0 {
		return mapGraphQLError(out.Errors)
	}
	return nil
}

func storedTransactionVariables(input transactions.StoredTransaction) map[string]any {
	return map[string]any{
		"user_id":              input.UserID,
		"action":               input.Action,
		"card_type":            input.CardType,
		"custom_card_type":     input.CustomCardType,
		"price":                input.Price,
		"currency":             input.Currency,
		"price_thb":            input.PriceTHB,
		"exchange_rate_to_thb": input.ExchangeRateToTHB,
		"exchange_rate_date":   input.ExchangeRateDate,
		"transaction_date":     input.TransactionDate,
	}
}

func mapGraphQLError(errorsPayload []graphQLErrorPayload) error {
	if len(errorsPayload) == 0 {
		return nil
	}

	first := errorsPayload[0]
	kind := ErrorKindUnexpected
	switch first.Extensions.Code {
	case "23505":
		kind = ErrorKindConflict
	case "PGRST301":
		kind = ErrorKindUnauthorized
	}

	message := strings.TrimSpace(first.Message)
	if message == "" {
		message = "graphql request failed"
	}

	return &Error{
		Kind:    kind,
		Message: message,
		Err:     errors.New(message),
	}
}
