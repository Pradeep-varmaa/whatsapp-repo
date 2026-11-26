import { getServerConfig } from "@/server/config";
import { generateAppSecretProof } from "@/server/security/crypto";
import { logger } from "@/server/security/logger";

export interface MetaGraphErrorDetail {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
}

export class MetaGraphApiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly metaErrorCode?: number;
  public readonly metaSubcode?: number;
  public readonly metaType?: string;
  public readonly fbtraceId?: string;
  public readonly isPermanent: boolean;

  constructor(
    message: string,
    options: {
      code: string;
      status: number;
      metaErrorCode?: number;
      metaSubcode?: number;
      metaType?: string;
      fbtraceId?: string;
      isPermanent?: boolean;
    }
  ) {
    super(message);
    this.name = "MetaGraphApiError";
    this.code = options.code;
    this.status = options.status;
    this.metaErrorCode = options.metaErrorCode;
    this.metaSubcode = options.metaSubcode;
    this.metaType = options.metaType;
    this.fbtraceId = options.fbtraceId;
    this.isPermanent = options.isPermanent ?? false;
  }
}

/**
 * Maps Meta Graph API error codes to human-readable explanations and retryability
 */
export function mapMetaError(rawError: MetaGraphErrorDetail, httpStatus: number): MetaGraphApiError {
  const code = rawError.code;
  const subcode = rawError.error_subcode;
  let humanMessage = rawError.message;
  let classifiedCode = "META_GRAPH_ERROR";
  let isPermanent = false;

  switch (code) {
    case 190:
      classifiedCode = "META_TOKEN_EXPIRED_OR_INVALID";
      humanMessage = "Meta Access Token has expired, been revoked, or is invalid. Re-authentication required.";
      isPermanent = true;
      break;
    case 133004:
    case 133005:
      classifiedCode = "META_PHONE_IN_USE_APP";
      humanMessage = "This phone number is currently in use by the WhatsApp mobile app. Please delete the account from the mobile app (Settings > Account > Delete Account) before onboarding to WhatsApp Cloud API.";
      isPermanent = true;
      break;
    case 133006:
      classifiedCode = "META_PHONE_NOT_ELIGIBLE";
      humanMessage = "This phone number is not eligible for use with WhatsApp Business Cloud API.";
      isPermanent = true;
      break;
    case 133008:
      classifiedCode = "META_TOO_MANY_CODE_REQUESTS";
      humanMessage = "Too many verification code requests for this phone number. Please wait a few hours before requesting another code.";
      isPermanent = false;
      break;
    case 133009:
      classifiedCode = "META_CODE_DELIVERY_FAILED";
      humanMessage = "Cannot deliver verification code via the selected method. Please try the alternate delivery method (SMS or Voice call).";
      isPermanent = false;
      break;
    case 133010:
      classifiedCode = "META_PHONE_ALREADY_REGISTERED";
      humanMessage = "This phone number is already registered to a WhatsApp account or WhatsApp Business Account.";
      isPermanent = true;
      break;
    case 133012:
      classifiedCode = "META_PIN_INCORRECT";
      humanMessage = "The two-step verification PIN you entered is incorrect. Please check the 6-digit PIN and try again.";
      isPermanent = false;
      break;
    case 133015:
      classifiedCode = "META_CODE_INCORRECT";
      humanMessage = "Incorrect verification code. Please check the 6-digit code and try again.";
      isPermanent = false;
      break;
    case 133016:
      classifiedCode = "META_TOO_MANY_ATTEMPTS";
      humanMessage = "Too many failed attempts. Please wait a while before requesting or trying another code.";
      isPermanent = false;
      break;
    case 100:
      classifiedCode = "META_INVALID_PARAMETER";
      if (rawError.message?.toLowerCase().includes("phone") || rawError.message?.toLowerCase().includes("number")) {
        humanMessage = "Invalid phone number format or country code. Ensure digits are valid E.164 without leading zeros or special characters.";
      } else {
        humanMessage = `Invalid parameter or wrong ID provided to Meta Graph API (${rawError.message}).`;
      }
      isPermanent = true;
      break;
    case 131030:
      classifiedCode = "META_RECIPIENT_NOT_ALLOWED";
      humanMessage = "Recipient phone number is not in the development allowlist for this WhatsApp account.";
      isPermanent = true;
      break;
    case 131047:
      classifiedCode = "META_24H_WINDOW_EXPIRED";
      humanMessage = "Cannot send non-template message outside the 24-hour customer care window. Send a template message instead.";
      isPermanent = true;
      break;
    case 131056:
      classifiedCode = "META_PAIR_RATE_LIMIT";
      humanMessage = "Message pair rate limit hit: Too many messages sent between this business phone and customer.";
      isPermanent = false;
      break;
    case 4:
    case 17:
    case 32:
    case 613:
      classifiedCode = "META_RATE_LIMIT_EXCEEDED";
      humanMessage = "Meta Graph API rate limit reached. Request will be retried with exponential backoff.";
      isPermanent = false;
      break;
    default:
      if (httpStatus >= 500) {
        classifiedCode = "META_SERVER_ERROR";
        humanMessage = "Meta Graph API service is temporarily unavailable or returned a 5xx error.";
        isPermanent = false;
      }
      break;
  }

  return new MetaGraphApiError(humanMessage, {
    code: classifiedCode,
    status: httpStatus,
    metaErrorCode: code,
    metaSubcode: subcode,
    metaType: rawError.type,
    fbtraceId: rawError.fbtrace_id,
    isPermanent,
  });
}

