import { NextRequest, NextResponse } from "next/server";
import { getWhatsAppDataService } from "@/server/services/whatsappDataService";
import { ApiResponse } from "@/shared/types";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const { searchParams } = new URL(req.url);
  const refresh = searchParams.get("refresh") === "true";
  const targetWabaId = req.headers.get("x-waba-id") || req.cookies.get("active_waba_id")?.value || searchParams.get("wabaId");
  const targetProjectId = req.headers.get("x-project-id") || req.cookies.get("active_project_id")?.value || searchParams.get("projectId");

  try {
    const service = getWhatsAppDataService();
    const result = await service.getPhoneNumbers({
      refresh,
      wabaId: targetWabaId || undefined,
      projectId: targetProjectId || undefined,
    });

    if (result.phoneNumbers.length === 0 && result.metaError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.metaError.code,
            message: result.metaError.message,
            details: {
              status: result.metaError.status,
              metaErrorCode: result.metaError.metaErrorCode,
              metaSubcode: result.metaError.metaSubcode,
            },
          },
          data: [],
          meta: {
            total: 0,
            correlationId,
            timestamp: new Date().toISOString(),
          },
        },
        {
          status:
            result.metaError.status >= 400 &&
            result.metaError.status < 600
              ? result.metaError.status
              : 500,
        }
      );
    }

    const response: ApiResponse = {
      success: true,
      data: result.phoneNumbers,
      meta: {
        total: result.phoneNumbers.length,
        correlationId,
        timestamp: new Date().toISOString(),
        ...(result.metaError
          ? { warning: result.metaError.message }
          : {}),
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code || "PHONE_NUMBERS_FETCH_FAILED",
          message:
            error.message || "Failed to fetch WhatsApp phone numbers",
        },
        data: [],
        meta: {
          correlationId,
          timestamp: new Date().toISOString(),
        },
      },
      { status: error.status || 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    // Parse request body
    let body: any;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_JSON",
            message: "Invalid JSON request body",
          },
          meta: {
            correlationId,
            timestamp,
          },
        },
        { status: 400 }
      );
    }

    const {
      phoneNumberId,
      displayPhoneNumber,
      verifiedName,
      projectId,
      isDefault,
    } = body;

    // Validate display phone number or Meta phone number ID
    if (
      !phoneNumberId &&
      (typeof displayPhoneNumber !== "string" ||
        !displayPhoneNumber.trim())
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message:
              "phoneNumberId or displayPhoneNumber is required",
          },
          meta: {
            correlationId,
            timestamp,
          },
        },
        { status: 400 }
      );
    }

    // Validate isDefault
    if (
      isDefault !== undefined &&
      typeof isDefault !== "boolean"
    ) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "isDefault must be a boolean",
          },
          meta: {
            correlationId,
            timestamp,
          },
        },
        { status: 400 }
      );
    }

    const service = getWhatsAppDataService();

    let resolvedPhoneNumberId = phoneNumberId;

    // Resolve Meta phone number ID when frontend sends only
    // displayPhoneNumber.
    if (!resolvedPhoneNumberId) {
      const result = await service.getPhoneNumbers({
        refresh: true,
      });

      if (result.metaError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: result.metaError.code,
              message: result.metaError.message,
            },
            meta: {
              correlationId,
              timestamp,
            },
          },
          {
            status:
              result.metaError.status >= 400 &&
              result.metaError.status < 600
                ? result.metaError.status
                : 500,
          }
        );
      }

      // Normalize phone numbers to compare consistently.
      const normalizePhoneNumber = (value: string) =>
        value.replace(/\D/g, "");

      const requestedNumber = normalizePhoneNumber(
        displayPhoneNumber
      );

      // Find the corresponding Meta phone number.
      const matchedPhoneNumber = result.phoneNumbers.find(
        (phone: any) => {
          const metaDisplayNumber =
            phone.display_phone_number ??
            phone.displayPhoneNumber;

          if (!metaDisplayNumber) {
            return false;
          }

          return (
            normalizePhoneNumber(metaDisplayNumber) ===
            requestedNumber
          );
        }
      );

      if (!matchedPhoneNumber?.phoneNumberId) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "PHONE_NUMBER_NOT_FOUND",
              message:
                "Unable to find the Meta phone number ID for the supplied display phone number",
              details: {
                displayPhoneNumber,
              },
            },
            meta: {
              correlationId,
              timestamp,
            },
          },
          { status: 404 }
        );
      }

      resolvedPhoneNumberId = matchedPhoneNumber.phoneNumberId;
    }

    // Assign phone number to internal project.
    const updated =
      await service.assignPhoneNumberToProject(
        resolvedPhoneNumberId,
        projectId || null,
        Boolean(isDefault)
      );

    const response: ApiResponse = {
      success: true,
      data: {
        ...updated,
        phoneNumberId: resolvedPhoneNumberId,
        ...(displayPhoneNumber
          ? { displayPhoneNumber }
          : {}),
        ...(verifiedName ? { verifiedName } : {}),
      },
      meta: {
        correlationId,
        timestamp,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    const status =
      error.message?.includes("not found") ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code || "ASSIGNMENT_FAILED",
          message:
            error.message ||
            "Failed to assign phone number to project",
        },
        meta: {
          correlationId,
          timestamp,
        },
      },
      { status }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const correlationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  try {
    const { searchParams } = new URL(req.url);
    let phoneNumberId = searchParams.get("phoneNumberId");

    if (!phoneNumberId) {
      try {
        const body = await req.json();
        phoneNumberId = body?.phoneNumberId;
      } catch {
        // Optional JSON body
      }
    }

    if (!phoneNumberId || typeof phoneNumberId !== "string" || !phoneNumberId.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "phoneNumberId is required to deregister a phone number.",
          },
          meta: { correlationId, timestamp },
        },
        { status: 400 }
      );
    }

    const cleanPhoneId = phoneNumberId.trim();
    const service = getWhatsAppDataService();
    const { getMetaGraphApiClient } = await import("@/server/integrations/meta/graphApiClient");
    const metaClient = getMetaGraphApiClient();

    // 1. Deregister from Meta Graph API (POST /{PHONE_NUMBER_ID}/deregister)
    const metaResult = await metaClient.deregisterPhoneNumber(cleanPhoneId);

    // 2. Unassign from internal MSSQL project mappings
    try {
      await service.assignPhoneNumberToProject(cleanPhoneId, null, false);
    } catch {
      // Ignore assignment error if not in DB
    }

    return NextResponse.json({
      success: true,
      data: {
        phoneNumberId: cleanPhoneId,
        deregistered: true,
        metaResult: metaResult.data,
      },
      meta: {
        correlationId,
        timestamp,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code || "DEREGISTER_FAILED",
          message: error.message || "Failed to deregister phone number from Meta Graph API",
        },
        meta: { correlationId, timestamp },
      },
      { status: error.status || 500 }
    );
  }
}