import { ProjectRepository } from "../repositories/projectRepository";
import { PhoneNumberRepository } from "../repositories/phoneNumberRepository";
import { Project, PhoneNumber } from "@/shared/types";
import crypto from "crypto";

export class ProjectService {
  private repo = new ProjectRepository();
  private phoneRepo = new PhoneNumberRepository();

  async listProjects(): Promise<Project[]> {
    return await this.repo.findAll();
  }

  async createProject(data: {
    name: string;
    description?: string | null;
    callbackUrl?: string | null;
    eventTypes?: string[];
    status?: "active" | "inactive" | "archived";
    phoneNumberId?: string | null;
    newPhoneNumber?: string | null;
    verifiedName?: string | null;
  }): Promise<Project> {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const projectId = `proj_${slug}_${Math.random().toString(36).substring(2, 6)}`;
    const secret = `whsec_live_${crypto.randomBytes(16).toString("hex")}`;

    const project = await this.repo.create({
      projectId,
      name: data.name,
      slug,
      description: data.description || null,
      status: data.status || "active",
      callbackUrl: data.callbackUrl || null,
      eventTypes: data.eventTypes || ["message.received"],
      webhookSigningSecret: secret,
      totalMessages: 0,
      phoneNumbersCount: 0,
    });

    // Handle Phone Number mapping
    if (data.phoneNumberId) {
      await this.phoneRepo.assignToProject(data.phoneNumberId, projectId, data.name);
    } else if (data.newPhoneNumber) {
      const newPhone: PhoneNumber = {
        phoneNumberId: `phone_${Date.now()}`,
        wabaId: "waba_central_production",
        wabaName: "Engine Central WABA",
        displayPhoneNumber: data.newPhoneNumber,
        verifiedName: data.verifiedName || data.name,
        qualityRating: "GREEN",
        codeVerificationStatus: "VERIFIED",
        messagingLimitTier: "TIER_100K",
        status: "CONNECTED",
        isDefault: true,
        projectId: project.projectId,
        projectName: project.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.phoneRepo.create(newPhone);
    }

    return project;
  }

  async updateProject(projectId: string, partial: Partial<Project>): Promise<Project | null> {
    return await this.repo.update(projectId, partial);
  }

  async softDeleteProject(projectId: string): Promise<Project | null> {
    return await this.repo.softDelete(projectId);
  }
}
