import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import type { ReservationInput, ReservationStatus } from './reservation.types';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Post()
  create(@Body() body: ReservationInput) {
    return this.reservations.create(body, 'public');
  }

  @UseGuards(AdminGuard)
  @Get()
  list() {
    return this.reservations.list();
  }

  @UseGuards(AdminGuard)
  @Post('manual')
  createManual(@Body() body: ReservationInput) {
    return this.reservations.create(body, 'admin');
  }

  @UseGuards(AdminGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: ReservationStatus },
  ) {
    return this.reservations.updateStatus(id, body.status || 'pending');
  }
}
