# @saihaj/graphql-to-sqlite

## 0.0.1

### Patch Changes

- 998accd: exclude graphql built in object types
- fd0a4a2: handle unions, enums and use one transaction for write
- 51a9074: field name in quotes
- 8951e41: - Convert arbitrary GraphQL Scalars to TEXT type
  - Refactor SQL string generation so foreign keys are added at the end
