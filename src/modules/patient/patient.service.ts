import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from 'generated/prisma/client';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { User } from '../user/entities/user.entity';
import { PatientProfile } from './entities/patient-profile.entity';

@Injectable()
export class PatientService {
  constructor(private readonly db: PrismaService) {}

  async createForUser(user: User, dto: CreatePatientDto) {
    if (user.role !== Role.PATIENT) {
      throw new ForbiddenException(
        'Only accounts with role PATIENT can create a patient profile. Sign up with role PATIENT first.',
      );
    }

    const existingProfile = await this.db.patientProfile.findUnique({
      where: { userId: user.id },
    });
    if (existingProfile) {
      throw new ConflictException('Patient profile already exists');
    }

    try {
      const patient = await this.db.patientProfile.create({
        data: {
          userId: user.id,
          dateOfBirth: dto.dateOfBirth,
          bloodType: dto.bloodType,
          allergies: dto.allergies ?? [],
          medicalConditions: dto.medicalConditions ?? [],
          emergencyContactPhone: dto.emergencyContactPhone,
          emergencyContactName: dto.emergencyContactName,
        },
      });

      return {
        message: 'Patient profile created successfully',
        patient,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Patient profile already exists');
      }
      throw error;
    }
  }

  async findAllPatients() {
    return await this.db.patientProfile.findMany({
      include: {
        user: {
          select: {
            username: true,
            email: true,
          },
        },
      },
    });
  }

  async getCurrentPatient(userId: string): Promise<PatientProfile> {
    const patient = await this.db.patientProfile.findUnique({
      where: {
        userId,
      },
      include: {
        user: {
          omit: {
            password: true,
          },
        },
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient does not exist');
    }

    const { user, ...profile } = patient;
    return new PatientProfile({
      ...profile,
      user: user ? new User(user) : undefined,
    });
  }

  async updatePatient(id: string, updatePatientDto: UpdatePatientDto) {
    const patient = await this.verifyPatient(id);

    await this.db.patientProfile.update({
      where: {
        id: patient?.id,
      },
      data: {
        ...updatePatientDto,
      },
    });
    return {
      message: `${patient?.user?.username} updated successfully`,
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
            username: true,
            email: true,
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
