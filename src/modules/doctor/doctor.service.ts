import {
  BadRequestException,
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
import { ListDoctorsQueryDto } from './dto/list-doctors-query.dto';
import { AvailabilityQueryDto } from '../availability/dto/availability-query.dto';
import { AvailabilityService } from '../availability/availability.service';
import { SlotResult } from '../availability/types/availability.types';

@Injectable()
export class DoctorService {
  constructor(
    private readonly db: PrismaService,
    private readonly authService: AuthService,
    private readonly availabilityService: AvailabilityService,
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

  // async findAllDoctors() {
  //   return await this.db.doctorProfile.findMany({
  //     include: {
  //       user: {
  //         select: {
  //           username: true,
  //           email: true,
  //         },
  //       },
  //     },
  //   });
  // }

  async listDoctors(query: ListDoctorsQueryDto) {
    const {
      city,
      country,
      gender,
      language,
      limit = 20,
      mode,
      page = 1,
      q,
      specialty,
    } = query;

    // ── Build where clause ─────────────────────────────────────
    // city / country / gender live on User, not DoctorProfile
    const userIs: Prisma.UserWhereInput = {};
    if (city) userIs.city = city;
    if (country) userIs.country = country;
    if (gender) userIs.gender = gender;

    const and: Prisma.DoctorProfileWhereInput[] = [];
    if (Object.keys(userIs).length > 0) {
      and.push({ user: { is: userIs } });
    }
    if (q) {
      and.push({
        OR: [
          { bio: { contains: q, mode: 'insensitive' } },
          {
            user: {
              is: { username: { contains: q, mode: 'insensitive' } },
            },
          },
        ],
      });
    }

    const where: Prisma.DoctorProfileWhereInput = {
      published: true,
      ...(specialty && { specialties: { has: specialty } }),
      ...(language && { languages: { has: language } }),
      ...(mode && { modeOfConsultation: mode }),
      ...(and.length > 0 && { AND: and }),
    };

    const skip = (page - 1) * limit;

    // ── Query ──────────────────────────────────────────────────
    const [items, total] = await Promise.all([
      this.db.doctorProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ nextAvailableAt: 'asc' }, { createdAt: 'desc' }],
        include: {
          user: {
            select: {
              username: true,
              email: true,
              city: true,
              country: true,
              gender: true,
            },
          },
        },
      }),
      this.db.doctorProfile.count({ where }),
    ]);

    // ── Shape response ─────────────────────────────────────────

    return {
      items: items.map((i) => ({
        id: i.id,
        user: i.user,
        specialties: i.specialties,
        languages: i.languages,
        modeOfConsultation: i.modeOfConsultation,
        perHourRate: i.perHourRate,
        averageRating: i.averageRating,
        nextAvailableAt: i.nextAvailableAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
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

  async getAvailabilityForPublic(
    doctorId: string,
    query: AvailabilityQueryDto,
  ): Promise<SlotResult> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    // Validate bounds
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      throw new BadRequestException('Invalid date format');
    }
    if (to <= from) {
      throw new BadRequestException('to must be after from');
    }

    const maxDays = 90;
    const diffMs = to.getTime() - from.getTime();
    if (diffMs > maxDays * 24 * 60 * 60 * 1000) {
      throw new BadRequestException(`Maximum window is ${maxDays} days`);
    }
    // Check doctor exists and is published
    const doctor = await this.db.doctorProfile.findUnique({
      where: { id: doctorId },
      select: { published: true },
    });
    if (!doctor || !doctor.published) {
      throw new NotFoundException('Doctor not found');
    }
    return this.availabilityService.getBookableSlots(doctorId, from, to);
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
