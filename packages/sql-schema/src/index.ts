import { Kind, parse, TypeNode, visit } from 'graphql'
export const DERIVED_FROM_DIRECTIVE = 'directive @derivedFrom(field: String!) on FIELD_DEFINITION'

const getDataType = (type: string) => {
  // Mapping GraphQL String to SQLite "TEXT"
  if (type === 'String') {
    return 'TEXT'
  }
  // Mapping GraphQL Boolean to SQLite "INTEGER" since it doesn't have built in boolean type
  // Mapping GraphQL Int to SQLite "INTEGER"
  if (type === 'Int' || type === 'Boolean') {
    return 'INTEGER'
  }
  // Return non-primitive types as is and they will be mapped to SQLite "TEXT" for relations
  return type
}

// Ensure that it one of the types we mapped to SQLite
const isMappedSQLType = (type: string) => {
  switch (type) {
    case 'TEXT':
    case 'INTEGER':
      return true
    default:
      return false
  }
}

type ColumnsAST = {
  name: string
  type: string
  constraint: string
  relationTable: string | null
  relation: string | null
}

const createTable = (name: string) => `CREATE TABLE IF NOT EXISTS ${name}`

/**
 * ```graphql
 * type User {
 *  name: String!
 * }
 * ```
 *
 * This is represented as `{kind: NonNullType, type:{ kind: NamedType, name: { kind: 'Name', value: 'String' } } }`
 * We need to extract the name of the type
 *
 * ```graphql
 * type User {
 *   name: String
 * }
 * ```
 *
 * This is represented as `{kind: NamedType, name: { kind: 'Name', value: 'String' } }`
 * We need to extract the name of the type
 *
 */
const extractNameNode = (node: TypeNode) => {
  return node.kind === Kind.NON_NULL_TYPE
    ? node.type.kind === Kind.NAMED_TYPE
      ? node.type
      : null
    : node.kind === Kind.NAMED_TYPE
    ? node
    : null
}

/**
 * @returns SQL Schema that follows https://github.com/bradleyboy/tuql format allowing you get a CRUD GraphQL API
 */
export const generateSQLSchema = async ({ source }: { source: string }) => {
  let sqlSchema: Array<{ tableName: string; columns: Array<ColumnsAST> | undefined }> = []

  visit(parse(source), {
    ObjectTypeDefinition(node) {
      const tableName = node.name.value.endsWith('s') ? node.name.value : `${node.name.value}s`

      const columns = node.fields
        // `id` field is added by default
        ?.filter(({ name }) => name.value.toLowerCase() !== 'id')
        .map(({ name, type, directives }) => {
          const relation =
            directives &&
            directives.map((directive) => {
              if (directive.name.kind === Kind.NAME) {
                const arg = directive?.arguments?.find(({ name }) => name.value === 'field')
                if (arg?.value.kind === Kind.STRING) {
                  return arg?.value.value
                }
              }
              return null
            })

          const namedNode = extractNameNode(type)
          // Extract from a NonNull List - this is for many-to-many relations
          const listType = namedNode
            ? null
            : type.kind === Kind.NON_NULL_TYPE
            ? type.type.kind === Kind.LIST_TYPE
              ? type.type.type
              : null
            : null
          const listNode = listType ? extractNameNode(listType) : null

          const namedType = namedNode?.name
            ? getDataType(namedNode.name.value)
            : listNode
            ? getDataType(listNode.name.value)
            : null
          const isMapped = namedType && isMappedSQLType(namedType)
          const relationTable = !isMapped ? `${namedType}s` : null

          return {
            name: name.value,
            type: isMapped ? namedType : 'INTEGER', // relations are always text
            constraint: type.kind === Kind.NON_NULL_TYPE ? 'NOT NULL' : 'NULL',
            relationTable,
            relation: relation && relation.length > 0 ? relation[0] : null,
          }
        })

      sqlSchema.push({ tableName, columns })
    },
  })

  const schema = sqlSchema.map(({ tableName, columns }) => {
    const isLast = (index: number) => columns && index === columns.length - 1

    const cols = columns?.map(({ name, type, constraint, relationTable }, i) => {
      const column = `${name} ${type} ${constraint}`
      const foreignKey = relationTable ? `,\nFOREIGN KEY (${name}) REFERENCES "${relationTable}"(id)` : ''
      return [column, foreignKey].join(isLast(i) ? '' : ',')
    })

    const str = `${createTable(`"${tableName}"`)} (
id INTEGER PRIMARY KEY AUTOINCREMENT,
${cols?.join('\n')}
);`
    return str
  })

  return schema.join('\n')
}
