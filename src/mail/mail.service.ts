import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Reservation } from '../reservations/reservation.types';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY');
    this.resend = key ? new Resend(key) : null;
  }

  async notifyReservation(reservation: Reservation) {
    if (!this.resend) {
      this.logger.warn('RESEND_API_KEY is not set; skipping email.');
      return;
    }

    const from =
      this.config.get<string>('RESEND_FROM') ||
      'MuMMpires Concierge <beth.t@example.com>';
    const adminTo = this.config.get<string>('ADMIN_EMAIL');

    if (reservation.email) {
      try {
        const { error } = await this.resend.emails.send({
          from,
          to: reservation.email,
          subject: 'Your MuMMpires reservation request has been received',
          html: this.guestHtml(reservation),
        });
        if (error) this.logger.error(error.message || error);
      } catch (error) {
        this.logger.error('Failed to send guest confirmation', error as Error);
      }
    } else {
      this.logger.log('No guest email provided; skipping confirmation email.');
    }

    if (adminTo && reservation.source !== 'admin') {
      try {
        const { error } = await this.resend.emails.send({
          from,
          to: adminTo,
          subject: `New RSVP — ${reservation.fullName}`,
          html: this.adminHtml(reservation),
        });
        if (error) this.logger.error(error.message || error);
      } catch (error) {
        this.logger.error('Failed to send admin notification', error as Error);
      }
    }
  }

  private guestHtml(r: Reservation) {
    return this.wrap(`
      <p style="margin:0 0 16px;">Dear ${this.esc(r.fullName || 'Guest')},</p>
      <p style="margin:0 0 16px;">Thank you. Your reservation request at <strong>${this.esc(this.venueLabel(r.venue))}</strong> for <strong>${this.esc(this.sessionLabel(r.sessionFormat))}</strong> has been received. Our concierge will contact you within 2 hours.</p>
      ${this.detailsTable(r)}
      <p style="margin:24px 0 0;font-size:13px;color:#c5c5c5;">All times are subject to availability. This invitation is confidential and by invitation only.</p>
    `);
  }

  private adminHtml(r: Reservation) {
    return this.wrap(`
      <p style="margin:0 0 16px;">A new ${r.source === 'admin' ? 'manual' : 'guest'} reservation has been submitted.</p>
      ${this.detailsTable(r)}
    `);
  }

  private detailsTable(r: Reservation) {
    const rows: [string, string][] = [
      ['Session', this.sessionLabel(r.sessionFormat)],
      ['Venue', this.venueLabel(r.venue)],
      ['1st choice', r.firstChoiceDate],
      ['2nd choice', r.secondChoiceDate || '—'],
      ['Time slot', r.slotTime ? this.timeLabel(r.slotTime) : '—'],
      ['Dietary', r.dietary || '—'],
      ['Name', r.fullName],
      ['Email', r.email],
      ['Mobile', r.mobile],
      ['Assistant', r.assistantContact || '—'],
    ];
    return `
      <table style="width:100%;border-collapse:collapse;margin-top:8px;">
        ${rows
          .map(
            ([label, value]) => `
          <tr>
            <td style="padding:8px 0;color:#d4af37;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;width:38%;">${label}</td>
            <td style="padding:8px 0;color:#e0e0e0;font-size:14px;">${this.esc(value)}</td>
          </tr>`,
          )
          .join('')}
      </table>
    `;
  }

  private wrap(inner: string) {
    return `
      <div style="background:#0b0c10;padding:32px 16px;font-family:Georgia,serif;">
        <div style="max-width:560px;margin:0 auto;border:1px solid #d4af37;padding:28px;">
          <p style="margin:0 0 8px;color:#d4af37;letter-spacing:0.22em;text-transform:uppercase;font-size:12px;">MuMMpires</p>
          <h1 style="margin:0 0 20px;color:#d4af37;font-size:20px;letter-spacing:0.08em;">Private Invitation</h1>
          <div style="color:#e0e0e0;font-family:Arial,sans-serif;line-height:1.6;">${inner}</div>
        </div>
      </div>
    `;
  }

  private sessionLabel(value: string) {
    return value === 'dinner'
      ? 'Exclusive Dinner Session (7:00 PM - 9:00 PM)'
      : 'Private Executive Lunch (12:30 PM - 2:00 PM)';
  }

  private timeLabel(value: string) {
    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
    const suffix = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
  }

  private venueLabel(value: string) {
    if (value === 'starbucks') return 'Starbucks, Alpharetta, Georgia';
    if (value === 'briefing-suite') return 'Executive Briefing Suite / On-Site';
    return "Rumi's Kitchen — Avalon";
  }

  private esc(value: string) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
