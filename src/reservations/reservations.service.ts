import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Not, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { ReservationEntity } from './reservation.entity';
import type {
  Reservation,
  ReservationInput,
  ReservationStatus,
  SessionFormat,
} from './reservation.types';

const ACTIVE_STATUSES: ReservationStatus[] = ['pending', 'approved'];

function sessionName(format: SessionFormat) {
  return format === 'dinner'
    ? 'Exclusive Dinner Session'
    : 'Private Executive Lunch';
}

function prettyDate(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  if (!year || !month || !day) return key;
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(ReservationEntity)
    private readonly repo: Repository<ReservationEntity>,
    private readonly mail: MailService,
  ) {}

  async list() {
    const rows = await this.repo.find({
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toReservation(row));
  }

  async availability() {
    const rows = await this.repo.find({
      where: { status: In(ACTIVE_STATUSES) },
      select: ['id', 'sessionFormat', 'firstChoiceDate', 'secondChoiceDate'],
    });
    const lunch = new Set<string>();
    const dinner = new Set<string>();
    for (const row of rows) {
      const taken = row.sessionFormat === 'dinner' ? dinner : lunch;
      if (row.firstChoiceDate) taken.add(row.firstChoiceDate);
      if (row.secondChoiceDate) taken.add(row.secondChoiceDate);
    }
    return {
      lunch: [...lunch],
      dinner: [...dinner],
    };
  }

  async create(input: ReservationInput, source: 'public' | 'admin') {
    const reservation = this.normalize(input, source);
    await this.assertSlotsAvailable(reservation.sessionFormat, [
      reservation.firstChoiceDate,
      reservation.secondChoiceDate,
    ]);
    const saved = await this.repo.save(
      this.repo.create({
        ...reservation,
        createdAt: new Date(reservation.createdAt),
      }),
    );
    const stored = this.toReservation(saved);
    await this.mail.notifyReservation(stored);
    return stored;
  }

  async updateStatus(id: string, status: ReservationStatus) {
    const allowed: ReservationStatus[] = ['pending', 'approved', 'declined'];
    if (!allowed.includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Reservation not found');
    if (ACTIVE_STATUSES.includes(status)) {
      await this.assertSlotsAvailable(
        row.sessionFormat,
        [row.firstChoiceDate, row.secondChoiceDate],
        row.id,
      );
    }
    row.status = status;
    return this.toReservation(await this.repo.save(row));
  }

  private async assertSlotsAvailable(
    sessionFormat: SessionFormat,
    dates: string[],
    ignoreId?: string,
  ) {
    const taken = await this.takenDates(sessionFormat, ignoreId);
    const blocked = [...new Set(dates.filter((date) => taken.has(date)))];
    if (!blocked.length) return;

    const current = sessionName(sessionFormat);
    const other = sessionName(sessionFormat === 'lunch' ? 'dinner' : 'lunch');
    const when = blocked.map(prettyDate).join(' and ');
    throw new ConflictException(
      `This ${current} slot is not available on ${when}. Please choose another date or try the ${other}.`,
    );
  }

  private async takenDates(sessionFormat: SessionFormat, ignoreId?: string) {
    const rows = await this.repo.find({
      where: {
        sessionFormat,
        status: In(ACTIVE_STATUSES),
        ...(ignoreId ? { id: Not(ignoreId) } : {}),
      },
      select: ['firstChoiceDate', 'secondChoiceDate'],
    });
    const dates = new Set<string>();
    for (const row of rows) {
      if (row.firstChoiceDate) dates.add(row.firstChoiceDate);
      if (row.secondChoiceDate) dates.add(row.secondChoiceDate);
    }
    return dates;
  }

  private toReservation(row: ReservationEntity): Reservation {
    return {
      id: row.id,
      source: row.source,
      sessionFormat: row.sessionFormat,
      venue: row.venue,
      firstChoiceDate: row.firstChoiceDate,
      secondChoiceDate: row.secondChoiceDate,
      dietary: row.dietary,
      fullName: row.fullName,
      email: row.email,
      mobile: row.mobile,
      assistantContact: row.assistantContact,
      status: row.status,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    };
  }

  private normalize(
    input: ReservationInput,
    source: 'public' | 'admin',
  ): Reservation {
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
}
