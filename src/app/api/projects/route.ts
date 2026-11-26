import { NextRequest, NextResponse } from "next/server";
import { ProjectService } from "@/server/services/projectService";
import { createProjectSchema } from "@/shared/schemas";
import { ApiResponse } from "@/shared/types";
import crypto from "crypto";

export async function GET() {
  const correlationId = crypto.randomUUID();
  try {
    const service = new ProjectService();
    const projects = await service.listProjects();
    const activeProjects = projects.filter((p) => p.status !== "archived");

    const response: ApiResponse = {
      success: true,
      data: activeProjects,
      meta: {
        total: activeProjects.length,
        correlationId,
        timestamp: new Date().toISOString(),
      },
    };
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROJECT_FETCH_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const body = await req.json();
    const parsed = createProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid project parameters",
            details: parsed.error.format(),
          },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    const service = new ProjectService();
    const newProject = await service.createProject(parsed.data);

    const response: ApiResponse = {
      success: true,
      data: newProject,
      meta: { correlationId, timestamp: new Date().toISOString() },
    };
    return NextResponse.json(response, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROJECT_CREATION_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId") || searchParams.get("id");

    if (!projectId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "BAD_REQUEST", message: "projectId is required" },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 400 }
      );
    }

    const service = new ProjectService();
    const archived = await service.softDeleteProject(projectId);

    if (!archived) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Project not found" },
          meta: { correlationId, timestamp: new Date().toISOString() },
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { projectId, status: "archived" },
      meta: { correlationId, timestamp: new Date().toISOString() },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "PROJECT_DELETE_FAILED", message: error.message },
        meta: { correlationId, timestamp: new Date().toISOString() },
      },
      { status: 500 }
    );
  }
}
