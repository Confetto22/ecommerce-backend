export class Session {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<Session>) {
    Object.assign(this, partial);
  }
}
