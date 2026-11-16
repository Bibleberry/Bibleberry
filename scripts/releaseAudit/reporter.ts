import type { AuditReport } from './types.ts'

export function formatAuditReportJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2)
}

export function formatAuditReportHuman(report: AuditReport): string {
  const lines: string[] = [
    `R18/R08A Monthly Publication Confidentiality Audit (${report.mode})`,
    `Status: ${report.ok ? 'PASS' : 'FAIL'} (${report.summary.passed}/${report.summary.total} checks passed, ${report.summary.failed} failed)`,
    `Executed At (UTC): ${report.executedAtUtc}`,
    '',
  ]

  for (const finding of report.findings) {
    lines.push(
      `[${finding.status}] ${finding.checkId} (${finding.contract}): ${finding.summary}`,
    )
    if (finding.status === 'FAIL' && finding.details && finding.details.length > 0) {
      for (const detail of finding.details) {
        lines.push(`  - ${detail}`)
      }
    }
  }

  return lines.join('\n')
}
