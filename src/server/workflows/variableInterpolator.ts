/**
 * Safe Variable Interpolator
 * Replaces {{variable.path}} tokens with values from the context dictionary.
 * Supports:
 * - Simple paths: {{customer_phone}}, {{order_id}}
 * - Dot and bracket array indexing: {{api_result.response[0].ip_address}}, {{api_result.response.0.ip_address}}
 * - Array list mapping: {{api_result.response[*].ip_address}} or {{api_result.response.ip_address}}
 * - Unresolved variables become empty string "", never the raw {{...}}.
 * Guaranteed no eval() or dynamic function invocation.
 */

/**
 * Resolves a raw value from context by path (supports a.b[0].c, a.b.c, {{a.b}}, etc.)
 * Returns undefined if unresolved or invalid.
 */
export function resolveValue(path: string, context: Record<string, any>): any {
  if (!path || !context) return undefined;

  let cleanPath = path.trim();
  if (cleanPath.startsWith("{{") && cleanPath.endsWith("}}")) {
    cleanPath = cleanPath.slice(2, -2).trim();
  }
  if (!cleanPath) return undefined;

  // Direct key check first
  if (context[cleanPath] !== undefined) {
    let val = context[cleanPath];
    if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
      try { val = JSON.parse(val); } catch {}
    }
    return val;
  }

  // Built-in Dynamic Date & Time Variables (e.g. {{$today}}, {{$tomorrow}}, {{$time}}, {{$date+2}})
  const lower = cleanPath.toLowerCase();
  if (lower === "$today" || lower === "today") {
    const d = new Date();
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (lower === "$today_date" || lower === "today_date") {
    return new Date().toISOString().split("T")[0];
  }
  if (lower === "$tomorrow" || lower === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (lower === "$tomorrow_date" || lower === "tomorrow_date") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }
  if (lower.startsWith("$date+") || lower.startsWith("date+") || lower.startsWith("$date_plus_") || lower.startsWith("date_plus_")) {
    const numPart = lower.includes("+") ? lower.split("+")[1] : lower.split("_plus_")[1];
    const days = parseInt(numPart, 10) || 0;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (lower === "$time" || lower === "time" || lower === "$current_time" || lower === "current_time") {
    return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  }

  // Automatic aliases for sender / customer phone number
  if (lower === "phone" || lower === "mobile" || lower === "sender_phone" || lower === "sender_mobile" || lower === "sender") {
    if (context.customer_phone !== undefined) return context.customer_phone;
    if (context.phone !== undefined) return context.phone;
    if (context.mobile !== undefined) return context.mobile;
  }
  if (lower === "clean_phone" || lower === "clean_mobile") {
    const raw = context.clean_phone ?? context.customer_phone ?? context.phone ?? context.mobile ?? "";
    return String(raw).replace(/\D/g, "");
  }

  // Normalize: response[0].ip_address -> response.0.ip_address, response['key'] -> response.key
  const normalizedPath = cleanPath
    .replace(/\[\s*(['"]?)(.*?)\1\s*\]/g, ".$2")
    .replace(/^\./, "");

  if (context[normalizedPath] !== undefined) {
    let val = context[normalizedPath];
    if (typeof val === "string" && (val.startsWith("{") || val.startsWith("["))) {
      try { val = JSON.parse(val); } catch {}
    }
    return val;
  }

  const segments = normalizedPath.split(".").filter(Boolean);
  let current: any = context;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (current === null || current === undefined) {
      return undefined;
    }
    // Protect against prototype pollution
    if (segment === "__proto__" || segment === "constructor" || segment === "prototype") {
      return undefined;
    }

    if (typeof current === "string" && (current.startsWith("{") || current.startsWith("["))) {
      try {
        current = JSON.parse(current);
      } catch {}
    }

    current = current[segment];
  }

  if (typeof current === "string" && (current.startsWith("{") || current.startsWith("["))) {
    try {
      return JSON.parse(current);
    } catch {}
  }

  return current;
}

export function resolveVariable(path: string, context: Record<string, any>): string {
  const cleanPath = path.trim();
  if (!cleanPath || !context) return "";

  // Handle array projection: e.g. {{api_result.response[*].ip_address}}
  if (cleanPath.includes("[*]") || cleanPath.includes(".*")) {
    const basePart = cleanPath.split(/\[\*\]|\.\*/)[0];
    const propPart = cleanPath.split(/\[\*\]|\.\*/)[1]?.replace(/^\./, "");
    const arr = resolveValue(basePart, context);
    if (Array.isArray(arr)) {
      const items = arr
        .map((item) => {
          if (propPart && item && typeof item === "object") {
            const pVal = resolveValue(propPart, item);
            return pVal !== undefined && pVal !== null ? String(pVal) : "";
          }
          return typeof item === "object" ? JSON.stringify(item) : String(item);
        })
        .filter(Boolean);
      return items.map((v) => `• ${v}`).join("\n");
    }
    return "";
  }

  const val = resolveValue(cleanPath, context);
  if (val === null || val === undefined) {
    return "";
  }

  if (Array.isArray(val)) {
    if (val.every((item) => typeof item !== "object")) {
      return val.map((v) => `• ${v}`).join("\n");
    }
    return val
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          const v = item.ip_address || item.title || item.name || item.label || item.id || JSON.stringify(item);
          return `• ${v}`;
        }
        return `• ${item}`;
      })
      .join("\n");
  }

  if (typeof val === "object") {
    return JSON.stringify(val);
  }

  return String(val);
}

/**
 * Interpolates all {{path}} placeholders inside a template string.
 * Unresolved variables always become an empty string, never the raw {{...}}.
 */
export function interpolateString(template: string, context: Record<string, any>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, path) => {
    return resolveVariable(path, context);
  });
}

