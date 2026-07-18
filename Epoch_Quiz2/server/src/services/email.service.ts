/**
 * Email delivery service.
 *
 * Requires SMTP_HOST, SMTP_USER, SMTP_PASS in the environment.
 * When those are absent the service logs the email to console in development
 * and silently skips sending in production (the token is already unavailable
 * from the API in production, so the reset flow simply won't work without a
 * real SMTP configuration).
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { env, isDev, isProd } from '../config';
import { logger } from '../utils/logger';
import { SettingsService } from './settings.service';

async function getPlatformName(): Promise<string> {
  return (await SettingsService.get('general.platformName')) ?? 'Epoch Quiz';
}

// ── Transport ────────────────────────────────────────────────────────────────

function createTransport(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    if (isProd) logger.warn('[email] SMTP not configured — password reset emails will NOT be sent.');
    return null;
  }
  return nodemailer.createTransport({
    host:   env.SMTP_HOST,
    port:   env.SMTP_PORT,
    secure: env.SMTP_SECURE === 'true',
    auth:   { user: env.SMTP_USER, pass: env.SMTP_PASS },
    pool:   true,
    maxConnections: 5,
  });
}

let _transport: Transporter | null = null;
function getTransport(): Transporter | null {
  if (!_transport) _transport = createTransport();
  return _transport;
}

// ── HTML template helpers ─────────────────────────────────────────────────────

function baseTemplate(title: string, body: string, platformName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin:0; padding:0; background:#07031A; font-family:'Segoe UI',Arial,sans-serif; color:#F5F0FF; }
    .wrap { max-width:600px; margin:40px auto; background:#100b24; border:1px solid rgba(180,140,255,0.12); border-radius:16px; overflow:hidden; }
    .header { background:linear-gradient(135deg,rgba(212,20,138,0.25),rgba(123,82,212,0.15)); padding:40px 40px 28px; text-align:center; }
    .logo { font-size:22px; font-weight:700; color:#F5F0FF; letter-spacing:-0.02em; }
    .logo em { color:#D4148A; font-style:italic; }
    .body { padding:32px 40px; }
    h1 { margin:0 0 12px; font-size:22px; font-weight:700; color:#F5F0FF; }
    p  { margin:0 0 16px; font-size:15px; line-height:1.6; color:#B8AEDA; }
    .btn { display:inline-block; padding:14px 32px; background:#D4148A; color:#ffffff; text-decoration:none; border-radius:10px; font-weight:600; font-size:15px; margin:8px 0 24px; }
    .btn:hover { background:#B8007A; }
    .note { font-size:13px; color:#7C72A0; }
    .divider { border:none; border-top:1px solid rgba(180,140,255,0.10); margin:24px 0; }
    .footer { padding:20px 40px; text-align:center; font-size:12px; color:#4A4468; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="logo">Olympaid <em>Quiz</em></div>
    </div>
    <div class="body">${body}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${escapeHtml(platformName)}. All rights reserved.<br/>
      This email was sent automatically — please do not reply.
    </div>
  </div>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SendResult { ok: boolean; error?: string }

/** Escape user-supplied text before embedding it in the HTML email body. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const EmailService = {
  /**
   * Deliver a "Contact us" message to the configured CONTACT_TO address.
   * Unlike the reset/welcome mails this is NOT fail-silent: if SMTP is not
   * configured or the send fails, it returns { ok:false } so the API can report
   * a real error to the user (no fake success).
   */
  async sendContactMessage(input: { name: string; email: string; subject: string; message: string }): Promise<SendResult> {
    const transport = getTransport();
    if (!transport) {
      logger.error('[email] Contact message not sent — SMTP is not configured.');
      return { ok: false, error: 'Email service is not configured. Please try again later.' };
    }

    const to = env.CONTACT_TO;
    const html = baseTemplate(
      `New contact message: ${escapeHtml(input.subject)}`,
      `<h1>New contact message</h1>
       <p><strong>Name:</strong> ${escapeHtml(input.name)}</p>
       <p><strong>Email:</strong> ${escapeHtml(input.email)}</p>
       <p><strong>Subject:</strong> ${escapeHtml(input.subject)}</p>
       <hr class="divider" />
       <p style="white-space:pre-wrap">${escapeHtml(input.message)}</p>`,
      await getPlatformName(),
    );

    try {
      await transport.sendMail({
        from:    env.EMAIL_FROM,
        to,
        replyTo: input.email,
        subject: `[Contact] ${input.subject}`,
        html,
        text:    `New contact message\n\nName: ${input.name}\nEmail: ${input.email}\nSubject: ${input.subject}\n\n${input.message}`,
      });
      logger.info(`[email] Contact message from ${input.email} delivered to ${to}`);
      return { ok: true };
    } catch (err: any) {
      logger.error(`[email] Failed to send contact message: ${err.message}`);
      return { ok: false, error: 'Could not send your message. Please try again later.' };
    }
  },

  /**
   * Send password-reset email.
   * Returns { ok: true } whether or not SMTP is configured (fail-silent so
   * that the caller can still return a user-facing "email sent" message).
   */
  async sendPasswordReset(to: string, token: string, name: string): Promise<SendResult> {
    const resetUrl = `${env.APP_URL}/#/reset-password/${token}`;

    if (isDev && !getTransport()) {
      logger.info(`[email:dev] Password reset URL for ${to}: ${resetUrl}`);
      return { ok: true };
    }

    const transport = getTransport();
    if (!transport) return { ok: true }; // silently skip in production when not configured

    const platformName = await getPlatformName();
    const html = baseTemplate(
      `Reset your ${platformName} password`,
      `<h1>Reset your password</h1>
       <p>Hi ${name},</p>
       <p>We received a request to reset the password for your ${escapeHtml(platformName)} account. Click the button below to choose a new password.</p>
       <a href="${resetUrl}" class="btn">Reset password</a>
       <hr class="divider" />
       <p class="note">This link expires in <strong>1 hour</strong>. If you did not request a password reset, you can safely ignore this email — your password will not be changed.</p>
       <p class="note">If the button doesn't work, copy and paste this URL into your browser:<br/><br/>${resetUrl}</p>`,
      platformName,
    );

    try {
      await transport.sendMail({
        from:    env.EMAIL_FROM,
        to,
        subject: `Reset your ${platformName} password`,
        html,
        text:    `Reset your ${platformName} password\n\nHi ${name},\n\nClick the link below to reset your password (expires in 1 hour):\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
      });
      logger.info(`[email] Password reset sent to ${to}`);
      return { ok: true };
    } catch (err: any) {
      logger.error(`[email] Failed to send password reset to ${to}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  },

  async sendWelcome(to: string, name: string): Promise<SendResult> {
    const transport = getTransport();
    if (!transport) {
      if (isDev) logger.info(`[email:dev] Welcome email for ${to}`);
      return { ok: true };
    }

    const platformName = await getPlatformName();
    const html = baseTemplate(
      `Welcome to ${platformName}`,
      `<h1>Welcome aboard, ${name}!</h1>
       <p>Your ${escapeHtml(platformName)} account is ready. You can now log in, explore assessments, and start your learning journey.</p>
       <a href="${env.APP_URL}/#/login" class="btn">Go to dashboard</a>
       <p class="note">If you have any questions, just reply to this email — we're always happy to help.</p>`,
      platformName,
    );

    try {
      await transport.sendMail({
        from: env.EMAIL_FROM, to,
        subject: `Welcome to ${platformName}!`,
        html,
        text: `Welcome to ${platformName}, ${name}!\n\nYour account is ready. Log in at: ${env.APP_URL}/#/login`,
      });
      return { ok: true };
    } catch (err: any) {
      logger.error(`[email] Failed to send welcome to ${to}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  },
};
