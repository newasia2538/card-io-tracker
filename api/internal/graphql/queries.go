package graphql

const transactionFields = `
id
user_id
action
card_type
custom_card_type
price
currency
price_thb
exchange_rate_to_thb
exchange_rate_date
transaction_date
created_at
updated_at
`

const listTransactionsQuery = `
query ListTransactions($filter: TransactionsFilter) {
  transactionsCollection(
    filter: $filter
    orderBy: [{transaction_date: DescNullsLast}, {created_at: DescNullsLast}]
  ) {
    edges {
      node {
        ` + transactionFields + `
      }
    }
  }
}
`

const createTransactionMutation = `
mutation CreateTransaction($input: [TransactionsInsertInput!]!) {
	insertIntotransactionsCollection(objects: $input) {
    records {
      ` + transactionFields + `
    }
  }
}
`

const updateTransactionMutation = `
mutation UpdateTransaction($filter: TransactionsFilter!, $set: TransactionsUpdateInput!) {
	updatetransactionsCollection(filter: $filter, set: $set, atMost: 1) {
    affectedCount
    records {
      ` + transactionFields + `
    }
  }
}
`

const deleteTransactionMutation = `
mutation DeleteTransaction($filter: TransactionsFilter!) {
	deleteFromtransactionsCollection(filter: $filter, atMost: 1) {
    affectedCount
  }
}
`
