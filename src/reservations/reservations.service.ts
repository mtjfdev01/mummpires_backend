import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { ReservationEntity } from './reservation.entity';
import type {
  Reservation,
  ReservationInput,
  ReservationStatus,
} from './reservation.types';

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

  async create(input: ReservationInput, source: 'public' | 'admin') {
    const reservation = this.normalize(input, source);
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
    row.status = status;
    return this.toReservation(await this.repo.save(row));
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
