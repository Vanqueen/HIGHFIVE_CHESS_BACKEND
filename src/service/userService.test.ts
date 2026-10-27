import { access, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadedFile } from "express-fileupload";

const mocks = vi.hoisted(() => ({
  clearPendingEmailChange: vi.fn(),
  completePendingEmailChange: vi.fn(),
  deleteCloudinaryAsset: vi.fn(),
  deleteUserRecord: vi.fn(),
  findUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserByUsername: vi.fn(),
  findUsers: vi.fn(),
  getRatings: vi.fn(),
  searchActiveUsers: vi.fn(),
  restoreDeletedAccount: vi.fn(),
  savePendingEmailChange: vi.fn(),
  sendEmailChangeCode: vi.fn(),
  softDeleteAccount: vi.fn(),
  updateAccountRoleAndRevokeSessions: vi.fn(),
  updateAccountStatus: vi.fn(),
  updateAvatar: vi.fn(),
  updateUsername: vi.fn(),
  uploadCloudinaryAsset: vi.fn(),
}));

vi.mock("../repository/user.repository", () => ({
  clearPendingEmailChange: mocks.clearPendingEmailChange,
  completePendingEmailChange: mocks.completePendingEmailChange,
  findUser: mocks.findUser,
  findUserByEmail: mocks.findUserByEmail,
  findUserByUsername: mocks.findUserByUsername,
  findUsers: mocks.findUsers,
  searchActiveUsers: mocks.searchActiveUsers,
  permanentlyDeleteUser: mocks.deleteUserRecord,
  savePendingEmailChange: mocks.savePendingEmailChange,
  updateAvatar: mocks.updateAvatar,
  updateUsername: mocks.updateUsername,
}));

vi.mock("./ratingService", () => ({
  RatingService: { getForUser: mocks.getRatings },
}));

vi.mock("../repository/account.repository", () => ({
  restoreDeletedAccount: mocks.restoreDeletedAccount,
  softDeleteAccount: mocks.softDeleteAccount,
  updateAccountRoleAndRevokeSessions: mocks.updateAccountRoleAndRevokeSessions,
  updateAccountStatus: mocks.updateAccountStatus,
}));

vi.mock("../utils/cloudinary", () => ({
  default: {
    uploader: {
      destroy: mocks.deleteCloudinaryAsset,
      upload: mocks.uploadCloudinaryAsset,
    },
  },
}));

vi.mock("./emailService", () => ({
  sendEmailChangeCode: mocks.sendEmailChangeCode,
}));

import { UserService } from "./userService";

const TEST_SECRET = "test-secret-for-user-service-unit-tests-32";

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    username: "joueur",
    email: "joueur@example.com",
    pendingEmail: null,
    emailChangeCodeHash: null,
    emailChangeExpiresAt: null,
    passwordHash: "password-hash",
    avatarUrl: null,
    avatarPublicId: null,
    role: "USER" as const,
    accountStatus: "ACTIVE" as const,
    connectionStatus: "OFFLINE" as const,
    lastLoginAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    lockedUntil: null,
    ...overrides,
  };
}

function makeUploadedFile(
  bytes: Buffer,
  mimetype: string,
  onMove: (filePath: string) => void,
) {
  return {
    name: "../../client-controlled-name.png",
    size: bytes.length,
    mimetype,
    mv: async (filePath: string) => {
      onMove(filePath);
      await writeFile(filePath, bytes);
    },
  } as UploadedFile;
}

async function expectFileRemoved(filePath: string) {
  await expect(access(filePath)).rejects.toMatchObject({ code: "ENOENT" });
}

