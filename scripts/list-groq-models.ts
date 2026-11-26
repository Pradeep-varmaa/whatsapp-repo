import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

async function main() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const baseUrl = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");

  if (!apiKey) {
    console.error("GROQ_API_KEY is not set in .env.local or environment.");
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Groq API error (${res.status}): ${body}`);
    process.exit(1);
  }

  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      owned_by?: string;
      active?: boolean;
      context_window?: number;
      max_completion_tokens?: number;
    }>;
  };

  const models = (json.data || []).sort((a, b) => a.id.localeCompare(b.id));
  console.log(`Found ${models.length} Groq model(s):\n`);
  for (const m of models) {
    const ctx = m.context_window ? ` | context: ${m.context_window}` : "";
    const status = m.active === false ? " [inactive]" : "";
    console.log(`- ${m.id} (${m.owned_by || "unknown"}${ctx})${status}`);
  }
}

main().catch((err) => {
  console.error("Failed to fetch Groq models:", err.message || err);
  process.exit(1);
});
