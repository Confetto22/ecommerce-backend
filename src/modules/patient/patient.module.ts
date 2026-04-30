import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { UserService } from '../user/user.service';
import { UserModule } from '../user/user.module';

@Module({
  controllers: [PatientController],
  providers: [PatientService],
  imports: [UserModule],
})
export class PatientModule {}
