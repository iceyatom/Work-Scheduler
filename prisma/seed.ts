// Seed the real store roster, derived from an actual Taco Bell Tracks "Weekly
// Labor Schedule" export (store #031115 — Folsom, CA, week of 06/17). Day-of-week
// is 0=Monday … 6=Sunday; times are minutes from midnight. Re-runnable: it wipes
// & re-creates. Run with `npm run db:seed`.
//
// Notes on the mapping from the printed schedule:
//   • The 4 highlighted names on the sheet are the managers (Dianna, Jaclyn,
//     Kiera, Nicole). No employees were marked "M" (minor) that week.
//   • Each person's `availability` is an envelope derived from when they actually
//     worked (opener / mid / closer), widened a little to give the solver room.
//   • Employment type & weekly hour caps come from the printed weekly totals.
//   • Dianna is treated as the GM with a recurring hard-set opening shift,
//     reflecting her standing 5:00 AM open in the data.
//   • No preferences are seeded (by request). The `Tracks ID:` comments are the
//     real employee IDs from the export, kept for traceability.

import { PrismaClient, EmploymentType } from "@prisma/client";

const prisma = new PrismaClient();

const T = (h: number, m = 0) => h * 60 + m;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

type Seed = {
  name: string;
  employmentType: EmploymentType;
  isManager?: boolean;
  isGM?: boolean;
  isMinor?: boolean;
  seniorityMonths: number;
  performance: number;
  certifications: number;
  minHoursPerWeek?: number;
  maxHoursPerWeek?: number;
  // Availability envelope; defaults to all 7 days unless `days` is given.
  availability: { startMin: number; endMin: number; days?: number[] }[];
  hardSets?: { days: number[]; startMin: number; endMin: number; note?: string }[];
};

