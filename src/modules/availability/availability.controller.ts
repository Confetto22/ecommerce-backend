import { Body, Controller, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { User } from '../user/entities/user.entity';
import { ReplaceAvailabilityDto } from './dto/replace-availability.dto';

@Controller('doctors/me/availability')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DOCTOR')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Put()
  async replaceAvailability(
    @CurrentUser() user: User,
    @Body() dto: ReplaceAvailabilityDto,
  ) {}

  @Patch(':id/toggle')
  async toggleRule(@CurrentUser() user: User, @Param('id') ruleId: string) {}
}
