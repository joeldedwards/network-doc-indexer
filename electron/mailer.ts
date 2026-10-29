import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import nodemailer from 'nodemailer';
import type { SmtpEmailParams } from './types';
import { getFileById, getConfig } from './database';
import { computeUncPath, computeFileUrl } from './network-utils';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB safeguard

export function generateMailtoUrl(params: {
  recipients?: string[];
  subject: string;
  body: string;
}): string {
  const to = (params.recipients || []).join(',');
  const query = new URLSearchParams();
  if (params.subject) query.set('subject', params.subject);
  if (params.body) query.set('body', params.body);

  return `mailto:${to}?${query.toString()}`;
}

export async function sendEmailViaSmtp(params: SmtpEmailParams): Promise<{ success: boolean; message: string }> {
  const file = getFileById(params.documentId);
  if (!file) {
    throw new Error('Document not found.');
  }

  const config = getConfig();
  const rootPath = config?.rootPath || '';
  const uncPath = computeUncPath(rootPath, file.relativePath);
  const fileUrl = computeFileUrl(file.path);

  // Check SMTP configuration from params or environment
  const host = params.smtpConfig?.host || process.env.SMTP_HOST;
  const port = params.smtpConfig?.port || (process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587);
  const secure = params.smtpConfig?.secure ?? (process.env.SMTP_SECURE === 'true');
  const user = params.smtpConfig?.user || process.env.SMTP_USER;
  const pass = params.smtpConfig?.pass || process.env.SMTP_PASS;
  const from = params.smtpConfig?.from || process.env.SMTP_FROM || user;

  if (!host || !user || !pass || !from) {
    throw new Error(
      'SMTP credentials are not configured. Please enter your SMTP details or use your default native mail client.'
    );
  }

  // Create nodemailer transporter
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  const attachments: Array<{ filename: string; path: string }> = [];

  if (params.deliveryMode === 'attachment') {
    if (!existsSync(file.path)) {
      throw new Error('Document file is no longer accessible on the network drive.');
    }
    const stat = statSync(file.path);
    if (stat.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `File size (${(stat.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 25 MB email attachment limit. Choose "Internal Link" mode instead.`
      );
    }
    attachments.push({
      filename: file.name,
      path: file.path,
    });
  }

  const emailBody = `
${params.body ? `${params.body}\n\n` : ''}
---
Document Details:
- Name: ${file.name}
- Network Path (UNC): ${uncPath}
- File URL: ${fileUrl}
- Size: ${(file.sizeBytes / 1024).toFixed(1)} KB
- Last Modified: ${file.modifiedAt}
`.trim();

  await transporter.sendMail({
    from,
    to: params.recipients.join(', '),
    subject: params.subject || `Shared Document: ${file.name}`,
    text: emailBody,
    attachments,
  });

  return {
    success: true,
    message: `Document successfully emailed to ${params.recipients.join(', ')}.`,
  };
}
