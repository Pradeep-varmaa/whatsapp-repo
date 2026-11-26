import { Project } from "@/shared/types";
import { executeQuery, sql } from "../database/connection";
import { PhoneNumberRepository } from "./phoneNumberRepository";

export class ProjectRepository {
  private static inMemory: Project[] = [];

  async findAll(): Promise<Project[]> {
    let list: Project[] = [];

    try {
      const rows = await executeQuery<any>(
        `SELECT project_id, waba_id, name, slug, description, status, callback_url, event_types_json, webhook_signing_secret, created_at, updated_at
         FROM ENGINE_PROJECTS
         ORDER BY created_at DESC`
      );

      if (rows && rows.length > 0) {
        list = rows.map((r) => ({
          projectId: r.project_id,
          wabaId: r.waba_id || null,
          name: r.name,
          slug: r.slug,
          description: r.description,
          status: r.status,
          callbackUrl: r.callback_url,
          eventTypes: JSON.parse(r.event_types_json || "[]"),
          webhookSigningSecret: r.webhook_signing_secret,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        }));
      }
    } catch {
      // Database offline or table not ready, use in-memory
    }

    if (list.length === 0) {
      list = [...ProjectRepository.inMemory];
    } else {
      for (const p of ProjectRepository.inMemory) {
        if (!list.some((existing) => existing.projectId === p.projectId)) {
          list.push(p);
        }
      }
    }

    if (list.length === 0) {
      try {
        const { getWhatsAppDataService } = await import("../services/whatsappDataService");
        const dataService = getWhatsAppDataService();
        const { phoneNumbers, wabas } = await dataService.getPhoneNumbers();
        const defaultWabaId = wabas && wabas.length > 0 ? wabas[0].id : null;

        for (const phone of phoneNumbers) {
          const name = phone.projectName || phone.verifiedName || phone.displayPhoneNumber;
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          list.push({
            projectId: phone.projectId || `proj_${phone.phoneNumberId}`,
            wabaId: phone.wabaId || defaultWabaId,
            name,
            slug: slug || "whatsapp-channel",
            description: `Live WhatsApp Business channel for ${phone.displayPhoneNumber}`,
            status: "active",
            callbackUrl: "https://yourdomain.com/webhooks/whatsapp/meta",
            eventTypes: ["message.received", "message.sent", "message.delivered"],
            webhookSigningSecret: "whsec_live_central_engine",
            createdAt: phone.createdAt || new Date().toISOString(),
            updatedAt: phone.updatedAt || new Date().toISOString(),
            phoneNumbersCount: 1,
            totalMessages: 0,
          });
        }
      } catch {
        // Fallback
      }
    }

    try {
      const { PhoneNumberRepository } = await import("./phoneNumberRepository");
      const phoneRepo = new PhoneNumberRepository();
      const assignments = await phoneRepo.getProjectAssignments();

      return list.map((p) => {
        let count = 0;
        for (const assign of assignments.values()) {
          if (assign.projectId === p.projectId) {
            count++;
          }
        }
        return {
          ...p,
          phoneNumbersCount: count,
        };
      });
    } catch {
      return list;
    }
  }

  async findById(projectId: string): Promise<Project | null> {
    const all = await this.findAll();
    return all.find((p) => p.projectId === projectId) || null;
  }

  /**
   * Find all projects belonging to a specific WhatsApp Account (WABA ID)
   */
  async findByWabaId(wabaId: string): Promise<Project[]> {
    const all = await this.findAll();
    
    // First, check explicit wabaId on project
    const directMatches = all.filter((p) => p.wabaId === wabaId);
    if (directMatches.length > 0) {
      return directMatches;
    }

    // Second, check WA_PROJECT_MAPPINGS link
    try {
      const rows = await executeQuery<any>(
        `SELECT DISTINCT project_id FROM WA_PROJECT_MAPPINGS WHERE waba_id = @wabaId`,
        { wabaId: { type: sql.NVarChar(64), value: wabaId } }
      );
      if (rows && rows.length > 0) {
        const mappedIds = new Set(rows.map((r) => r.project_id));
        const mappedProjects = all.filter((p) => mappedIds.has(p.projectId));
        if (mappedProjects.length > 0) return mappedProjects;
      }
    } catch {
      // In-memory fallback
    }

    // Default fallback: if projects haven't been tagged with a wabaId yet, associate unassigned ones
    return all.filter((p) => !p.wabaId || p.wabaId === wabaId);
  }