const crew: Seed[] = [
  // ---- Managers (highlighted on the sheet) -------------------------------
  {
    name: "Dianna B", // Tracks ID: 1447 — opener, weekly 39:30
    employmentType: "FULL_TIME",
    isManager: true,
    isGM: true,
    seniorityMonths: 144,
    performance: 5,
    certifications: 6,
    minHoursPerWeek: 38,
    maxHoursPerWeek: 46,
    availability: [{ startMin: T(5), endMin: T(15) }],
    // Standing GM open (5:00 AM–1:30 PM) on the days she opened in the export.
    hardSets: [{ days: [0, 1, 2, 5, 6], startMin: T(5), endMin: T(13, 30), note: "GM standing open" }],
  },
  {
    name: "Jaclyn F", // Tracks ID: 0006 — mid/close, weekly 36:30
    employmentType: "FULL_TIME",
    isManager: true,
    seniorityMonths: 96,
    performance: 5,
    certifications: 5,
    minHoursPerWeek: 34,
    maxHoursPerWeek: 42,
    availability: [{ startMin: T(10), endMin: T(24, 30) }],
  },
  {
    name: "Kiera b", // Tracks ID: 0007 — closer, weekly 38:00
    employmentType: "FULL_TIME",
    isManager: true,
    seniorityMonths: 72,
    performance: 4,
    certifications: 5,
    minHoursPerWeek: 34,
    maxHoursPerWeek: 42,
    availability: [{ startMin: T(15), endMin: T(24, 30) }],
  },
  {
    name: "Nicole W", // Tracks ID: 1279 — mid/close, long shifts, weekly 46:30
    employmentType: "FULL_TIME",
    isManager: true,
    seniorityMonths: 84,
    performance: 5,
    certifications: 5,
    minHoursPerWeek: 40,
    maxHoursPerWeek: 48,
    availability: [{ startMin: T(9), endMin: T(24, 30) }],
  },

  // ---- Full-time crew ----------------------------------------------------
  {
    name: "Adalynn W", // Tracks ID: 1431 — mid/close, weekly 37:30
    employmentType: "FULL_TIME",
    seniorityMonths: 40,
    performance: 4,
    certifications: 2,
    minHoursPerWeek: 32,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(9), endMin: T(24) }],
  },
  {
    name: "Benedicta A", // Tracks ID: 1438 — opener with some closes, weekly 40:00
    employmentType: "FULL_TIME",
    seniorityMonths: 50,
    performance: 4,
    certifications: 3,
    minHoursPerWeek: 32,
    maxHoursPerWeek: 42,
    availability: [{ startMin: T(6), endMin: T(24) }],
  },
  {
    name: "James M", // Tracks ID: 1430 — opener (5 AM–12 PM), weekly 34:00
    employmentType: "FULL_TIME",
    seniorityMonths: 60,
    performance: 4,
    certifications: 2,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(14) }],
  },
  {
    name: "Kole K", // Tracks ID: 1359 — closer, weekly 32:30
    employmentType: "FULL_TIME",
    seniorityMonths: 30,
    performance: 4,
    certifications: 2,
    minHoursPerWeek: 28,
    maxHoursPerWeek: 38,
    availability: [{ startMin: T(14), endMin: T(24, 30) }],
  },
  {
    name: "Nahidul I", // Tracks ID: 1402 — mid/close, weekly 38:30
    employmentType: "FULL_TIME",
    seniorityMonths: 36,
    performance: 4,
    certifications: 2,
    minHoursPerWeek: 32,
    maxHoursPerWeek: 42,
    availability: [{ startMin: T(8), endMin: T(24) }],
  },
  {
    name: "Sakeenah Q", // Tracks ID: 1444 — open-to-close flexible, weekly 33:30
    employmentType: "FULL_TIME",
    seniorityMonths: 28,
    performance: 4,
    certifications: 2,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(24) }],
  },
  {
    name: "Trevor M", // Tracks ID: 1429 — opener, weekly 33:30
    employmentType: "FULL_TIME",
    seniorityMonths: 44,
    performance: 4,
    certifications: 2,
    minHoursPerWeek: 32,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(5), endMin: T(17) }],
  },
  {
    name: "Tristan H", // Tracks ID: 1424 — closer, weekly 35:15
    employmentType: "FULL_TIME",
    seniorityMonths: 24,
    performance: 3,
    certifications: 1,
    minHoursPerWeek: 30,
    maxHoursPerWeek: 40,
    availability: [{ startMin: T(16), endMin: T(24, 30) }],
  },

  // ---- Part-time crew ----------------------------------------------------
  {
    name: "aja j", // Tracks ID: 1439 — mid/close, weekly 21:30
    employmentType: "PART_TIME",
    seniorityMonths: 14,
    performance: 3,
    certifications: 1,
    maxHoursPerWeek: 24,
    availability: [{ startMin: T(12), endMin: T(22) }],
  },
  {
    name: "Daisy B", // Tracks ID: 0010 — mid, weekly 14:30
    employmentType: "PART_TIME",
    seniorityMonths: 10,
    performance: 3,
    certifications: 1,
    maxHoursPerWeek: 20,
    availability: [{ startMin: T(11), endMin: T(22) }],
  },
  {
    name: "Easton V", // Tracks ID: 1360 — short evening shifts, weekly 17:30
    employmentType: "PART_TIME",
    seniorityMonths: 8,
    performance: 3,
    certifications: 0,
    maxHoursPerWeek: 18,
    availability: [{ startMin: T(16), endMin: T(23) }],
  },
  {
    name: "Eraj G", // Tracks ID: 1437 — mid, weekly 17:30
    employmentType: "PART_TIME",
    seniorityMonths: 16,
    performance: 3,
    certifications: 1,
    maxHoursPerWeek: 20,
    availability: [{ startMin: T(10), endMin: T(18) }],
  },
  {
    name: "Isaiah K", // Tracks ID: 1428 — evening, weekly ~5:30
    employmentType: "PART_TIME",
    seniorityMonths: 6,
    performance: 2,
    certifications: 0,
    maxHoursPerWeek: 16,
    availability: [{ startMin: T(17), endMin: T(24) }],
  },
  {
    name: "Jonathan H", // Tracks ID: 1339 — evening, weekly 9:00
    employmentType: "PART_TIME",
    seniorityMonths: 5,
    performance: 3,
    certifications: 0,
    maxHoursPerWeek: 16,
    availability: [{ startMin: T(18), endMin: T(24, 30) }],
  },
  {
    name: "Reese P", // Tracks ID: 1422 — mid/close, weekly 19:00
    employmentType: "PART_TIME",
    seniorityMonths: 12,
    performance: 3,
    certifications: 1,
    maxHoursPerWeek: 22,
    availability: [{ startMin: T(11), endMin: T(22) }],
  },
];

async function main() {
  console.log("Clearing existing data…");
  // Order matters for FK constraints.
  await prisma.assignment.deleteMany();
  await prisma.job.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.personnelChange.deleteMany();
  await prisma.availability.deleteMany();
  await prisma.preference.deleteMany();
  await prisma.hardSetAssignment.deleteMany();
  await prisma.employee.deleteMany();

  console.log(`Seeding ${crew.length} employees…`);
  for (const s of crew) {
    await prisma.employee.create({
      data: {
        name: s.name,
        employmentType: s.employmentType,
        isManager: s.isManager ?? false,
        isGM: s.isGM ?? false,
        isMinor: s.isMinor ?? false,
        seniorityMonths: s.seniorityMonths,
        performance: s.performance,
        certifications: s.certifications,
        minHoursPerWeek: s.minHoursPerWeek ?? null,
        maxHoursPerWeek: s.maxHoursPerWeek ?? null,
        availability: {
          create: s.availability.flatMap((a) => (a.days ?? ALL_DAYS).map((d) => ({ dayOfWeek: d, startMin: a.startMin, endMin: a.endMin }))),
        },
        // No preferences seeded (by request).
        preferences: { create: [] },
        hardSets: {
          create: (s.hardSets ?? []).flatMap((h) => h.days.map((d) => ({ dayOfWeek: d, startMin: h.startMin, endMin: h.endMin, note: h.note ?? null }))),
        },
      },
    });
  }

  const count = await prisma.employee.count();
  const managers = await prisma.employee.count({ where: { isManager: true } });
  console.log(`Done. ${count} employees (${managers} managers) in the database.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
