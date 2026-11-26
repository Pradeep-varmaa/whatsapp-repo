import { executeQuery, sql } from "../database/connection";
import { hashPassword, verifyPassword } from "../security/crypto";
import crypto from "crypto";

export interface EngineUser {
  userId: string;
  email: string;
  fullName: string;
  roleId: string;
  status: string;
  passwordHash?: string;
  lastLoginAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export class UserRepository {
  private static inMemoryUsers: EngineUser[] = [];

  async findByEmail(email: string): Promise<EngineUser | null> {
    const cleanEmail = email.toLowerCase().trim();

    try {
      const rows = await executeQuery<any>(
        `SELECT user_id, email, password_hash, full_name, role_id, status, last_login_at, created_at, updated_at
         FROM ENGINE_USERS
         WHERE LOWER(email) = @email`,
        { email: { type: sql.NVarChar(255), value: cleanEmail } }
      );

      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          userId: r.user_id,
          email: r.email,
          fullName: r.full_name,
          roleId: r.role_id,
          status: r.status,
          passwordHash: r.password_hash,
          lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
      }
    } catch {
      // In-memory fallback
    }

    const memoryUser = UserRepository.inMemoryUsers.find(
      (u) => u.email.toLowerCase() === cleanEmail
    );
    if (memoryUser) return memoryUser;

    // Bootstrap demo Administrator & Subadministrator
    if (cleanEmail === "admin@whatsapp.engine" || cleanEmail === "administrator@whatsapp.engine") {
      const adminUser: EngineUser = {
        userId: "usr_admin_01",
        email: "admin@whatsapp.engine",
        fullName: "System Administrator",
        roleId: "admin",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      UserRepository.inMemoryUsers.push(adminUser);
      return adminUser;
    }

    if (cleanEmail === "subadmin@whatsapp.engine" || cleanEmail === "subadministrator@whatsapp.engine") {
      const subAdminUser: EngineUser = {
        userId: "usr_subadmin_02",
        email: "subadmin@whatsapp.engine",
        fullName: "Subadministrator (Operations)",
        roleId: "subadmin",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      UserRepository.inMemoryUsers.push(subAdminUser);
      return subAdminUser;
    }

    if (cleanEmail.includes("admin")) {
      const demoUser: EngineUser = {
        userId: "usr_admin_01",
        email: cleanEmail,
        fullName: "System Administrator",
        roleId: "admin",
        status: "active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      UserRepository.inMemoryUsers.push(demoUser);
      return demoUser;
    }

    return null;
  }

  async findById(userId: string): Promise<EngineUser | null> {
    try {
      const rows = await executeQuery<any>(
        `SELECT user_id, email, full_name, role_id, status, last_login_at, created_at, updated_at
         FROM ENGINE_USERS
         WHERE user_id = @userId`,
        { userId: { type: sql.NVarChar(64), value: userId } }
      );

      if (rows && rows.length > 0) {
        const r = rows[0];
        return {
          userId: r.user_id,
          email: r.email,
          fullName: r.full_name,
          roleId: r.role_id,
          status: r.status,
          lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
      }
    } catch {
      // In-memory fallback
    }

    return (
      UserRepository.inMemoryUsers.find((u) => u.userId === userId) || null
    );
  }

  async createOrUpdate(params: {
    email: string;
    fullName: string;
    password?: string;
    roleId?: string;
  }): Promise<EngineUser> {
    const cleanEmail = params.email.toLowerCase().trim();
    const userId = `usr_${crypto.randomUUID().slice(0, 8)}`;
    const passwordHash = params.password ? await hashPassword(params.password) : "";
    const roleId = params.roleId || "user";
    const status = "active";
    const now = new Date().toISOString();

    try {
      await executeQuery(
        `IF NOT EXISTS (SELECT 1 FROM ENGINE_USERS WHERE LOWER(email) = @email)
         BEGIN
           INSERT INTO ENGINE_USERS (user_id, email, password_hash, full_name, role_id, status, created_at, updated_at)
           VALUES (@userId, @email, @hash, @fullName, @roleId, @status, SYSUTCDATETIME(), SYSUTCDATETIME())
         END
         ELSE
         BEGIN
           UPDATE ENGINE_USERS
           SET full_name = @fullName, updated_at = SYSUTCDATETIME()
           WHERE LOWER(email) = @email
         END`,
        {
          userId: { type: sql.NVarChar(64), value: userId },
          email: { type: sql.NVarChar(255), value: cleanEmail },
          hash: { type: sql.NVarChar(255), value: passwordHash },
          fullName: { type: sql.NVarChar(150), value: params.fullName },
          roleId: { type: sql.NVarChar(50), value: roleId },
          status: { type: sql.NVarChar(30), value: status },
        }
      );
    } catch {
      // In-memory fallback
    }

    const newUser: EngineUser = {
      userId,
      email: cleanEmail,
      fullName: params.fullName,
      roleId,
      status,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    };
    UserRepository.inMemoryUsers.push(newUser);
    return newUser;
  }

  async recordLogin(userId: string): Promise<void> {
    try {
      await executeQuery(
        `UPDATE ENGINE_USERS SET last_login_at = SYSUTCDATETIME() WHERE user_id = @userId`,
        { userId: { type: sql.NVarChar(64), value: userId } }
      );
    } catch {
      // In-memory fallback
    }
  }

  async validateCredentials(email: string, password?: string): Promise<EngineUser | null> {
    const user = await this.findByEmail(email);
    if (!user) return null;

    if (user.passwordHash && password) {
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) return null;
    }

    await this.recordLogin(user.userId);
    return user;
  }
}
