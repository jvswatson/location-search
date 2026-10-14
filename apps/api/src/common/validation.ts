import { ValidationPipe } from '@nestjs/common';

/**
 * The global pipe: strips nothing silently (unknown fields are a 400), and transforms query
 * strings into the DTOs' declared types.
 */
export const createValidationPipe = (): ValidationPipe =>
  new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
