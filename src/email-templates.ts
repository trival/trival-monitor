import { Stats } from './types'

/**
 * Format DOWN notification message (plain text)
 */
export function formatDownMessage(
  serviceName: string,
  consecutiveFailures: number,
  lastError: string | null,
): string {
  return `Service: ${serviceName}

Status: DOWN

The service has failed ${consecutiveFailures} consecutive health checks.

Last Error: ${lastError || 'Unknown error'}

Please investigate immediately.`
}

/**
 * Format UP notification message (plain text)
 */
export function formatUpMessage(
  serviceName: string,
  downtimeChecks: number,
): string {
  return `Service: ${serviceName}

Status: UP

The service has recovered after ${downtimeChecks} failed health checks.

Service is now operational.`
}

/**
 * Format stats message (plain text)
 */
export function formatStatsMessage(
  serviceName: string,
  stats: Stats,
  timeRange: string,
): string {
  const lastCheckDate = stats.lastCheckTime ? stats.lastCheckTime : 'Never'

  let incidentsText = ''
  if (stats.incidents.length === 0) {
    incidentsText = 'No incidents in this period'
  } else {
    const incidentsToShow = stats.incidents.slice(0, 10)
    incidentsText = incidentsToShow
      .map((incident, index) => {
        const endText = incident.endTime || 'Ongoing'
        return `${index + 1}. Started: ${incident.startTime}
   Ended: ${endText}
   Duration: ${incident.durationMinutes} minutes
   Error: ${incident.errorMessage}`
      })
      .join('\n\n')

    if (stats.incidents.length > 10) {
      incidentsText += `\n\n... and ${stats.incidents.length - 10} more incidents`
    }
  }

  if (stats.totalChecks === 0) {
    return `Service: ${serviceName}

Time Range: ${timeRange}

No health checks found in this time period.

The monitoring system may not have been running during this time.`
  }

  return `Service: ${serviceName}

Time Range: ${timeRange}

=== Summary ===
Current Status: ${stats.currentStatus.toUpperCase()}
Last Check: ${lastCheckDate}

=== Statistics ===
Total Checks: ${stats.totalChecks}
Successful Checks: ${stats.successfulChecks}
Failed Checks: ${stats.failedChecks}
Uptime: ${stats.uptimePercentage}%
Average Response Time: ${stats.averageResponseTime}ms

=== Incidents ===
${incidentsText}`
}

/**
 * Convert plain text message to HTML with basic styling
 */
export function convertToHtml(plainText: string): string {
  const lines = plainText.split('\n\n')
  const htmlLines = lines.map((line) => {
    if (line.startsWith('Status: DOWN')) {
      return `<p style="color: #d32f2f; font-weight: bold; font-size: 18px;">${line}</p>`
    }
    if (line.startsWith('Status: UP')) {
      return `<p style="color: #388e3c; font-weight: bold; font-size: 18px;">${line}</p>`
    }
    return `<p style="margin: 10px 0;">${line.replace(/\n/g, '<br>')}</p>`
  })

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f5f5f5; border-left: 4px solid #2196f3; padding: 15px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 10px 0; color: #2196f3;">Service Health Alert</h2>
  </div>
  ${htmlLines.join('\n')}
  <hr style="margin-top: 30px; border: none; border-top: 1px solid #e0e0e0;">
  <p style="font-size: 12px; color: #666; margin-top: 15px;">
    This is an automated notification from Trival Monitor.
  </p>
</body>
</html>`
}

/**
 * Convert stats message to HTML with enhanced styling
 */
export function formatStatsHtml(plainText: string, stats: Stats): string {
  // Determine status color
  const statusColor = stats.currentStatus === 'up' ? '#388e3c' : '#d32f2f'

  // Determine uptime color
  let uptimeColor = '#d32f2f' // red for < 95%
  if (stats.uptimePercentage >= 99) {
    uptimeColor = '#388e3c' // green
  } else if (stats.uptimePercentage >= 95) {
    uptimeColor = '#ff9800' // orange
  }

  // Determine response time color
  let responseTimeColor = '#d32f2f' // red for > 2000ms
  if (stats.averageResponseTime < 500) {
    responseTimeColor = '#388e3c' // green
  } else if (stats.averageResponseTime <= 2000) {
    responseTimeColor = '#ff9800' // orange
  }

  const lines = plainText.split('\n\n')
  const htmlLines = lines.map((line) => {
    // Handle status line with color
    if (line.includes('Current Status:')) {
      const statusText = line.replace(
        /Current Status: (\w+)/,
        `Current Status: <span style="color: ${statusColor}; font-weight: bold;">$1</span>`,
      )
      return `<p style="margin: 10px 0;">${statusText.replace(/\n/g, '<br>')}</p>`
    }

    // Handle statistics section with color coding
    if (line.includes('Uptime:')) {
      const statsText = line
        .replace(
          /Uptime: ([\d.]+)%/,
          `Uptime: <span style="color: ${uptimeColor}; font-weight: bold;">$1%</span>`,
        )
        .replace(
          /Average Response Time: (\d+)ms/,
          `Average Response Time: <span style="color: ${responseTimeColor}; font-weight: bold;">$1ms</span>`,
        )
      return `<p style="margin: 10px 0;">${statsText.replace(/\n/g, '<br>')}</p>`
    }

    // Handle incidents with light red background for each incident
    if (line.match(/^\d+\. Started:/)) {
      const isOngoing = line.includes('Ended: Ongoing')
      const bgColor = isOngoing ? '#ffebee' : '#f5f5f5'
      const textColor = isOngoing ? '#d32f2f' : '#666'
      return `<div style="background-color: ${bgColor}; padding: 10px; margin: 10px 0; border-radius: 4px; color: ${textColor};">
        ${line.replace(/\n/g, '<br>')}
      </div>`
    }

    // Section headers
    if (line.startsWith('===')) {
      return `<h3 style="color: #2196f3; margin: 20px 0 10px 0; border-bottom: 2px solid #2196f3; padding-bottom: 5px;">${line.replace(/===/g, '').trim()}</h3>`
    }

    // Default paragraph
    return `<p style="margin: 10px 0;">${line.replace(/\n/g, '<br>')}</p>`
  })

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f5f5f5; border-left: 4px solid #2196f3; padding: 15px; margin-bottom: 20px;">
    <h2 style="margin: 0 0 10px 0; color: #2196f3;">Health Statistics Report</h2>
  </div>
  ${htmlLines.join('\n')}
  <hr style="margin-top: 30px; border: none; border-top: 1px solid #e0e0e0;">
  <p style="font-size: 12px; color: #666; margin-top: 15px;">
    This is an automated report from Trival Monitor.
  </p>
</body>
</html>`
}
