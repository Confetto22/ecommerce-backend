import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { Prisma, Role } from 'generated/prisma/client';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { User } from '../user/entities/user.entity';
import { DoctorProfile } from './entities/doctor-profile.entity';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class DoctorService {
  constructor(
    private readonly db: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async createForUser(user: User, dto: CreateDoctorDto) {
    if (user.role !== Role.DOCTOR) {
      throw new ForbiddenException(
        'Only accounts with role DOCTOR can create a doctor profile. Sign up with role DOCTOR first.',
      );
    }

    const existingProfile = await this.db.doctorProfile.findUnique({
      where: { userId: user.id },
    });
    if (existingProfile) {
      throw new ConflictException('Doctor profile already exists');
    }

    try {
      const doctor = await this.db.doctorProfile.create({
        data: {
          userId: user.id,
          yearsOfExperience: dto.yearsOfExperience,
          educationLevel: dto.educationLevel,
          institution: dto.institution,
          perHourRate: dto.perHourRate,
          appointmentSlotMinutes: dto.appointmentSlotMinutes ?? undefined,
          bio: dto.bio,
          modeOfConsultation: dto.modeOfConsultation,
          specialties: dto.specialties ?? [],
          languages: dto.languages ?? [],
          published: dto.published ?? false,
        },
      });

      return {
        message: 'Doctor profile created successfully',
        doctor,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Doctor profile already exists');
      }
      throw error;
    }
  }

  async findAllDoctors() {
    return await this.db.doctorProfile.findMany({
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

  async getSelf(userId: string): Promise<DoctorProfile> {
    const doctor = await this.db.doctorProfile.findUnique({
      where: { userId },
      include: {
        user: {
          omit: { password: true },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    const { user, ...profile } = doctor;
    return new DoctorProfile({
      ...profile,
      user: user ? new User(user) : undefined,
    });
  }

  /**
   * Public doctor profile by owning user's id. Only published profiles are exposed.
   */
  async getPublicProfile(id: string): Promise<DoctorProfile> {
    const doctor = await this.db.doctorProfile.findUnique({
      where: { userId: id },
      include: {
        user: {
          omit: { password: true },
        },
      },
    });

    if (!doctor || !doctor.published) {
      throw new NotFoundException('Doctor profile not found');
    }

    const { user, ...profile } = doctor;
    return new DoctorProfile({
      ...profile,
      user: user ? new User(user) : undefined,
    });
  }

  async updateMyProfile(
    id: string,
    updateData: UpdateDoctorDto,
  ): Promise<{ message: string }> {
    const doctor = await this.verifyDoctor(id);
    await this.db.doctorProfile.update({
      where: { id: doctor.id },
      data: {
        ...updateData,
      },
    });
    return {
      message: `${doctor.user?.username} updated successfully`,
    };
  }

  async deleteDoctor(id: string, res: Response): Promise<{ message: string }> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.authService.logoutAll(user.id, res);

    await this.db.user.delete({
      where: { id: user.id },
    });

    return {
      message: `${user.username} deleted successfully`,
    };
  }

  private async verifyDoctor(id: string) {
    const doctor = await this.db.doctorProfile.findUnique({
      where: { userId: id },
      include: {
        user: {
          select: {
            username: true,
            email: true,
          },
        },
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor profile not found');
    }

    return doctor;
  }
}
