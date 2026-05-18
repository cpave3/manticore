import { z } from 'zod';

const envSchema = z.object({
  MANTICORE_PORT: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 3456)),
  MANTICORE_DB_PATH: z.string().optional().default('./manticore.db'),
  MANTICORE_LOG_LEVEL: z
    .union([z.literal('debug'), z.literal('info'), z.literal('warn'), z.literal('error')])
    .optional()
    .default('info'),
  NODE_ENV: z.string().optional().default('development'),
});

type Config = Readonly<{
  port: number;
  dbPath: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  nodeEnv: string;
}>;

let cached: Config | undefined;

export function loadConfig(): Config {
  if (cached) return cached;

  const parsed = envSchema.parse(process.env);
  cached = Object.freeze({
    port: parsed.MANTICORE_PORT,
    dbPath: parsed.MANTICORE_DB_PATH,
    logLevel: parsed.MANTICORE_LOG_LEVEL,
    nodeEnv: parsed.NODE_ENV,
  });

  return cached;
}
