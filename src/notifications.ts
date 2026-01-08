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
