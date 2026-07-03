// Seed the real store roster (store #031115 — Folsom, CA). Day-of-week is
// 0=Monday … 6=Sunday; times are minutes from midnight. Re-runnable: it wipes
// & re-creates. Run with `npm run db:seed`.
//
// This snapshot reflects the CURRENT live database — the roster has been edited
// in the running app since the original Tracks export, so a few things differ
// from the printed sheet:
//   • The 4 managers are Dianna, Jaclyn, Kiera, Nicole. Nicole W is now the GM
//     (Dianna's GM flag was turned off).
//   • Sakeenah Q is marked a minor; Eraj G is inactive (kept here for history).
//   • Standing shifts live as template hard-sets (Jaclyn Wed, Nicole Tue,
//     Easton Wed–Fri, Jonathan Tue/Thu).
//   • `availability` defaults to all 7 days unless a `days` array is given.
//   • The `Tracks ID:` comments are the real employee IDs from the export, kept
//     for traceability.

import { PrismaClient, EmploymentType } from "@prisma/client";
import { hashPassword, normalizeUsername } from "../src/lib/password";

const prisma = new PrismaClient();

const ACCOUNT_USERNAME = process.env.DEFAULT_ACCOUNT_USERNAME || "folsom";
const ACCOUNT_PASSWORD = process.env.DEFAULT_ACCOUNT_PASSWORD || "Taco1234!";

const T = (h: number, m = 0) => h * 60 + m;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type Seed = {
  name: string;
  employmentType: EmploymentType;
  isManager?: boolean;
  isGM?: boolean;
  isMinor?: boolean;
  active?: boolean; // defaults to true
  performance: number;
  minHoursPerWeek?: number;
  maxHoursPerWeek?: number;
  // Availability envelope; defaults to all 7 days unless `days` is given.
  availability: { startMin: number; endMin: number; days?: number[] }[];
  hardSets?: { days: number[]; startMin: number; endMin: number; note?: string }[];
};

const crew: Seed[] = [
  // ---- Managers ----------------------------------------------------------
  {
    name: "Dianna B", // Tracks ID: 1447
    employmentType: "FULL_TIME",
    isManager: true,
    performance: 5,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(15) }],
  },
  {
    name: "Jaclyn F", // Tracks ID: 0006
    employmentType: "FULL_TIME",
    isManager: true,
    performance: 5,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(10), endMin: T(24, 30) }],
    hardSets: [{ days: [2], startMin: T(10), endMin: T(18, 30) }],
  },
  {
    name: "Kiera b", // Tracks ID: 0007
    employmentType: "FULL_TIME",
    isManager: true,
    performance: 4,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(15), endMin: T(24, 30) }],
  },
  {
    name: "Nicole W", // Tracks ID: 1279 — current GM
    employmentType: "FULL_TIME",
    isManager: true,
    isGM: true,
    performance: 5,
    minHoursPerWeek: 50,
    maxHoursPerWeek: 50,
    availability: [{ startMin: T(5), endMin: T(24, 30), days: [0, 1, 2, 3, 4] }],
    hardSets: [{ days: [1], startMin: T(14), endMin: T(24, 30) }],
  },

  // ---- Full-time crew ----------------------------------------------------
  {
    name: "Adalynn W", // Tracks ID: 1431
    employmentType: "FULL_TIME",
    performance: 5,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 35,
    availability: [{ startMin: T(9), endMin: T(24) }],
  },
  {
    name: "Benedicta A", // Tracks ID: 1438
    employmentType: "FULL_TIME",
    performance: 4,
    minHoursPerWeek: 32,
    maxHoursPerWeek: 42,
    availability: [{ startMin: T(6), endMin: T(24) }],
  },
  {
    name: "James M", // Tracks ID: 1430
    employmentType: "FULL_TIME",
    performance: 4,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(14) }],
  },
  {
    name: "Kole K", // Tracks ID: 1359
    employmentType: "FULL_TIME",
    performance: 4,
    minHoursPerWeek: 28,
    maxHoursPerWeek: 38,
    availability: [{ startMin: T(14), endMin: T(24, 30) }],
  },
  {
    name: "Nahidul I", // Tracks ID: 1402
    employmentType: "FULL_TIME",
    performance: 4,
    minHoursPerWeek: 32,
    maxHoursPerWeek: 42,
    availability: [{ startMin: T(8), endMin: T(24) }],
  },
  {
    name: "Sakeenah Q", // Tracks ID: 1444 — now a minor
    employmentType: "FULL_TIME",
    isMinor: true,
    performance: 4,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(24) }],
  },
  {
    name: "Trevor M", // Tracks ID: 1429
    employmentType: "FULL_TIME",
    performance: 4,
    minHoursPerWeek: 32,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(17) }],
  },
  {
    name: "Tristan H", // Tracks ID: 1424
    employmentType: "FULL_TIME",
    performance: 1,
    minHoursPerWeek: 0,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(24, 30) }],
  },

  // ---- Part-time crew ----------------------------------------------------
  {
    name: "aja j", // Tracks ID: 1439
    employmentType: "PART_TIME",
    performance: 3,
    maxHoursPerWeek: 20,
    availability: [{ startMin: T(12), endMin: T(22) }],
  },
  {
    name: "Daisy B", // Tracks ID: 0010
    employmentType: "PART_TIME",
    performance: 3,
    maxHoursPerWeek: 20,
    availability: [{ startMin: T(11), endMin: T(22) }],
  },
  {
    name: "Easton V", // Tracks ID: 1360 — Wed–Fri evenings
    employmentType: "PART_TIME",
    performance: 4,
    maxHoursPerWeek: 18,
    availability: [{ startMin: T(16), endMin: T(23), days: [2, 3, 4] }],
    hardSets: [
      { days: [2, 3], startMin: T(17, 30), endMin: T(22, 30) },
      { days: [4], startMin: T(16, 30), endMin: T(22, 30) },
    ],
  },
  {
    name: "Eraj G", // Tracks ID: 1437 — inactive
    employmentType: "PART_TIME",
    active: false,
    performance: 3,
    maxHoursPerWeek: 20,
    availability: [{ startMin: T(10), endMin: T(18) }],
  },
  {
    name: "Isaiah K", // Tracks ID: 1428
    employmentType: "PART_TIME",
    performance: 5,
    maxHoursPerWeek: 16,
    availability: [{ startMin: T(17), endMin: T(24) }],
  },
  {
    name: "Jonathan H", // Tracks ID: 1339 — Tue & Thu late
    employmentType: "PART_TIME",
    performance: 4,
    maxHoursPerWeek: 9,
    availability: [
      { startMin: T(20), endMin: T(24, 30), days: [1] },
      { startMin: T(19), endMin: T(23, 30), days: [3] },
    ],
    hardSets: [
      { days: [1], startMin: T(20), endMin: T(24, 30) },
      { days: [3], startMin: T(19), endMin: T(23, 30) },
    ],
  },
  {
    name: "Reese P", // Tracks ID: 1422
    employmentType: "PART_TIME",
    performance: 4,
    maxHoursPerWeek: 22,
    availability: [{ startMin: T(11), endMin: T(22) }],
  },
];

