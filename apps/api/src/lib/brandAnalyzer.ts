import * as cheerio from "cheerio";
import { getOpenAI } from "./openai.js";

export type BrandProfile = {
  brandName: string;
  industry: string;
  targetAudience: string;
  brandVoice: string;
  keyProducts: string[];
  uniqueSellingPoints: string[];
  discountStrategy: string;
  summary: string;
};

/**
 * Fetch a website and extract text content for analysis.
 */
async function fetchSiteText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; FlowGameplanBot/1.0; +https://zhs-ecom.com)"
      }
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}: ${res.status}`);
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove scripts, styles, nav, footer
    $("script, style, nav, footer, noscript, iframe").remove();

    const title = $("title").text().trim();
    const metaDesc =
      $('meta[name="description"]').attr("content")?.trim() ?? "";
    const headings = $("h1, h2, h3")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .slice(0, 20);
    const bodyText = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    return [
      `Title: ${title}`,
      `Meta description: ${metaDesc}`,
      `Headings: ${headings.join(" | ")}`,
      `Body excerpt: ${bodyText}`
    ].join("\n\n");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Analyze a brand website using OpenAI and return a structured profile.
 */
export async function analyzeBrand(
  websiteUrl: string,
  brandName: string,
  notes?: string
): Promise<BrandProfile> {
  const siteText = await fetchSiteText(websiteUrl);

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a brand analyst for an email/SMS marketing agency called ZHS Ecom. 
Given website content, produce a JSON brand profile with these exact fields:
{
  "brandName": "string",
  "industry": "string (e.g. skincare, supplements, apparel)",
  "targetAudience": "string describing their ideal customer",
  "brandVoice": "string (e.g. friendly and warm, premium and clinical, bold and energetic)",
  "keyProducts": ["array of main products/categories"],
  "uniqueSellingPoints": ["array of 3-5 key differentiators"],
  "discountStrategy": "string describing any discount/offer patterns found, or 'none detected'",
  "summary": "2-3 sentence brand summary useful for writing marketing emails"
}
Be concise and precise. Base everything on the actual site content provided.`
      },
      {
        role: "user",
        content: `Brand name: ${brandName}
Website URL: ${websiteUrl}
${notes ? `Additional notes: ${notes}` : ""}

--- Website content ---
${siteText}`
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as BrandProfile;

  // Ensure all fields exist
  return {
    brandName: parsed.brandName || brandName,
    industry: parsed.industry || "ecommerce",
    targetAudience: parsed.targetAudience || "online shoppers",
    brandVoice: parsed.brandVoice || "friendly and professional",
    keyProducts: parsed.keyProducts || [],
    uniqueSellingPoints: parsed.uniqueSellingPoints || [],
    discountStrategy: parsed.discountStrategy || "none detected",
    summary: parsed.summary || ""
  };
}
