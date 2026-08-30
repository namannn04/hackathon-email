import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` runs during install on Vercel, where the datasource URL is
// not needed. `env()` from prisma/config throws while the config is loaded, so
// read the variable directly and attach the datasource only when it is set.
// Migration commands still fail with Prisma's own message when it is missing.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(url ? { datasource: { url } } : {}),
});
