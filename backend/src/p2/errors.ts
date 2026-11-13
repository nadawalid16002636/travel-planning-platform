import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';

/** Keep database diagnostics (including internal document fields) out of HTTP responses. */
@Catch()
export class P2ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(P2ErrorFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (error instanceof HttpException)
      return response.status(error.getStatus()).json(error.getResponse());
    if ((error as { code?: number })?.code === 11000)
      return response
        .status(409)
        .json({ statusCode: 409, message: 'Duplicate unique identifier' });
    this.logger.error(
      'P2 operation failed; inspect database connectivity, indexes and transaction support',
    );
    return response.status(500).json({
      statusCode: 500,
      message: 'P2 operation could not be completed',
    });
  }
}
