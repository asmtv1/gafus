# Fresh PostgreSQL bootstrap

The historical migration directory is not a clean-room replay: early migrations
reference objects that are introduced by later schema snapshots. Do not edit
already released migration SQL to repair that history: it would change Prisma
checksums on existing environments.

For a brand-new empty PostgreSQL database only, initialise the current schema
and baseline the historical migrations:

```sh
DATABASE_URL='postgresql://…/new_database?schema=public' \
  bash packages/prisma/scripts/bootstrap-fresh-postgres.sh
```

The script refuses a database containing public tables or views. It uses
`prisma db push` only for this empty-database bootstrap, then records every
existing migration as applied. After bootstrap, all future releases use the
normal production command:

```sh
pnpm --filter @gafus/prisma exec prisma migrate deploy
```

Never run the bootstrap script against production, staging, a developer's
existing database, or any database that contains user data.
