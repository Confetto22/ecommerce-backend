import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { UserService } from '../user/user.service';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

@Injectable()
export class PatientService {
  constructor(
    private readonly userService: UserService,
    private readonly db: PrismaService,
  ) {}
  async createPatient(createPatientDto: CreatePatientDto) {
    //  check existence of patient from user Details email before allowing them to be a patient

    const user = await this.userService.getuserById(createPatientDto.userId);
    if (!user) {
      throw new NotFoundException('You must first sign up');
    }

    // prevent duplicate patient sign up
    const existingPatient = await this.db.patientProfile.findUnique({
      where: { userId: user.id },
    });
    if (existingPatient) {
      throw new ConflictException('Patient profile already exists');
    }

    // and check the role if they exist
    if (user.role === 'PATIENT') {
      try {
        const patient = await this.db.patientProfile.create({
          data: {
            userId: user.id,
          },
        });

        // set patientProfile field on User Model to current patient created
        const updatedUser = await this.userService.updateUser(user.id, {
          patientProfile: patient.id,
        });
        return {
          message: 'patient added successfully',
          updatedUser,
          patient,
        };
      } catch (error) {
        // Protect against concurrent requests creating same profile at once.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Patient profile already exists');
        }
        throw error;
      }
    } else {
      throw new UnauthorizedException('You did not sign up as a patient!');
    }
  }

  async findAllPatients() {
    return await this.db.patientProfile.findMany({
      include: {
        user: {
          select: {
            firstname: true,
            lastname: true,
            email: true,
            phone: true,
            profilePhoto: true,
          },
        },
      },
    });
  }

  async findPatient(id: string) {
    await this.verifyPatient(id);
  }

  async updatePatient(id: string, updatePatientDto: UpdatePatientDto) {
    const patient = await this.verifyPatient(id);

    const updatedPatient = await this.db.patientProfile.update({
      where: {
        id: patient?.id,
      },
      data: {
        ...updatePatientDto,
      },
    });
    return {
      message: `${patient?.user?.firstname} updated successfully`,
    };
  }

  async deletePatient(id: string) {
    const patient = await this.verifyPatient(id);
    await this.db.patientProfile.delete({
      where: {
        id: patient.id,
      },
    });
  }

  private async verifyPatient(id: string) {
    const patient = await this.db.patientProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            firstname: true,
            lastname: true,
            email: true,
            phone: true,
            profilePhoto: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient does not exist');
    }
    return patient;
  }
}