// In-memory 60s TTL cache stamped with fetch time (never silent fake data)
interface CachedResponse<T> {
  data: T;
  fetchedAt: string;
  expiresAt: number;
}
const liveMetaCache = new Map<string, CachedResponse<any>>();

export class MetaGraphApiClient {
  private readonly version: string;
  private readonly baseUrl: string;
  private readonly customCredentials?: { token: string; appSecret?: string };

  constructor(customCredentials?: { token: string; appSecret?: string }) {
    const config = getServerConfig();
    this.version = config.META_GRAPH_API_VERSION || "v25.0";
    this.baseUrl = `https://graph.facebook.com/${this.version}`;
    this.customCredentials = customCredentials;
  }

  private getCredentials(): { token: string; appSecret: string } {
    if (this.customCredentials?.token) {
      const config = getServerConfig();
      return {
        token: this.customCredentials.token.trim(),
        appSecret: (this.customCredentials.appSecret || config.APP_SECRET || "").trim(),
      };
    }

    const config = getServerConfig();
    const token = config.WHATSAPP_ACCESS_TOKEN || config.ACCESS_TOKEN;
    const appSecret = config.APP_SECRET || "";

    if (!token) {
      throw new MetaGraphApiError(
        "WHATSAPP_ACCESS_TOKEN is missing or empty in configuration.",
        { code: "META_CREDENTIALS_MISSING", status: 401, isPermanent: true }
      );
    }
    return { token: token.trim(), appSecret: appSecret.trim() };
  }

  /**
   * Unified live call handler with appsecret_proof, DNS failure detection, and timing
   */
  async request<T>(
    endpoint: string,
    options?: {
      method?: "GET" | "POST" | "DELETE";
      params?: Record<string, string | number | undefined>;
      body?: any;
      timeoutMs?: number;
      useCache?: boolean;
    }
  ): Promise<{ data: T; fetchedAt: string }> {
    const { token, appSecret } = this.getCredentials();
    const method = options?.method || "GET";

    let targetUrl: URL;
    if (endpoint.startsWith("https://") || endpoint.startsWith("http://")) {
      targetUrl = new URL(endpoint);
    } else {
      const cleanPath = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
      targetUrl = new URL(`${this.baseUrl}/${cleanPath}`);
    }

    if (options?.params) {
      for (const [key, val] of Object.entries(options.params)) {
        if (val !== undefined && val !== null) {
          targetUrl.searchParams.set(key, String(val));
        }
      }
    }

    // Attach appsecret_proof for high security
    if (appSecret) {
      targetUrl.searchParams.set("appsecret_proof", generateAppSecretProof(token, appSecret));
    }

    const tokenFingerprint = token.slice(-12);
    const cacheKey = `${method}:${tokenFingerprint}:${targetUrl.toString()}`;
    const now = Date.now();

    if (method === "GET" && options?.useCache) {
      const cached = liveMetaCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return { data: cached.data as T, fetchedAt: cached.fetchedAt };
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 15000);

    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };
      if (options?.body) {
        headers["Content-Type"] = "application/json";
      }

