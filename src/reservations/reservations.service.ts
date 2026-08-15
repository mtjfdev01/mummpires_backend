import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MailService } from '../mail/mail.service';
import type {
  Reservation,
  ReservationInput,
  ReservationStatus,
} from './reservation.types';

@Injectable()
export class ReservationsService {
  private readonly filePath = join(process.cwd(), 'data', 'reservations.json');

  constructor(private readonly mail: MailService) {
    this.ensureStore();
  }

  list() {
    return this.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: ReservationInput, source: 'public' | 'admin') {
    const reservation = this.normalize(input, source);
    const all = this.read();
    all.push(reservation);
    this.write(all);
    await this.mail.notifyReservation(reservation);
    return reservation;
  }

  updateStatus(id: string, status: ReservationStatus) {
    const allowed: ReservationStatus[] = ['pending', 'approved', 'declined'];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    const all = this.read();
    const index = all.findIndex((item) => item.id === id);
    if (index < 0) throw new NotFoundException('Reservation not found');
    all[index] = { ...all[index], status };
    this.write(all);
    return all[index];
  }

  private normalize(input: ReservationInput, source: 'public' | 'admin'): Reservation {
    const fullName = String(input.fullName || '').trim();
    const email = String(input.email || '').trim();
    const mobile = String(input.mobile || '').trim();
    const firstChoiceDate = String(input.firstChoiceDate || '').trim();
    const secondChoiceDate = String(input.secondChoiceDate || '').trim();

    if (!fullName || !email || !mobile || !firstChoiceDate || !secondChoiceDate) {
      throw new BadRequestException(
        'Full name, email, mobile, and both date choices are required.',
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Please enter a valid email address.');
    }
    if (!['lunch', 'dinner'].includes(input.sessionFormat)) {
      throw new BadRequestException('Please select a session format.');
    }
    if (!['private-dining', 'briefing-suite'].includes(input.venue)) {
      throw new BadRequestException('Please select a venue.');
    }

    return {
      id: randomUUID(),
      source,
      sessionFormat: input.sessionFormat,
      venue: input.venue,
      firstChoiceDate,
      secondChoiceDate,
      dietary: String(input.dietary || '').trim(),
      fullName,
      email,
      mobile,
      assistantContact: String(input.assistantContact || '').trim(),
      status: input.status || 'pending',
      createdAt: new Date().toISOString(),
    };
  }

  private ensureStore() {
    const dir = join(process.cwd(), 'data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(this.filePath)) this.write([]);
  }

  private read(): Reservation[] {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf8')) as Reservation[];
    } catch {
      return [];
    }
  }

  private write(items: Reservation[]) {
    writeFileSync(this.filePath, JSON.stringify(items, null, 2));
  }
}
