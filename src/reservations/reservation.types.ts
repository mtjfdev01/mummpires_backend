export type SessionFormat = 'lunch' | 'dinner';
export type VenueOption = 'private-dining' | 'briefing-suite';
export type ReservationStatus = 'pending' | 'approved' | 'declined';
export type ReservationSource = 'public' | 'admin';

export interface Reservation {
  id: string;
  source: ReservationSource;
  sessionFormat: SessionFormat;
  venue: VenueOption;
  firstChoiceDate: string;
  secondChoiceDate: string;
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
