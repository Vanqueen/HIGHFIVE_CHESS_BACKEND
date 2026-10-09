import { db } from "../prisma/db.ts";

type CreateReportData = Parameters<typeof db.orm.public.Report.create>[0];
type UpdateReportData = Parameters<ReturnType<typeof db.orm.public.Report.where>["update"]>[0];

export async function findReport(id: number) {
  return db.orm.public.Report.where({ id }).first();
}

export async function findReports(limit = 100) {
  return db.orm.public.Report.limit(limit).all();
}

export async function createReport(data: CreateReportData) {
  return db.orm.public.Report.create(data);
}

export async function updateReport(id: number, updates: UpdateReportData) {
  return db.orm.public.Report.where({ id }).update(updates);
}

export async function deleteReport(id: number) {
  return db.orm.public.Report.where({ id }).delete();
}
