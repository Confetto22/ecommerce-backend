export class Token {
  id: string;
  token: string;
  type: string;
  userId: string;
  expires: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<Token>) {
    Object.assign(this, partial);
  }
}
