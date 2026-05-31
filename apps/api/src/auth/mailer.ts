export type Email = { to: string; subject: string; text: string };

export interface Mailer {
  send(email: Email): Promise<void>;
}

type Logger = { info: (obj: unknown, msg?: string) => void };

export function makeLogMailer(logger: Logger): Mailer {
  return {
    send(email) {
      // Заглушка: реальный SMTP-провайдер подключается на этапе email-флоу.
      logger.info(
        { to: email.to, subject: email.subject },
        '[mailer:stub] email не отправлен (заглушка)',
      );
      return Promise.resolve();
    },
  };
}
