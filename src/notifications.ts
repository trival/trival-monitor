import { WorkerMailer } from 'worker-mailer'
import type { SMTPConfig } from './types'

export interface NotificationHandler {
  sendDownNotification(
    serviceName: string,
    consecutiveFailures: number,
    lastError: string | null,
  ): Promise<void>
  sendUpNotification(serviceName: string, downtimeChecks: number): Promise<void>
}

export function createConsoleNotificationHandler(): NotificationHandler {
  return {
    async sendDownNotification(
      serviceName: string,
      consecutiveFailures: number,
      lastError: string | null,
    ): Promise<void> {
      console.log(
        `[NOTIFICATION] ${serviceName} is DOWN - ${consecutiveFailures} consecutive failures - Last error: ${lastError}`,
      )
    },
    async sendUpNotification(
      serviceName: string,
      downtimeChecks: number,
    ): Promise<void> {
      console.log(
        `[NOTIFICATION] ${serviceName} is UP - Was down for ${downtimeChecks} checks`,
      )
    },
  }
}

/**
 * Format DOWN notification message (plain text)
 */
function formatDownMessage(
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
function formatUpMessage(serviceName: string, downtimeChecks: number): string {
  return `Service: ${serviceName}

Status: UP

The service has recovered after ${downtimeChecks} failed health checks.

Service is now operational.`
}

/**
 * Convert plain text message to HTML with basic styling
 */
function convertToHtml(plainText: string): string {
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
 * Send email via SMTP using worker-mailer
 */
async function sendEmail(
  config: SMTPConfig,
  subject: string,
  plainText: string,
  html: string,
): Promise<void> {
  await WorkerMailer.send(
    {
      host: config.host,
      port: config.port,
      credentials: {
        username: config.user,
        password: config.pass,
      },
      authType: 'plain',
      secure: config.port === 465, // Use TLS for port 465
    },
    {
      from: {
        name: 'Trival Monitor',
        email: config.fromEmail,
      },
      to: config.notificationEmail,
      subject,
      text: plainText,
      html,
    },
  )
}

/**
 * Create SMTP notification handler using worker-mailer
 */
export function createSMTPNotificationHandler(
  config: SMTPConfig,
): NotificationHandler {
  return {
    async sendDownNotification(
      serviceName: string,
      consecutiveFailures: number,
      lastError: string | null,
    ): Promise<void> {
      const plainText = formatDownMessage(
        serviceName,
        consecutiveFailures,
        lastError,
      )
      const html = convertToHtml(plainText)

      try {
        await sendEmail(
          config,
          `[DOWN] ${serviceName} is DOWN`,
          plainText,
          html,
        )
      } catch (error) {
        console.error('[SMTP] Failed to send DOWN notification:', error)
        throw error
      }
    },

    async sendUpNotification(
      serviceName: string,
      downtimeChecks: number,
    ): Promise<void> {
      const plainText = formatUpMessage(serviceName, downtimeChecks)
      const html = convertToHtml(plainText)

      try {
        await sendEmail(config, `[UP] ${serviceName} is UP`, plainText, html)
      } catch (error) {
        console.error('[SMTP] Failed to send UP notification:', error)
        throw error
      }
    },
  }
}
