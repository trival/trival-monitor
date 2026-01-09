import { EmailService } from './email'
import {
  convertToHtml,
  formatDownMessage,
  formatUpMessage,
} from './email-templates'

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
 * Create SMTP notification handler using worker-mailer
 */
export function createSMTPNotificationHandler(
  emailService: EmailService,
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
        await emailService.send(
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
        await emailService.send(`[UP] ${serviceName} is UP`, plainText, html)
      } catch (error) {
        console.error('[SMTP] Failed to send UP notification:', error)
        throw error
      }
    },
  }
}
