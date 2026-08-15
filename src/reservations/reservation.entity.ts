import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type {
  ReservationSource,
  ReservationStatus,
  SessionFormat,
  VenueOption,
} from './reservation.types';

@Entity('reservations')
export class ReservationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  source: ReservationSource;

  @Column({ type: 'varchar' })
  sessionFormat: SessionFormat;

  @Column({ type: 'varchar' })
  venue: VenueOption;

  @Column()
  firstChoiceDate: string;

  @Column()
  secondChoiceDate: string;

  @Column({ default: '' })
  dietary: string;

  @Column()
  fullName: string;

  @Column()
  email: string;

  @Column()
  mobile: string;

  @Column({ default: '' })
  assistantContact: string;

  @Column({ type: 'varchar', default: 'pending' })
  status: ReservationStatus;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
