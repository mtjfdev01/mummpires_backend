export type SessionFormat = 'lunch' | 'dinner';
export type VenueOption = 'private-dining' | 'briefing-suite';
export type ReservationStatus = 'pending' | 'approved' | 'declined';
export type ReservationSource = 'public' | 'admin';

export const LUNCH_SLOT_TIMES = ['12:30', '13:00', '13:30'] as const;
export const DINNER_SLOT_TIMES = ['19:00', '19:30', '20:00', '20:30'] as const;
export const ALL_SLOT_TIMES = [
  ...LUNCH_SLOT_TIMES,
  ...DINNER_SLOT_TIMES,
] as const;

export interface Reservation {
  id: string;
  source: ReservationSource;
  sessionFormat: SessionFormat;
  venue: VenueOption;
  firstChoiceDate: string;
  secondChoiceDate: string;
  slotTime: string;
  dietary: string;
  fullName: string;
  email: string;
  mobile: string;
  assistantContact: string;
  status: ReservationStatus;
  createdAt: string;
}

export type ReservationInput = Omit<Reservation, 'id' | 'createdAt' | 'status'> & {
  status?: ReservationStatus;
};
