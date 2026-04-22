import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterUserDto } from './dto/register-user.dto';
import { User } from './entities/user.entity';
import { PrismaService } from 'src/infrastructure/database/prisma.service';
import { hash } from 'bcryptjs';
import { Role } from 'generated/prisma/enums';
import type { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}
  //   Register new user

  async register(
    registerData: RegisterUserDto,
  ): Promise<{ user: User; message: string }> {
    // check existing user
    const existingUser = await this.db.user.findUnique({
      where: {
        email: registerData.email,
      },
    });
    if (existingUser) {
      throw new ConflictException('Already signed up!');
    }
    //   hash password
    const hashedPassword = await hash(registerData.password, 12);

    //   create user
    const user = await this.db.user.create({
      data: {
        firstname: registerData.firstname,
        lastname: registerData.lastname,
        email: registerData.email,
        password: hashedPassword,
        role: Role.CUSTOMER,
      },
    });
    return {
      user: new User(user),
      message: 'User created successfully',
    };
  }

  async login(
    email: string,
    password: string,
    rememberMe: boolean = false,
    res: Response,
  ) {}
}
