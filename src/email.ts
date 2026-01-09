import { WorkerMailer } from 'worker-mailer'
import { SMTPConfig } from './types'

export interface EmailService {
  send(subject: string, text: string, html?: string): Promise<void>
}

export function createEmailService(config: SMTPConfig): EmailService {
  return {
    async send(subject, plainText, html) {
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
    },
  }
}
