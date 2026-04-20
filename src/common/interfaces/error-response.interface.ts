export interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  method: string;
  timestamp: string;
  requestId?: string;
  stack?: string;
}