import { runMonthlyPublicationAudit } from './auditor.ts'
import { formatAuditReportHuman, formatAuditReportJson } from './reporter.ts'

export type AuditOutputFormat = 'human' | 'json' | 'both'

export interface ParsedAuditCliArgs {
  readonly format: AuditOutputFormat
}

export function parseAuditCliArgs(argv: readonly string[]): ParsedAuditCliArgs {
  let format: AuditOutputFormat = 'both'
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--format') {
      const next = argv[i + 1]
      if (next !== 'human' && next !== 'json' && next !== 'both') {
        throw new Error(`Invalid --format value "${String(next)}". Expected human | json | both.`)
      }
      format = next
      i += 1
    } else if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length)
      if (value !== 'human' && value !== 'json' && value !== 'both') {
        throw new Error(`Invalid --format value "${value}". Expected human | json | both.`)
      }
      format = value
    } else {
      throw new Error(`Unknown CLI argument: ${arg}`)
    }
  }
  return { format }
}

async function main(): Promise<void> {
  let parsed: ParsedAuditCliArgs
  try {
    parsed = parseAuditCliArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  const report = await runMonthlyPublicationAudit()

  if (parsed.format === 'json') {
    console.log(formatAuditReportJson(report))
  } else if (parsed.format === 'human') {
    console.log(formatAuditReportHuman(report))
  } else {
    console.log(formatAuditReportHuman(report))
    console.log('\n--- MACHINE_READABLE_JSON ---')
    console.log(formatAuditReportJson(report))
  }

  if (!report.ok) {
    process.exitCode = 1
  }
}

const isDirectExecution =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('cli.ts')

if (isDirectExecution) {
  void main()
}
