import { Session } from './session.entity';
import { Exclude } from 'class-transformer';
import { Token } from './token.entity';

export class User {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;

  @Exclude()
  password?: string | null;

  @Exclude()
  tokens?: Token[];

  @Exclude()
  sessions?: Session[];

  constructor(partial: Partial<User>) {
    Object.assign(this, partial);
  }
}
