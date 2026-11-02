import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

/** One error shape for the whole API: { statusCode, message, errors?, path, timestamp } */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse() as any;
      if (Array.isArray(body?.message)) {
        message = 'Validation failed';
        errors = body.message;
      } else {
        message = body?.message ?? exception.message;
      }
    } else if ((exception as any)?.code === 11000) {
      statusCode = HttpStatus.CONFLICT; // Mongo duplicate key, e.g. email already used
      message = 'Duplicate value: ' + Object.keys((exception as any).keyValue ?? {}).join(', ');
    } else if ((exception as any)?.name === 'ValidationError') {
      statusCode = HttpStatus.BAD_REQUEST; // Mongoose schema validation
      message = 'Validation failed';
      errors = Object.values((exception as any).errors ?? {}).map((e: any) => e.message);
    } else if ((exception as any)?.name === 'CastError') {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Invalid id';
    } else {
      this.logger.error(exception);
    }

    res.status(statusCode).json({ statusCode, message, errors, path: req.url, timestamp: new Date().toISOString() });
  }
}
