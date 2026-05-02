import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from 'src/infrastructure/database/prisma.service';

import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UserService {
  constructor(private readonly db: PrismaService) {}

  async getUserByEmail(email: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    return new User(user);
  }

  async getuserById(id: string): Promise<User> {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return new User(user);
  }

  async getUsers(): Promise<User[]> {
    const users = await this.db.user.findMany();
    return users.map((u) => new User(u));
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    const user = await this.db.user.update({ where: { id }, data });
    return new User(user);
  }
}