  /**
   * Verify if a project belongs to a WhatsApp Account
   */
  async verifyProjectBelongsToWaba(projectId: string, wabaId: string): Promise<Project | null> {
    const projects = await this.findByWabaId(wabaId);
    return projects.find((p) => p.projectId === projectId) || null;
  }

  async create(project: Omit<Project, "createdAt" | "updatedAt">): Promise<Project> {
    const now = new Date().toISOString();
    const newProject: Project = {
      ...project,
      createdAt: now,
      updatedAt: now,
      phoneNumbersCount: 0,
      totalMessages: 0,
    };

    try {
      await executeQuery(
        `INSERT INTO ENGINE_PROJECTS (project_id, waba_id, name, slug, description, status, callback_url, event_types_json, webhook_signing_secret, created_at, updated_at)
         VALUES (@projectId, @wabaId, @name, @slug, @desc, @status, @callbackUrl, @eventTypes, @secret, SYSUTCDATETIME(), SYSUTCDATETIME())`,
        {
          projectId: { type: sql.NVarChar(64), value: newProject.projectId },
          wabaId: { type: sql.NVarChar(64), value: newProject.wabaId || null },
          name: { type: sql.NVarChar(150), value: newProject.name },
          slug: { type: sql.NVarChar(100), value: newProject.slug },
          desc: { type: sql.NVarChar(500), value: newProject.description || null },
          status: { type: sql.NVarChar(30), value: newProject.status },
          callbackUrl: { type: sql.NVarChar(500), value: newProject.callbackUrl || null },
          eventTypes: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(newProject.eventTypes || []) },
          secret: { type: sql.NVarChar(255), value: newProject.webhookSigningSecret || null },
        }
      );
    } catch {
      // In-memory fallback
    }

    ProjectRepository.inMemory.unshift(newProject);
    return newProject;
  }

  /**
   * Soft delete a project by archiving it
   */
  async softDelete(projectId: string): Promise<Project | null> {
    return this.update(projectId, { status: "archived" });
  }

  async update(projectId: string, partial: Partial<Project>): Promise<Project | null> {
    const existing = await this.findById(projectId);
    if (!existing) return null;

    const updated: Project = {
      ...existing,
      ...partial,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (partial.status !== undefined || partial.callbackUrl || partial.wabaId) {
        await executeQuery(
          `UPDATE ENGINE_PROJECTS 
           SET status = COALESCE(@status, status),
               callback_url = COALESCE(@callbackUrl, callback_url), 
               waba_id = COALESCE(@wabaId, waba_id), 
               updated_at = SYSUTCDATETIME() 
           WHERE project_id = @projectId`,
          {
            projectId: { type: sql.NVarChar(64), value: projectId },
            status: { type: sql.NVarChar(30), value: partial.status || null },
            callbackUrl: { type: sql.NVarChar(500), value: partial.callbackUrl || null },
            wabaId: { type: sql.NVarChar(64), value: partial.wabaId || null },
          }
        );
      }
    } catch {
      // In-memory fallback
    }

    const idx = ProjectRepository.inMemory.findIndex((p) => p.projectId === projectId);
    if (idx !== -1) {
      ProjectRepository.inMemory[idx] = updated;
    } else {
      ProjectRepository.inMemory.unshift(updated);
    }
    return updated;
  }
}
