import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { PrismaService } from 'src/infrastructure/database/prisma.service';

@Injectable()
export class UserService {
  constructor(private readonly db: PrismaService) {}
  async getUserByEmail(email: string): Promise<User> {
    const user = await this.db.user.findUnique({
      where: {
        email,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return new User(user);
  }

  // async createUser(userData:CreateUserDto) {
  //   const {email} = userData
  //   // check existence of user
  //   const user = await this.db.user.findUnique({
  //     where: {
  //       email
  //     }
  //   })
  //   if (user) {
  //     throw new ConflictException('User already signed up!')
  //   }

  // }

  async getuserById(id: string) {
    const user = await this.db.user.findUnique({
      where: {
        id,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    return new User(user);
  }

  async getUsers() {
    return this.db.user.findMany();
  }

  // update user
  async updateUser(id: string, data: UpdateUserDto) {
    const { doctorProfile, patientProfile, ...userData } = data;

    const user = await this.db.user.update({
      where: {
        id,
      },
      data: userData,
    });

    return new User(user);
  }
}