      const res = await fetch(targetUrl.toString(), {
        method,
        headers,
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const responseText = await res.text();
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(responseText);
      } catch {
        parsedJson = { raw: responseText };
      }

      if (!res.ok) {
        if (parsedJson?.error) {
          throw mapMetaError(parsedJson.error, res.status);
        }
        throw new MetaGraphApiError(`Meta HTTP ${res.status}: ${responseText}`, {
          code: `META_HTTP_${res.status}`,
          status: res.status,
          isPermanent: res.status === 400 || res.status === 401 || res.status === 403,
        });
      }

      const fetchedAt = new Date().toISOString();
      if (method === "GET" && options?.useCache) {
        liveMetaCache.set(cacheKey, {
          data: parsedJson,
          fetchedAt,
          expiresAt: now + 60000, // Max 60-second live cache per spec
        });
      }

      return { data: parsedJson as T, fetchedAt };
    } catch (err: any) {
      if (err instanceof MetaGraphApiError) {
        throw err;
      }
      if (err.name === "AbortError") {
        throw new MetaGraphApiError("Meta Graph API request timed out after 15s.", {
          code: "META_TIMEOUT",
          status: 504,
          isPermanent: false,
        });
      }
      if (err.code === "ENOTFOUND" || err.message?.includes("ENOTFOUND")) {
        throw new MetaGraphApiError("DNS resolution failed for graph.facebook.com (ENOTFOUND). Check network connectivity.", {
          code: "META_DNS_FAILURE",
          status: 502,
          isPermanent: false,
        });
      }
      throw new MetaGraphApiError(`Network error communicating with Meta: ${err.message}`, {
        code: "META_NETWORK_ERROR",
        status: 502,
        isPermanent: false,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Discover WABAs
   */
  async discoverAllWabas(options?: { bypassCache?: boolean }): Promise<MetaWabaRecord[]> {
    const config = getServerConfig();
    const wabaId = config.WHATSAPP_WABA_ID;
    if (!wabaId) return [];

    try {
      const res = await this.request<any>(`/${wabaId}`, {
        params: { fields: "id,name,currency,timezone_id" },
        useCache: !options?.bypassCache,
      });
      return [
        {
          id: res.data.id || wabaId,
          name: res.data.name || "WhatsApp Business Account",
          currency: res.data.currency,
          timezone_id: res.data.timezone_id,
        },
      ];
    } catch {
      return [{ id: wabaId, name: "WhatsApp Business Account" }];
    }
  }

  /**
   * Fetch WABA Phone Numbers
   */
  async fetchWabaPhoneNumbers(wabaId: string, options?: { bypassCache?: boolean }): Promise<MetaPhoneNumberRecord[]> {
    const { numbers } = await this.getLivePhoneNumbers(wabaId, options);
    return numbers;
  }

  /**
   * Fetch WABA Details
   */
  async fetchWabaDetails(wabaId: string, options?: { bypassCache?: boolean }): Promise<MetaWabaRecord | null> {
    const wabas = await this.discoverAllWabas(options);
    return wabas[0] || null;
  }

  /**
   * Live inspection of Access Token
   */
  async debugToken(): Promise<{
    isValid: boolean;
    expiresAt?: string;
    scopes: string[];
    appId?: string;
    wabaId?: string;
    error?: string;
    fetchedAt: string;
  }> {
    const { token, appSecret } = this.getCredentials();
    const config = getServerConfig();

    try {
      const res = await this.request<any>("debug_token", {
        params: { input_token: token },
        useCache: false,
      });

      const d = res.data?.data;
      return {
        isValid: Boolean(d?.is_valid),
        expiresAt: d?.expires_at ? new Date(d.expires_at * 1000).toISOString() : undefined,
        scopes: d?.scopes || [],
        appId: d?.app_id,
        wabaId: config.WHATSAPP_WABA_ID,
        fetchedAt: res.fetchedAt,
      };
    } catch (err: any) {
      return {
        isValid: false,
        scopes: [],
        error: err.message,
        fetchedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Fetch Live Phone Numbers for WABA
   */
  async getLivePhoneNumbers(wabaId: string, options?: { bypassCache?: boolean }): Promise<{ numbers: any[]; fetchedAt: string }> {
    const res = await this.request<any>(`/${wabaId}/phone_numbers`, {
      params: {
        fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,status,messaging_limit_tier",
      },
      useCache: !options?.bypassCache,
    });
    return { numbers: res.data?.data || [], fetchedAt: res.fetchedAt };
  }

  /**
   * Fetch Live Message Templates for WABA
   */
  async getLiveTemplates(wabaId: string, options?: { bypassCache?: boolean }): Promise<{ templates: any[]; fetchedAt: string }> {
    const res = await this.request<any>(`/${wabaId}/message_templates`, {
      params: { fields: "id,name,status,category,language,components" },
      useCache: !options?.bypassCache,
    });
    return { templates: res.data?.data || [], fetchedAt: res.fetchedAt };
  }

  /**
   * Create Live Message Template for WABA
   */
  async createLiveTemplate(
    wabaId: string,
    template: {
      name: string;
      category: string;
      language: string;
      components: any[];
    }
  ): Promise<{ id: string; status?: string }> {
    const res = await this.request<{ id: string; status?: string }>(
      `/${wabaId}/message_templates`,
      {
        method: "POST",
        body: template,
      }
    );
    liveMetaCache.delete(`GET:/${wabaId}/message_templates`);
    return res.data;
  }

  /**
   * Delete Live Message Template for WABA
   */
  async deleteLiveTemplate(wabaId: string, name: string): Promise<{ success: boolean }> {
    const res = await this.request<{ success: boolean }>(
      `/${wabaId}/message_templates`,
      {
        method: "DELETE",
        params: { name },
      }
    );
    liveMetaCache.delete(`GET:/${wabaId}/message_templates`);
    return res.data;
  }

  /**
   * Fetch Live Subscribed Apps for WABA
   */
  async getLiveSubscribedApps(wabaId: string, options?: { bypassCache?: boolean }): Promise<{ apps: any[]; fetchedAt: string }> {
    const res = await this.request<any>(`/${wabaId}/subscribed_apps`, {
      useCache: !options?.bypassCache,
    });
    const rawApps = Array.isArray(res.data?.data) ? res.data.data : [];
    const apps = rawApps.map((item: any) => {
      const d = item.whatsapp_business_api_data || item;
      const id = String(d.id || item.id || "");
      const name = String(d.name || item.name || "WhatsApp Business App");
      const link = String(d.link || item.link || (id ? `https://developers.facebook.com/apps/${id}` : ""));
      return { id, name, link };
    });
    return { apps, fetchedAt: res.fetchedAt };
  }

  /**
   * Clear cache entries matching a path substring or all if omitted
   */
  clearCache(pathSubstring?: string) {
    if (!pathSubstring) {
      liveMetaCache.clear();
      return;
    }
    for (const key of liveMetaCache.keys()) {
      if (key.includes(pathSubstring)) {
        liveMetaCache.delete(key);
      }
    }
  }

  /**
   * Subscribe Meta app to WABA
   */
  async subscribeAppToWaba(wabaId: string, appId?: string): Promise<{ success: boolean; data: any }> {
    const params: Record<string, string> = {};
    if (appId) {
      params.subscribed_app = appId.trim();
    }
    const res = await this.request<any>(`/${wabaId}/subscribed_apps`, {
      method: "POST",
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    this.clearCache(`/${wabaId}/subscribed_apps`);
    return { success: Boolean(res.data?.success), data: res.data };
  }

  /**
   * Unsubscribe Meta app from WABA (Delete Subscription)
   */
  async unsubscribeAppFromWaba(wabaId: string, appId?: string): Promise<{ success: boolean; data: any }> {
    const params: Record<string, string> = {};
    if (appId) {
      params.subscribed_app = appId.trim();
    }
    const res = await this.request<any>(`/${wabaId}/subscribed_apps`, {
      method: "DELETE",
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    this.clearCache(`/${wabaId}/subscribed_apps`);
    return { success: Boolean(res.data?.success), data: res.data };
  }

  /**
   * Add a new phone number to WABA (Meta Graph API: POST /{WABA_ID}/phone_numbers)
   */
  async addPhoneNumberToWaba(
    wabaId: string,
    params: { cc: string; phoneNumber: string; verifiedName: string }
  ): Promise<{ id: string }> {
    const cleanCc = params.cc.replace(/\D/g, "");
    const cleanPhone = params.phoneNumber.replace(/\D/g, "");
    const verifiedName = params.verifiedName.trim();

    const res = await this.request<{ id: string }>(`/${wabaId}/phone_numbers`, {
      method: "POST",
      body: {
        cc: cleanCc,
        phone_number: cleanPhone,
        verified_name: verifiedName,
      },
    });

    const newId = res.data?.id;
    if (!newId) {
      throw new MetaGraphApiError("Meta Graph API did not return a phone number ID.", {
        code: "META_MISSING_PHONE_ID",
        status: 502,
      });
    }

    this.clearCache(`/${wabaId}/phone_numbers`);
    return { id: String(newId) };
  }

  /**
   * Request a 6-digit verification code via SMS or VOICE (Meta Graph API: POST /{PHONE_NUMBER_ID}/request_code)
   */
  async requestPhoneNumberCode(
    phoneNumberId: string,
    params: { method: "SMS" | "VOICE"; language?: string }
  ): Promise<{ success: boolean; data: any }> {
    const cleanPhoneId = phoneNumberId.trim();
    const res = await this.request<any>(`/${cleanPhoneId}/request_code`, {
      method: "POST",
      body: {
        code_method: params.method,
        language: params.language || "en_US",
      },
    });

    return { success: Boolean(res.data?.success ?? true), data: res.data };
  }

  /**
   * Verify the 6-digit verification code (Meta Graph API: POST /{PHONE_NUMBER_ID}/verify_code)
   */
  async verifyPhoneNumberCode(
    phoneNumberId: string,
    code: string
  ): Promise<{ success: boolean; data: any }> {
    const cleanPhoneId = phoneNumberId.trim();
    const cleanCode = code.trim();

    const res = await this.request<any>(`/${cleanPhoneId}/verify_code`, {
      method: "POST",
      body: {
        code: cleanCode,
      },
    });

    const config = getServerConfig();
    this.clearCache(`/${config.WHATSAPP_WABA_ID}/phone_numbers`);
    this.clearCache(`/${cleanPhoneId}`);

    return { success: Boolean(res.data?.success ?? true), data: res.data };
  }

  /**
   * Fetch specific phone number details from Meta (Meta Graph API: GET /{PHONE_NUMBER_ID})
   */
  async getPhoneNumberDetails(phoneNumberId: string): Promise<MetaPhoneNumberRecord> {
    const cleanPhoneId = phoneNumberId.trim();
    const res = await this.request<any>(`/${cleanPhoneId}`, {
      params: {
        fields: "id,display_phone_number,verified_name,quality_rating,code_verification_status,status,messaging_limit_tier",
      },
      useCache: false,
    });

    return {
      id: res.data?.id || cleanPhoneId,
      display_phone_number: res.data?.display_phone_number,
      verified_name: res.data?.verified_name,
      quality_rating: res.data?.quality_rating,
      code_verification_status: res.data?.code_verification_status,
      status: res.data?.status,
      messaging_limit_tier: res.data?.messaging_limit_tier,
    };
  }

  /**
   * Register a Phone Number with 6-digit Two-Step Verification PIN
   */
  async registerPhoneNumber(phoneNumberId: string, pin: string): Promise<{ success: boolean; data: any }> {
    const cleanPin = pin.trim();
    if (!/^\d{6}$/.test(cleanPin)) {
      throw new MetaGraphApiError("PIN must be a 6-digit numeric string.", {
        code: "INVALID_PIN",
        status: 400,
        isPermanent: true,
      });
    }

    const res = await this.request<any>(`/${phoneNumberId}/register`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        pin: cleanPin,
      },
    });
    const config = getServerConfig();
    this.clearCache(`/${config.WHATSAPP_WABA_ID}/phone_numbers`);
    this.clearCache(`/${phoneNumberId}`);
    return { success: Boolean(res.data?.success), data: res.data };
  }

  /**
   * Deregister a Phone Number from WhatsApp Cloud API
   */
  async deregisterPhoneNumber(phoneNumberId: string): Promise<{ success: boolean; data: any }> {
    const res = await this.request<any>(`/${phoneNumberId}/deregister`, {
      method: "POST",
    });
    const config = getServerConfig();
    this.clearCache(`/${config.WHATSAPP_WABA_ID}/phone_numbers`);
    this.clearCache(`/${phoneNumberId}`);
    return { success: Boolean(res.data?.success), data: res.data };
  }

  /**
   * Send text message directly via Graph API
   */
  async sendTextMessage(params: {
    phoneNumberId: string;
    recipientPhone: string;
    text: string;
  }): Promise<{ wamid: string }> {
    const res = await this.request<any>(`/${params.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientPhone.replace(/\D/g, ""),
        type: "text",
        text: { preview_url: false, body: params.text },
      },
    });

    const wamid = res.data?.messages?.[0]?.id;
    if (!wamid) {
      throw new MetaGraphApiError("Meta responded without message ID (wamid)", {
        code: "META_NO_MESSAGE_ID",
        status: 502,
      });
    }
    return { wamid };
  }

  /**
   * Send template message directly via Graph API
   */
  async sendTemplateMessage(params: {
    phoneNumberId: string;
    recipientPhone: string;
    templateName: string;
    languageCode?: string;
    components?: any[];
  }): Promise<{ wamid: string }> {
    const res = await this.request<any>(`/${params.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientPhone.replace(/\D/g, ""),
        type: "template",
        template: {
          name: params.templateName,
          language: { code: params.languageCode || "en_US" },
          components: params.components,
        },
      },
    });

    const wamid = res.data?.messages?.[0]?.id;
    if (!wamid) {
      throw new MetaGraphApiError("Meta responded without message ID (wamid)", {
        code: "META_NO_MESSAGE_ID",
        status: 502,
      });
    }
    return { wamid };
  }

  /**
   * Send interactive button quick replies via Graph API
   */
  async sendInteractiveButtons(params: {
    phoneNumberId: string;
    recipientPhone: string;
    text: string;
    buttons: Array<{ id: string; title: string }>;
  }): Promise<{ wamid: string }> {
    const formattedButtons = params.buttons.slice(0, 3).map((b) => ({
      type: "reply",
      reply: {
        id: b.id,
        title: b.title.slice(0, 20),
      },
    }));

    const res = await this.request<any>(`/${params.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientPhone.replace(/\D/g, ""),
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: params.text },
          action: { buttons: formattedButtons },
        },
      },
    });

    const wamid = res.data?.messages?.[0]?.id;
    if (!wamid) {
      throw new MetaGraphApiError("Meta responded without message ID (wamid)", {
        code: "META_NO_MESSAGE_ID",
        status: 502,
      });
    }
    return { wamid };
  }

  /**
   * Send interactive list menu via Graph API
   */
  async sendInteractiveList(params: {
    phoneNumberId: string;
    recipientPhone: string;
    text: string;
    buttonText?: string;
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>;
  }): Promise<{ wamid: string }> {
    const formattedSections = params.sections.map((sec) => ({
      title: sec.title || "Options",
      rows: sec.rows.slice(0, 10).map((r) => ({
        id: r.id,
        title: r.title.slice(0, 24),
        description: r.description ? r.description.slice(0, 72) : undefined,
      })),
    }));

    const res = await this.request<any>(`/${params.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientPhone.replace(/\D/g, ""),
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: params.text },
          action: {
            button: (params.buttonText || "Select Option").slice(0, 20),
            sections: formattedSections,
          },
        },
      },
    });

    const wamid = res.data?.messages?.[0]?.id;
    if (!wamid) {
      throw new MetaGraphApiError("Meta responded without message ID (wamid)", {
        code: "META_NO_MESSAGE_ID",
        status: 502,
      });
    }
    return { wamid };
  }

  /**
   * Send rich media message (image, document, audio, video) by URL or media ID
   */
  async sendMediaMessage(params: {
    phoneNumberId: string;
    recipientPhone: string;
    mediaType: "image" | "document" | "audio" | "video";
    mediaUrl?: string;
    mediaId?: string;
    caption?: string;
    filename?: string;
  }): Promise<{ wamid: string }> {
    const mediaPayload: Record<string, any> = {};
    if (params.mediaId) mediaPayload.id = params.mediaId;
    else if (params.mediaUrl) mediaPayload.link = params.mediaUrl;
    if (params.caption && (params.mediaType === "image" || params.mediaType === "document" || params.mediaType === "video")) {
      mediaPayload.caption = params.caption;
    }
    if (params.filename && params.mediaType === "document") {
      mediaPayload.filename = params.filename;
    }

    const res = await this.request<{ messages: Array<{ id: string }> }>(`${params.phoneNumberId}/messages`, {
      method: "POST",
      body: {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: params.recipientPhone.replace(/\D/g, ""),
        type: params.mediaType,
        [params.mediaType]: mediaPayload,
      },
    });

    const wamid = res.data?.messages?.[0]?.id;
    if (!wamid) {
      throw new MetaGraphApiError("Meta responded without message ID (wamid)", {
        code: "META_NO_MESSAGE_ID",
        status: 502,
      });
    }
    return { wamid };
  }
}

let clientInstance: MetaGraphApiClient | null = null;
export function getMetaGraphApiClient(): MetaGraphApiClient {
  if (!clientInstance) {
    clientInstance = new MetaGraphApiClient();
  }
  return clientInstance;
}

const wabaClientMap = new Map<string, { client: MetaGraphApiClient; expiresAt: number }>();

export async function getMetaClientForWaba(wabaId?: string): Promise<MetaGraphApiClient> {
  if (!wabaId) {
    return getMetaGraphApiClient();
  }

  const now = Date.now();
  const cached = wabaClientMap.get(wabaId);
  if (cached && cached.expiresAt > now) {
    return cached.client;
  }

  try {
    const { WhatsAppAccountRepository } = await import("@/server/repositories/accountRepository");
    const accountRepo = new WhatsAppAccountRepository();
    const creds = await accountRepo.getCredentials(wabaId);
    if (creds?.accessToken) {
      const client = new MetaGraphApiClient({
        token: creds.accessToken,
        appSecret: creds.appSecret,
      });
      // Cache for 5 minutes
      wabaClientMap.set(wabaId, { client, expiresAt: now + 5 * 60 * 1000 });
      return client;
    }
  } catch {
    // Fallback to default client
  }

  return getMetaGraphApiClient();
}

export interface MetaWabaRecord {
  id: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
  message_template_namespace?: string;
  account_review_status?: string;
  business_verification_status?: string;
}

export interface MetaPhoneNumberRecord {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  status?: string;
  messaging_limit_tier?: string;
  name_status?: string;
}

