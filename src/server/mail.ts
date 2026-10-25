import nodemailer from 'nodemailer';
import { env } from '@/lib/env';
export async function sendMail(to: string, subject: string, text: string) {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
  });
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}
