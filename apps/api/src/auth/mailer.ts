import nodemailer from 'nodemailer';

export type Email = { to: string; subject: string; text: string };

export interface Mailer {
  send(email: Email): Promise<void>;
}

type Logger = { info: (obj: unknown, msg?: string) => void };

export function makeLogMailer(logger: Logger): Mailer {
  return {
    send(email) {
      logger.info(
        { to: email.to, subject: email.subject },
        '[mailer:stub] email не отправлен (SMTP не настроен)',
      );
      return Promise.resolve();
    },
  };
}

/// Реальный SMTP-мейлер из env (SMTP_HOST/PORT/USER/PASS/FROM). Если SMTP_HOST не
/// задан — тихо откатывается на лог-заглушку (dev/тесты работают без почты).
export function makeMailer(logger: Logger): Mailer {
  const host = process.env.SMTP_HOST ?? '';
  if (!host) return makeLogMailer(logger);
  const port = Number(process.env.SMTP_PORT ?? '587') || 587;
  const user = process.env.SMTP_USER ?? '';
  const pass = process.env.SMTP_PASS ?? '';
  const from = process.env.SMTP_FROM || 'FitBond <no-reply@fitbond.ru>';
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 — implicit TLS; 587 — STARTTLS
    ...(user ? { auth: { user, pass } } : {}),
  });
  return {
    async send(email) {
      await transport.sendMail({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
      });
    },
  };
}

/// Письмо с кодом сброса пароля.
export function sendResetPasswordEmail(mailer: Mailer, to: string, code: string): Promise<void> {
  return mailer.send({
    to,
    subject: 'FitBond: код для сброса пароля',
    text:
      `Ваш код для сброса пароля: ${code}\n\n` +
      'Код действует 15 минут. Если вы не запрашивали сброс пароля — просто проигнорируйте это письмо.',
  });
}
