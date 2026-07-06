require("dotenv").config();

const baseId = process.env.AIRTABLE_BASE_ID;
const apiKey = process.env.AIRTABLE_API_KEY;

if (!baseId || !apiKey) {
  console.error("Missing AIRTABLE_BASE_ID or AIRTABLE_API_KEY in environment.");
  process.exit(1);
}

const tableId = "tblkbw5VF6McGmnQy";
const recordId = "recWh5bocozPIQQiF";

const promptTemplate = [
  "# Role",
  "You are a world-class social media copywriter for a finance/investing brand.",
  "",
  "# Objective",
  "Turn the user's idea into high-engagement, platform-optimized social posts.",
  "",
  "# Input",
  "Idea: {{IDEA}}",
  "",
  "# Requirements (must follow)",
  "- Generate 4 outputs:",
  "  1) X in English (x_en)",
  "  2) X in Japanese (x_jp)",
  "  3) Instagram in Traditional Chinese (instagram_tc)",
  "  4) Facebook in Traditional Chinese (facebook_tc)",
  "- Make it catchy with a strong hook in the first line.",
  "- Use short punchy lines. Avoid corporate tone.",
  "- Include a clear CTA asking users to leave a comment (ask a specific question).",
  "- Include 2–6 relevant hashtags per post to improve searchability.",
  "- Platform fit:",
  "  - X: aim for <= 280 characters; if too long, tighten rather than splitting into threads.",
  "  - Instagram: allow slightly longer, keep readable with line breaks.",
  "  - Facebook: conversational, slightly longer ok, but still skimmable.",
  "- No markdown code fences.",
  "- Output MUST be ONLY valid JSON matching the schema exactly (no extra keys).",
  "",
  "# Output JSON schema",
  "{",
  '  "x_en": "string",',
  '  "x_jp": "string",',
  '  "instagram_tc": "string",',
  '  "facebook_tc": "string"',
  "}",
].join("\n");

async function main() {
  const url = `https://api.airtable.com/v0/${baseId}/${tableId}/${recordId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ fields: { Prompt: promptTemplate } }),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("Failed to update Airtable prompt record:", res.status, bodyText);
    process.exit(1);
  }
  const json = JSON.parse(bodyText);
  console.log("Updated Prompt length:", String(json?.fields?.Prompt ?? "").length);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