describe("UserService account changes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = TEST_SECRET;
    mocks.clearPendingEmailChange.mockResolvedValue(1);
    mocks.completePendingEmailChange.mockResolvedValue(true);
    mocks.deleteCloudinaryAsset.mockResolvedValue({ result: "ok" });
    mocks.deleteUserRecord.mockResolvedValue(1);
    mocks.findUser.mockResolvedValue(undefined);
    mocks.findUserByEmail.mockResolvedValue(undefined);
    mocks.findUserByUsername.mockResolvedValue(undefined);
    mocks.findUsers.mockResolvedValue([]);
    mocks.restoreDeletedAccount.mockResolvedValue(undefined);
    mocks.savePendingEmailChange.mockResolvedValue(1);
    mocks.sendEmailChangeCode.mockResolvedValue(undefined);
    mocks.softDeleteAccount.mockResolvedValue(undefined);
    mocks.updateAccountRoleAndRevokeSessions.mockResolvedValue(undefined);
    mocks.updateAccountStatus.mockResolvedValue(undefined);
    mocks.updateAvatar.mockResolvedValue(1);
    mocks.updateUsername.mockResolvedValue(1);
    mocks.uploadCloudinaryAsset.mockResolvedValue({
      secure_url: "https://res.cloudinary.com/demo/image/upload/v123/avatars/new.png",
      public_id: "avatars/new",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hides accounts awaiting deletion from direct lookup", async () => {
    mocks.findUser.mockResolvedValue(makeUser({ deletedAt: new Date() }));

    await expect(UserService.getUserById(7)).rejects.toMatchObject({ status: 404 });
  });

  it("searches active players by a bounded username query", async () => {
    const players = [{ id: 7, username: "Joueur", avatarUrl: null }];
    mocks.searchActiveUsers.mockResolvedValue(players);

    await expect(UserService.searchActiveUsers("  jou  ")).resolves.toEqual(players);
    expect(mocks.searchActiveUsers).toHaveBeenCalledWith("jou", 10);
  });

  it("rejects username searches that are too short", async () => {
    await expect(UserService.searchActiveUsers(" x ")).rejects.toMatchObject({ status: 422 });
    expect(mocks.searchActiveUsers).not.toHaveBeenCalled();
  });

  it("returns only safe public profile fields for active users", async () => {
    mocks.findUser.mockResolvedValue(makeUser());
    mocks.getRatings.mockResolvedValue({ overallRating: 1510 });

    await expect(UserService.getPublicProfile(7)).resolves.toEqual({
      id: 7,
      username: "joueur",
      avatarUrl: null,
      overallRating: 1510,
    });
  });

  it("hides inactive player profiles", async () => {
    mocks.findUser.mockResolvedValue(makeUser({ accountStatus: "SUSPENDED" }));

    await expect(UserService.getPublicProfile(7)).rejects.toMatchObject({ status: 404 });
  });

  it("requires an active administrator to change a user's role", async () => {
    mocks.findUser.mockResolvedValue(makeUser());

    await expect(UserService.changeUserRole(2, 7, "ADMIN"))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.updateAccountRoleAndRevokeSessions).not.toHaveBeenCalled();
  });

  it("updates a role through the session-revoking account operation", async () => {
    const admin = makeUser({ id: 2, role: "ADMIN" });
    const target = makeUser({ id: 7, role: "ORGANIZER" });
    mocks.findUser.mockResolvedValueOnce(admin);
    mocks.findUser.mockResolvedValueOnce(target);
    mocks.updateAccountRoleAndRevokeSessions.mockResolvedValue(target);

    const result = await UserService.changeUserRole(2, 7, "ORGANIZER");

    expect(result).toMatchObject({ success: true, data: { role: "ORGANIZER" } });
    expect(mocks.updateAccountRoleAndRevokeSessions).toHaveBeenCalledWith(7, "ORGANIZER");
  });

  it("sends an email change code to the normalized pending address", async () => {
    mocks.findUser.mockResolvedValue(makeUser());

    const result = await UserService.changeUserEmail(7, "  NEW@example.com ");

    expect(result).toMatchObject({ success: true });
    expect(mocks.savePendingEmailChange).toHaveBeenCalledOnce();
    const [userId, pendingEmail, codeHash, expiresAt] = mocks.savePendingEmailChange.mock.calls[0];
    expect(userId).toBe(7);
    expect(pendingEmail).toBe("new@example.com");
    expect(codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(mocks.sendEmailChangeCode).toHaveBeenCalledWith({
      to: "new@example.com",
      username: "joueur",
      code: expect.stringMatching(/^\d{6}$/),
    });
  });

  it("clears the matching pending request if delivery of its code fails", async () => {
    mocks.findUser.mockResolvedValue(makeUser());
    mocks.sendEmailChangeCode.mockRejectedValue(new Error("mail delivery failed"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(UserService.changeUserEmail(7, "new@example.com"))
      .rejects.toMatchObject({ status: 500 });

    const [, , codeHash] = mocks.savePendingEmailChange.mock.calls[0];
    expect(mocks.clearPendingEmailChange).toHaveBeenCalledWith(7, codeHash);
  });

  it("confirms a valid email code and delegates atomic session revocation", async () => {
    const code = "123456";
    const email = "new@example.com";
    const expiresAt = new Date(Date.now() + 60_000);
    const codeHash = createHmac("sha256", TEST_SECRET)
      .update(`email-change:7:${email}:${code}`)
      .digest("hex");
    const pendingUser = makeUser({
      pendingEmail: email,
      emailChangeCodeHash: codeHash,
      emailChangeExpiresAt: expiresAt,
    });
    const updatedUser = makeUser({ email });
    mocks.findUser.mockResolvedValueOnce(pendingUser).mockResolvedValueOnce(updatedUser);

    const result = await UserService.confirmUserEmailChange(7, code);

    expect(result).toMatchObject({
      success: true,
      data: { email },
    });
    expect(mocks.completePendingEmailChange).toHaveBeenCalledWith(
      7,
      email,
      codeHash,
      expiresAt,
    );
  });

  it("rejects expired email codes without completing the change", async () => {
    mocks.findUser.mockResolvedValue(makeUser({
      pendingEmail: "new@example.com",
      emailChangeCodeHash: "a".repeat(64),
      emailChangeExpiresAt: new Date(Date.now() - 1),
    }));

    await expect(UserService.confirmUserEmailChange(7, "123456"))
      .rejects.toMatchObject({ status: 400 });
    expect(mocks.completePendingEmailChange).not.toHaveBeenCalled();
  });

  it("reports a concurrent unique email collision as a conflict", async () => {
    mocks.findUser.mockResolvedValue(makeUser());
    mocks.savePendingEmailChange.mockRejectedValue({ code: "23505" });

    await expect(UserService.changeUserEmail(7, "new@example.com"))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.sendEmailChangeCode).not.toHaveBeenCalled();
  });

  it("reports concurrent username collisions as a conflict", async () => {
    mocks.findUser.mockResolvedValue(makeUser());
    mocks.updateUsername.mockRejectedValue({ code: "23505" });

    await expect(UserService.changeUsername(7, "nouveau"))
      .rejects.toMatchObject({ status: 409 });
  });

  it("rejects an image whose content does not match the declared MIME type and removes its temp file", async () => {
    mocks.findUser.mockResolvedValue(makeUser());
    let tempPath = "";
    const file = makeUploadedFile(
      Buffer.from("not an image"),
      "image/png",
      (path) => { tempPath = path; },
    );

    await expect(UserService.changeUserAvatar(7, file))
      .rejects.toMatchObject({ status: 415 });

    expect(mocks.uploadCloudinaryAsset).not.toHaveBeenCalled();
    await expectFileRemoved(tempPath);
  });

  it("stores the Cloudinary public ID and removes the previous avatar and temp file", async () => {
    const existingUser = makeUser({
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/v123/avatars/old.png",
      avatarPublicId: "avatars/old",
    });
    const updatedUser = makeUser({
      avatarUrl: "https://res.cloudinary.com/demo/image/upload/v123/avatars/new.png",
      avatarPublicId: "avatars/new",
    });
    mocks.findUser.mockResolvedValueOnce(existingUser).mockResolvedValueOnce(updatedUser);
    let tempPath = "";
    const file = makeUploadedFile(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      "image/png",
      (path) => { tempPath = path; },
    );

    const result = await UserService.changeUserAvatar(7, file);

    expect(result).toMatchObject({ success: true, data: { avatarUrl: updatedUser.avatarUrl } });
    expect(mocks.updateAvatar).toHaveBeenCalledWith(
      7,
      updatedUser.avatarUrl,
      "avatars/new",
    );
    expect(mocks.deleteCloudinaryAsset).toHaveBeenCalledWith(
      "avatars/old",
      { resource_type: "image" },
    );
    await expectFileRemoved(tempPath);
  });

  it("removes the local temp file when Cloudinary upload fails", async () => {
    mocks.findUser.mockResolvedValue(makeUser());
    mocks.uploadCloudinaryAsset.mockRejectedValue(new Error("Cloudinary unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let tempPath = "";
    const file = makeUploadedFile(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      "image/jpeg",
      (path) => { tempPath = path; },
    );

    await expect(UserService.changeUserAvatar(7, file))
      .rejects.toMatchObject({ status: 500 });
    await expectFileRemoved(tempPath);
  });

  it("deletes the newly uploaded Cloudinary asset if persisting the avatar fails", async () => {
    mocks.findUser.mockResolvedValue(makeUser());
    mocks.updateAvatar.mockRejectedValue(new Error("database unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    let tempPath = "";
    const file = makeUploadedFile(
      Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      "image/jpeg",
      (path) => { tempPath = path; },
    );

    await expect(UserService.changeUserAvatar(7, file))
      .rejects.toMatchObject({ status: 500 });

    expect(mocks.deleteCloudinaryAsset).toHaveBeenCalledWith(
      "avatars/new",
      { resource_type: "image" },
    );
    await expectFileRemoved(tempPath);
  });
});
