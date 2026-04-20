import { Injectable } from '@nestjs/common';
import { format } from 'date-fns';

@Injectable()
export class AppService {
  getHealth() {
    return { status: 'ok', timestamp: format(new Date(), 'MM/dd/yyyy HH:mm:ss') };
  }
}
