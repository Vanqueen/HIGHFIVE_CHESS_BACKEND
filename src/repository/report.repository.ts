import { db } from "../prisma/db.ts";

type CreateReportData = Parameters<typeof db.orm.public.Report.create>[0];
type UpdateReportData = Parameters<ReturnType<typeof db.orm.public.Report.where>["update"]>[0];

export async function findReport(id: number) {
  return db.orm.public.Report.where({ id }).first();
}

export async function findReports(limit = 100) {
  return db.orm.public.Report
    .orderBy((report) => report.createdAt.desc())
    .limit(limit)
    .all();
}

export async function findReportsByStatus(status: "PENDING" | "UNDER_REVIEW" | "RESOLVED" | "REJECTED", limit = 50) {
  return db.orm.public.Report
    .where({ status })
    .orderBy((report) => report.createdAt.asc())
    .limit(limit)
    .all();
}

export async function findReportsByReporter(reporterId: number, limit = 50) {
  return db.orm.public.Report
    .where({ reporterId })
    .orderBy((report) => report.createdAt.desc())
    .limit(limit)
    .all();
}

export async function createReport(data: CreateReportData) {
  return db.orm.public.Report.create(data);
}

export async function updateReport(id: number, updates: UpdateReportData) {
  return db.orm.public.Report.where({ id }).update(updates);
}

export async function reviewReport(
  id: number,
  expectedStatus: "PENDING" | "UNDER_REVIEW",
  updates: UpdateReportData,
) {
  return db.orm.public.Report.where({ id, status: expectedStatus }).update(updates);
}

export async function deleteReport(id: number) {
  return db.orm.public.Report.where({ id }).delete();
}
