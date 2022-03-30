import { loadTypedefs } from '@graphql-tools/load'
import { GraphQLFileLoader } from '@graphql-tools/graphql-file-loader'
import { Command } from 'commander'
import { version } from '../package.json'
import { writeFileSync } from 'fs'
import { generateSQLSchema } from './index'

const program = new Command()

const main = async () => {
  program
    .name('graphql-to-sqlite')
    .description('CLI to generate SQLite Schema from GraphQL Schema')
    .version(version)
    .requiredOption('-s, --schema <schema>', 'Path to the schema file')
    .parse(process.argv)

  const schemaPath = program.opts().schema

  const sdl = await loadTypedefs(schemaPath, {
    loaders: [new GraphQLFileLoader()],
  })
  const sourceSDLString = sdl.map((s) => s.rawSDL).join('\n')
  const SQLSchema = await generateSQLSchema({ source: sourceSDLString })
  const fileName = schemaPath.replace(/^.*[\\/]/, '').replace(/\.graphql$/, '')
  writeFileSync(`${fileName}.sql`, SQLSchema)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
