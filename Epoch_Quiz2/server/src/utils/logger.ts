import winston from 'winston';
import { env, isProd } from '../config';

const { combine, timestamp, printf, colorize, errors, splat, json } = winston.format;

const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  splat(),
  printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level}] ${stack || message}`;
  })
);

const prodFormat = combine(timestamp(), errors({ stack: true }), splat(), json());

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isProd ? prodFormat : devFormat,
  transports: [new winston.transports.Console()],
  exitOnError: false,
});

// Stream object for morgan to pipe HTTP logs into winston.
export const morganStream = {
  write: (message: string) => logger.http(message.trim()),
};
