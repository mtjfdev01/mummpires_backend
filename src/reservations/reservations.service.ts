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
import {
  ALL_SLOT_TIMES,
  DINNER_SLOT_TIMES,
  LUNCH_SLOT_TIMES,
} from './reservation.types';

const ACTIVE_STATUSES: ReservationStatus[] = ['pending', 'approved'];
const SLOT_VENUES = new Set<string>(['starbucks']);
const ALLOWED_VENUES = ['private-dining', 'briefing-suite', 'starbucks'];

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

function prettyTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return value;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

function sessionSlots(format: SessionFormat) {
  return format === 'dinner' ? [...DINNER_SLOT_TIMES] : [...LUNCH_SLOT_TIMES];
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
      select: {
        id: true,
        venue: true,
        sessionFormat: true,
        firstChoiceDate: true,
        secondChoiceDate: true,
        slotTime: true,
      },
    });
    const rumiLunch = new Set<string>();
    const rumiDinner = new Set<string>();
    const slots: Record<string, string[]> = {};

    for (const row of rows) {
      const dates = [row.firstChoiceDate, row.secondChoiceDate].filter(Boolean);
      if (SLOT_VENUES.has(row.venue)) {
        const times = row.slotTime
          ? [row.slotTime]
          : sessionSlots(row.sessionFormat);
        for (const date of dates) {
          if (!slots[date]) slots[date] = [];
          for (const time of times) {
            if (!slots[date].includes(time)) slots[date].push(time);
          }
        }
        continue;
      }

      const takenDates = row.sessionFormat === 'dinner' ? rumiDinner : rumiLunch;
      for (const date of dates) takenDates.add(date);
    }

    const rumi = {
      lunch: [...rumiLunch],
      dinner: [...rumiDinner],
    };

    return {
      lunch: rumi.lunch,
      dinner: rumi.dinner,
      slots,
      rumi,
      starbucks: { slots },
    };
  }

  async create(input: ReservationInput, source: 'public' | 'admin') {
    const reservation = this.normalize(input, source);
    await this.assertAvailable(reservation);
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
      await this.assertAvailable(this.toReservation(row), row.id);
    }
    row.status = status;
    return this.toReservation(await this.repo.save(row));
  }

  private async assertAvailable(reservation: Reservation, ignoreId?: string) {
    const dates = [reservation.firstChoiceDate, reservation.secondChoiceDate]
      .map((date) => String(date || '').trim())
      .filter(Boolean);

    if (SLOT_VENUES.has(reservation.venue)) {
      await this.assertTimeSlotAvailable(
        reservation.venue,
        reservation.sessionFormat,
        dates,
        reservation.slotTime,
        ignoreId,
      );
      return;
    }

    const taken = await this.takenDates(
      reservation.venue,
      reservation.sessionFormat,
      ignoreId,
    );
    const blocked = [...new Set(dates.filter((date) => taken.has(date)))];
    if (!blocked.length) return;

    const current = sessionName(reservation.sessionFormat);
    const other = sessionName(
      reservation.sessionFormat === 'lunch' ? 'dinner' : 'lunch',
    );
    const when = blocked.map(prettyDate).join(' and ');
    throw new ConflictException(
      `This ${current} slot is not available on ${when}. Please choose another date or try the ${other}.`,
    );
  }

  private async assertTimeSlotAvailable(
    venue: string,
    sessionFormat: SessionFormat,
    dates: string[],
    slotTime: string,
    ignoreId?: string,
  ) {
    const rows = await this.repo.find({
      where: {
        venue,
        status: In(ACTIVE_STATUSES),
        ...(ignoreId ? { id: Not(ignoreId) } : {}),
      },
      select: {
        firstChoiceDate: true,
        secondChoiceDate: true,
        slotTime: true,
      },
    });

    const blocked = dates.filter((date) =>
      rows.some((row) => {
        const onDate =
          row.firstChoiceDate === date || row.secondChoiceDate === date;
        if (!onDate) return false;
        if (!row.slotTime) return true;
        return row.slotTime === slotTime;
      }),
    );

    if (!blocked.length) return;

    const current = sessionName(sessionFormat);
    const when = blocked.map(prettyDate).join(' and ');
    throw new ConflictException(
      `The ${prettyTime(slotTime)} ${current} slot is not available on ${when}. Please choose another time.`,
    );
  }

  private async takenDates(
    venue: string,
    sessionFormat: SessionFormat,
    ignoreId?: string,
  ) {
    const rows = await this.repo.find({
      where: {
        sessionFormat,
        status: In(ACTIVE_STATUSES),
        ...(ignoreId ? { id: Not(ignoreId) } : {}),
      },
      select: {
        venue: true,
        firstChoiceDate: true,
        secondChoiceDate: true,
      },
    });
    const dates = new Set<string>();
    for (const row of rows) {
      if (SLOT_VENUES.has(row.venue)) continue;
      if (venue === 'starbucks') continue;
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
      slotTime: row.slotTime || '',
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
    const slotTime = String(input.slotTime || '').trim();
    const sessionFormat = (input.sessionFormat || 'lunch') as SessionFormat;
    const venue = input.venue || 'private-dining';

    const slotVenue = SLOT_VENUES.has(venue);

    if (source === 'public') {
      if (!fullName || !email || !mobile || !firstChoiceDate) {
        throw new BadRequestException(
          'Full name, email, mobile, and date are required.',
        );
      }
      if (slotVenue && !slotTime) {
        throw new BadRequestException(
          'Please pick a date and an available time slot.',
        );
      }
    } else if (!firstChoiceDate || (slotVenue && !slotTime)) {
      throw new BadRequestException(
        slotVenue
          ? 'Please pick a date and an available time slot.'
          : 'Please pick a date for this session.',
      );
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Please enter a valid email address.');
    }
    if (!['lunch', 'dinner'].includes(sessionFormat)) {
      throw new BadRequestException('Please select a session format.');
    }
    if (!ALLOWED_VENUES.includes(venue)) {
      throw new BadRequestException('Please select a venue.');
    }
    if (slotVenue && !(ALL_SLOT_TIMES as readonly string[]).includes(slotTime)) {
      throw new BadRequestException('Please select a valid time slot.');
    }

    return {
      id: randomUUID(),
      source,
      sessionFormat,
      venue,
      firstChoiceDate,
      secondChoiceDate,
      slotTime: slotVenue
        ? slotTime
        : sessionFormat === 'dinner'
          ? '19:00'
          : '12:30',
      dietary: String(input.dietary || '').trim(),
      fullName: fullName || (source === 'admin' ? 'Admin booking' : fullName),
      email,
      mobile,
      assistantContact: String(input.assistantContact || '').trim(),
      status: input.status || (source === 'admin' ? 'approved' : 'pending'),
      createdAt: new Date().toISOString(),
    };
  }
}