async function main() {
  console.log("Clearing existing data…");
  // Order matters for FK constraints. Accounts/sessions are preserved.
  await prisma.assignment.deleteMany();
  await prisma.job.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.personnelChange.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.hardSetAssignment.deleteMany();
  await prisma.employee.deleteMany();

  // Default account that owns the seeded roster (so you can log in).
  const usernameLower = normalizeUsername(ACCOUNT_USERNAME);
  const account = await prisma.account.upsert({
    where: { usernameLower },
    update: {},
    create: { username: ACCOUNT_USERNAME, usernameLower, passwordHash: hashPassword(ACCOUNT_PASSWORD) },
  });

  console.log(`Seeding ${crew.length} employees under account "${ACCOUNT_USERNAME}"…`);
  for (const s of crew) {
    await prisma.employee.create({
      data: {
        accountId: account.id,
        name: s.name,
        employmentType: s.employmentType,
        // GM implies manager.
        isManager: (s.isManager ?? false) || (s.isGM ?? false),
        isGM: s.isGM ?? false,
        isMinor: s.isMinor ?? false,
        active: s.active ?? true,
        performance: s.performance,
        minHoursPerWeek: s.minHoursPerWeek ?? null,
        maxHoursPerWeek: s.maxHoursPerWeek ?? null,
        availability: {
          create: s.availability.flatMap((a) => (a.days ?? ALL_DAYS).map((d) => ({ dayOfWeek: d, startMin: a.startMin, endMin: a.endMin }))),
        },
        hardSets: {
          create: (s.hardSets ?? []).flatMap((h) => h.days.map((d) => ({ dayOfWeek: d, startMin: h.startMin, endMin: h.endMin, note: h.note ?? null }))),
        },
      },
    });
  }

  const count = await prisma.employee.count();
  const managers = await prisma.employee.count({ where: { isManager: true } });
  console.log(`Done. ${count} employees (${managers} managers) in the database.`);
  console.log(`Log in with:  username "${ACCOUNT_USERNAME}"  password "${ACCOUNT_PASSWORD}"`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
