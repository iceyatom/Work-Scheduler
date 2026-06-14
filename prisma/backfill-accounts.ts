// One-time backfill: attach pre-auth rows (employees/schedules/changes/jobs with
// no accountId) to a default account so existing data isn't orphaned once
// multi-tenant auth is introduced. Idempotent — safe to re-run.
//
//   npm run db:backfill
//
// Does NOT delete anything (unlike the seed). Preserves the user's edited data.

import { PrismaClient } from "@prisma/client";
import { hashPassword, normalizeUsername } from "../src/lib/password";

const prisma = new PrismaClient();

const USERNAME = process.env.DEFAULT_ACCOUNT_USERNAME || "folsom";
const PASSWORD = process.env.DEFAULT_ACCOUNT_PASSWORD || "Taco1234!";

async function main() {
  const usernameLower = normalizeUsername(USERNAME);
  let account = await prisma.account.findUnique({ where: { usernameLower } });
  if (!account) {
    account = await prisma.account.create({
      data: { username: USERNAME, usernameLower, passwordHash: hashPassword(PASSWORD) },
    });
    console.log(`Created default account "${USERNAME}".`);
  } else {
    console.log(`Default account "${USERNAME}" already exists.`);
  }

  const e = await prisma.employee.updateMany({ where: { accountId: null }, data: { accountId: account.id } });
  const s = await prisma.schedule.updateMany({ where: { accountId: null }, data: { accountId: account.id } });
  const c = await prisma.personnelChange.updateMany({ where: { accountId: null }, data: { accountId: account.id } });
  const j = await prisma.job.updateMany({ where: { accountId: null }, data: { accountId: account.id } });

  console.log(`Backfilled — employees: ${e.count}, schedules: ${s.count}, changes: ${c.count}, jobs: ${j.count}`);
  console.log(`\nYou can log in with:  username "${USERNAME}"  password "${PASSWORD}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