export interface DetectedArrayInfo {
  path: string;
  fullToken: string;
  length: number;
  sampleItem: Record<string, any> | null;
  keys: string[];
  bestTitle: string;
  bestDesc: string;
  bestId: string;
}

/**
 * Inspects any API response object to automatically detect arrays,
 * inspects the first item (array[0]) to extract all keys,
 * and recommends smart field mappings for Row Title, Description, and ID.
 */
export function analyzeApiResponse(
  saveVar: string,
  responseJson: any
): {
  arrays: DetectedArrayInfo[];
  primaryArray: DetectedArrayInfo | null;
} {
  const arrays: DetectedArrayInfo[] = [];

  const inspectArray = (arr: any[], path: string) => {
    const fullToken = path ? `{{${saveVar}.${path}}}` : `{{${saveVar}}}`;
    const sampleItem = arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null ? arr[0] : null;
    const keys = sampleItem ? Object.keys(sampleItem) : [];

    // Guess best title
    let bestTitle = "";
    const titleRegex = /^(title|name|label|header|subject|product_name|item_name|dish_name|username|full_name)$/i;
    const softTitleRegex = /(title|name|label|subject)/i;
    if (keys.some((k) => titleRegex.test(k))) {
      bestTitle = keys.find((k) => titleRegex.test(k))!;
    } else if (keys.some((k) => softTitleRegex.test(k))) {
      bestTitle = keys.find((k) => softTitleRegex.test(k))!;
    } else {
      const firstStr = keys.find((k) => typeof sampleItem?.[k] === "string" && !/id/i.test(k));
      bestTitle = firstStr || keys[0] || "title";
    }

    // Guess best description
    let bestDesc = "";
    const descRegex = /^(description|desc|detail|summary|subtitle|bio|caption|category|body|notes|city)$/i;
    const softDescRegex = /(desc|detail|summary|category|price|city)/i;
    if (keys.some((k) => descRegex.test(k))) {
      bestDesc = keys.find((k) => descRegex.test(k))!;
    } else if (keys.some((k) => softDescRegex.test(k) && k !== bestTitle)) {
      bestDesc = keys.find((k) => softDescRegex.test(k) && k !== bestTitle)!;
    } else {
      const secondStr = keys.find((k) => k !== bestTitle && !/id/i.test(k));
      bestDesc = secondStr || "";
    }

    // Guess best ID
    let bestId = "";
    const idRegex = /^(id|_id|uuid|key|code|sku|product_id|item_id|slug)$/i;
    const softIdRegex = /(id|code|sku|key)/i;
    if (keys.some((k) => idRegex.test(k))) {
      bestId = keys.find((k) => idRegex.test(k))!;
    } else if (keys.some((k) => softIdRegex.test(k))) {
      bestId = keys.find((k) => softIdRegex.test(k))!;
    } else {
      bestId = keys.includes("id") ? "id" : keys[0] || "id";
    }

    arrays.push({
      path,
      fullToken,
      length: arr.length,
      sampleItem,
      keys,
      bestTitle,
      bestDesc,
      bestId,
    });
  };

  if (Array.isArray(responseJson)) {
    inspectArray(responseJson, "");
  } else if (responseJson && typeof responseJson === "object") {
    // 1st level properties
    for (const [k, v] of Object.entries(responseJson)) {
      if (Array.isArray(v)) {
        inspectArray(v, k);
      } else if (v && typeof v === "object" && v !== null) {
        // 2nd level check
        for (const [subK, subV] of Object.entries(v)) {
          if (Array.isArray(subV)) {
            inspectArray(subV, `${k}.${subK}`);
          }
        }
      }
    }
  }

  // Primary array: prefer arrays matching common names (products, data, items, results, records, list, response)
  const priorityRegex = /^(products|data|items|results|records|list|response|users|rows)$/i;
  const primaryArray = arrays.find((a) => priorityRegex.test(a.path)) || arrays[0] || null;

  return { arrays, primaryArray };
}
