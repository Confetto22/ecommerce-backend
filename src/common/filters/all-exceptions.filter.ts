import { Catch,  ExceptionFilter, Logger, ArgumentsHost, HttpException, HttpStatus } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import  { Response,  Request } from "express";
import { ErrorResponse } from "../interfaces/error-response.interface";
import { Prisma } from "generated/prisma/client";


@Catch()
export class AllExceptionsFilter implements ExceptionFilter{
    private readonly logger = new Logger(AllExceptionsFilter.name);
    constructor(private readonly config: ConfigService) { }
    
    catch(exception: unknown, host: ArgumentsHost): void{
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();


        const { statusCode, error, message } = this.mapException(exception)
        
        const payload: ErrorResponse = {
            statusCode,
      error,
      message,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId: (request.headers['x-request-id'] as string) ?? undefined,
        }

        if (this.config.get<string>('NODE_ENV') !== 'production' && exception instanceof Error) {
            payload.stack = exception.stack;
        }

        this.log(statusCode, exception, request)
        response.status(statusCode).json(payload)

        
    }






    private mapException(exception: unknown): {
    statusCode: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        return { statusCode, error: exception.name, message: res };
      }
      const { message, error } = res as { message: string | string[]; error?: string };
      return {
        statusCode,
        error: error ?? exception.name,
        message: message ?? exception.message,
      };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.mapPrismaError(exception);
    }
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'PrismaValidationError',
        message: 'Invalid data provided to the database layer.',
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'An unexpected error occurred.',
    };
    }
    

    private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'UniqueConstraintViolation',
          message: `A record with this ${target} already exists.`,
        };
      }
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'RecordNotFound',
          message: 'The requested record was not found.',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'ForeignKeyViolation',
          message: 'Related record does not exist.',
        };
      default:
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'DatabaseError',
          message: `Database error (${exception.code}).`,
        };
    }
    }
    
    private log(statusCode: number, exception: unknown, request: Request): void {
    const msg = `${request.method} ${request.url} -> ${statusCode}`;
    if (statusCode >= 500) {
      this.logger.error(
        msg,
        exception instanceof Error ? exception.stack : JSON.stringify(exception),
      );
    } else {
      this.logger.warn(`${msg} :: ${exception instanceof Error ? exception.message : 'error'}`);
    }
  }
}
