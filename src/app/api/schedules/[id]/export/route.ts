import { prisma } from "@/lib/prisma";
import { handle, notFound, unauthorized } from "@/lib/api";
import { DAY_NAMES } from "@/lib/constants";
import { getSessionAccount } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tracks export (spec §7.4). NOTE: this is a PLACEHOLDER schema. The real,
// import-ready Taco Bell Tracks format must be reverse-engineered from a real
// Tracks export before this module is finalised (spec §3.3, §7.4). The columns
// below are a reasonable stand-in so the end-to-end flow is testable today.

function clock24(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const account = await getSessionAccount();
    if (!account) return unauthorized();
    const schedule = await prisma.schedule.findFirst({
      where: { id: params.id, accountId: account.id },
      include: { assignments: { orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }] } },
    });
    if (!schedule) return notFound("Schedule not found");

    const employees = await prisma.employee.findMany({ where: { accountId: account.id } });
    const empById = new Map(employees.map((e) => [e.id, e]));
    const weekStart = new Date(schedule.weekStart);

    const header = [
      "EmployeeName",
      "EmploymentType",
      "DayOfWeek",
      "Date",
      "StartTime",
      "EndTime",
      "UnpaidBreakMin",
      "PaidHours",
      "Manager",
      "Source",
    ];
    const rows = schedule.assignments.map((a) => {
      const emp = empById.get(a.employeeId);
      const date = new Date(weekStart);
      date.setUTCDate(date.getUTCDate() + a.dayOfWeek);
      return [
        emp?.name ?? a.employeeId,
        emp?.employmentType ?? "",
        DAY_NAMES[a.dayOfWeek],
        date.toISOString().slice(0, 10),
        clock24(a.startMin),
        clock24(a.endMin),
        a.breakStarts.length * 30,
        (a.paidMinutes / 60).toFixed(2),
        emp?.isManager ? "Y" : "N",
        a.source,
      ].map(csvCell).join(",");
    });

    const csv = [header.join(","), ...rows].join("\r\n");
    const filename = `tracks-export-${schedule.weekStart.toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });
}
