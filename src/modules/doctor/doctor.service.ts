import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, Role } from 'generated/prisma/client';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { User } from '../user/entities/user.entity';

@Injectable()
export class DoctorService {
  constructor(private readonly db: PrismaService) {}

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
          photo: dto.photo,
          modeOfConsultation: dto.modeOfConsultation,
          totalRatings: dto.totalRatings ?? undefined,
          averageRating: dto.averageRating ?? undefined,
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

  findAll() {
    return `This action returns all doctor`;
  }

  findOne(id: number) {
    return `This action returns a #${id} doctor`;
  }

  update(id: number, updateDoctorDto: UpdateDoctorDto) {
    return `This action updates a #${id} doctor`;
  }

  remove(id: number) {
    return `This action removes a #${id} doctor`;
  }
}
