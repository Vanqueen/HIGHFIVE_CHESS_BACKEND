import { db } from "../prisma/db.ts";

type CreateInvitationLinkData = Parameters<typeof db.orm.public.InvitationLink.create>[0];
type UpdateInvitationLinkData = Parameters<
  ReturnType<typeof db.orm.public.InvitationLink.where>["update"]
>[0];

export async function findInvitationLink(id: number) {
  return db.orm.public.InvitationLink.where({ id }).first();
}

export async function findInvitationLinks(limit = 100) {
  return db.orm.public.InvitationLink.orderBy((link) => link.createdAt.desc()).limit(limit).all();
}

export async function createInvitationLink(data: CreateInvitationLinkData) {
  return db.orm.public.InvitationLink.create(data);
}

export async function updateInvitationLink(id: number, updates: UpdateInvitationLinkData) {
  return db.orm.public.InvitationLink.where({ id }).update(updates);
}

export async function deleteInvitationLink(id: number) {
  return db.orm.public.InvitationLink.where({ id }).delete();
}
