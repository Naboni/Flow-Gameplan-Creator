import * as cheerio from "cheerio";
import { getOpenAI } from "./openai.js";

export type BrandQuestionnaire = {
  businessType?: string;
  businessStage?: string;
  emailListSize?: string;
  priceRange?: string;
  averageOrderValue?: string;
  discountApproach?: string;
  keyDifferentiators?: string[];
  brandTone?: string;
  competitors?: string;
  specialInstructions?: string;
};

export type BrandProfile = {
  brandName: string;
  industry: string;
  targetAudience: string;
  brandVoice: string;
  keyProducts: string[];
  uniqueSellingPoints: string[];
  discountStrategy: string;
  summary: string;
  priceRange: string;
  averageOrderValue: string;
  businessStage: string;
  emailListSize: string;
  discountApproach: string;
  keyDifferentiators: string[];
  brandTone: string;
  competitors: string;
  specialInstructions: string;
};

/* ── fetch helpers ── */

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; FlowGameplanBot/1.0; +https://zhs-ecom.com)"
};

async function fetchPage(url: string, timeoutMs = 10_000): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/* ── structured data extraction ── */

type StructuredData = {
  jsonLd: Record<string, unknown>[];
  openGraph: Record<string, string>;
  meta: Record<string, string>;
};

function extractStructuredData($: cheerio.CheerioAPI): StructuredData {
  // JSON-LD (Schema.org) — product info, org info, breadcrumbs, etc.
  const jsonLd: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item && typeof item === "object") jsonLd.push(item as Record<string, unknown>);
      }
    } catch { /* malformed JSON-LD */ }
  });

  // Open Graph meta tags
  const openGraph: Record<string, string> = {};
  $("meta[property^='og:']").each((_, el) => {
    const prop = $(el).attr("property")?.replace("og:", "") ?? "";
    const content = $(el).attr("content") ?? "";
    if (prop && content) openGraph[prop] = content;
  });

  // Standard meta tags
  const meta: Record<string, string> = {};
  for (const name of ["description", "keywords", "author"]) {
    const content = $(`meta[name="${name}"]`).attr("content")?.trim();
    if (content) meta[name] = content;
  }

  return { jsonLd, openGraph, meta };
}

function formatStructuredData(data: StructuredData): string {
  const parts: string[] = [];

  if (data.jsonLd.length > 0) {
    // Extract the most useful JSON-LD types
    const useful = data.jsonLd.filter((item) => {
      const type = String(item["@type"] || "");
      return ["Product", "Organization", "WebSite", "Brand", "Store",
              "ItemList", "BreadcrumbList", "FAQPage", "Review",
              "AggregateRating", "Offer", "LocalBusiness"].some(
        (t) => type.includes(t)
      );
    });
    if (useful.length > 0) {
      // Trim to avoid token waste — stringify and cap
      const jsonStr = JSON.stringify(useful, null, 0).slice(0, 2000);
      parts.push(`Structured Data (JSON-LD):\n${jsonStr}`);
    }
  }

  if (Object.keys(data.openGraph).length > 0) {
    const ogLines = Object.entries(data.openGraph).map(([k, v]) => `  ${k}: ${v}`);
    parts.push(`Open Graph:\n${ogLines.join("\n")}`);
  }

  if (Object.keys(data.meta).length > 0) {
    const metaLines = Object.entries(data.meta).map(([k, v]) => `  ${k}: ${v}`);
    parts.push(`Meta Tags:\n${metaLines.join("\n")}`);
  }

  return parts.join("\n\n");
}

/* ── content extraction ── */

function extractPageContent($: cheerio.CheerioAPI, maxChars: number): string {
  $("script, style, nav, footer, noscript, iframe").remove();
  const title = $("title").text().trim();
  const headings = $("h1, h2, h3").map((_, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 15);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, maxChars);

  return [
    `Title: ${title}`,
    headings.length > 0 ? `Headings: ${headings.join(" | ")}` : "",
    `Content: ${bodyText}`
  ].filter(Boolean).join("\n");
}

/* ── page discovery ── */

const KEY_PAGE_PATTERNS = [
  { pattern: /\/(about|about-us|our-story|who-we-are)/i, label: "About" },
  { pattern: /\/(products|collections|shop|store|catalog)/i, label: "Products" },
  { pattern: /\/(faq|faqs|help|support|questions)/i, label: "FAQ" },
  { pattern: /\/(reviews|testimonials|customer-stories)/i, label: "Reviews" },
  { pattern: /\/(shipping|returns|guarantee|policies|refund)/i, label: "Policies" },
];

function discoverKeyPagesFromLinks(html: string, baseUrl: string): Array<{ url: string; label: string }> {
  const $ = cheerio.load(html);
  const origin = new URL(baseUrl).origin;
  const found = new Map<string, string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.origin !== origin) return;
      const path = resolved.pathname.toLowerCase();
      for (const { pattern, label } of KEY_PAGE_PATTERNS) {
        if (pattern.test(path) && !found.has(label)) {
          found.set(label, resolved.href);
          break;
        }
      }
    } catch { /* invalid URL */ }
  });

  return Array.from(found.entries()).map(([label, url]) => ({ label, url }));
}

async function discoverFromSitemap(baseUrl: string): Promise<Array<{ url: string; label: string }>> {
  const origin = new URL(baseUrl).origin;
  const sitemapUrl = `${origin}/sitemap.xml`;
  const xml = await fetchPage(sitemapUrl, 5_000);
  if (!xml) return [];

  const found = new Map<string, string>();
  const $ = cheerio.load(xml, { xmlMode: true });

  $("url > loc").each((_, el) => {
    const loc = $(el).text().trim();
    if (!loc) return;
    try {
      const path = new URL(loc).pathname.toLowerCase();
      for (const { pattern, label } of KEY_PAGE_PATTERNS) {
        if (pattern.test(path) && !found.has(label)) {
          found.set(label, loc);
          break;
        }
      }
    } catch { /* invalid URL */ }
  });

  return Array.from(found.entries()).map(([label, url]) => ({ label, url }));
}

/* ── main crawl ── */

type CrawlResult = {
  structuredData: string;
  pageContent: string;
  pagesCount: number;
};

async function crawlSite(url: string): Promise<CrawlResult> {
  console.log(`[crawl] Starting crawl of ${url}`);
  const homepageHtml = await fetchPage(url, 15_000);
  if (!homepageHtml) throw new Error(`Failed to fetch ${url}`);

  // Extract structured data from homepage (JSON-LD, OG, meta)
  const homePage$ = cheerio.load(homepageHtml);
  const structured = extractStructuredData(homePage$);
  const structuredStr = formatStructuredData(structured);
  console.log(`[crawl] Structured data: ${structured.jsonLd.length} JSON-LD blocks, ${Object.keys(structured.openGraph).length} OG tags`);

  // Extract text content from homepage
  const homepageContent = extractPageContent(cheerio.load(homepageHtml), 2500);
  console.log(`[crawl] Homepage text extracted (${homepageContent.length} chars)`);

  // Discover subpages — try sitemap first, fall back to links
  let keyPages = await discoverFromSitemap(url);
  const discoveryMethod = keyPages.length > 0 ? "sitemap" : "links";
  if (keyPages.length === 0) {
    keyPages = discoverKeyPagesFromLinks(homepageHtml, url);
  }
  keyPages = keyPages.slice(0, 4);
  console.log(`[crawl] Discovered ${keyPages.length} subpages via ${discoveryMethod}:`, keyPages.map((p) => `${p.label} → ${p.url}`));

  // Fetch subpages in parallel
  const sections: string[] = [`=== HOMEPAGE ===\n${homepageContent}`];

  if (keyPages.length > 0) {
    const charsPerPage = Math.floor(2000 / keyPages.length);
    const results = await Promise.allSettled(
      keyPages.map(async (page) => {
        const html = await fetchPage(page.url);
        if (!html) {
          console.log(`[crawl] ✗ Failed: ${page.label} (${page.url})`);
          return null;
        }
        // Also grab structured data from subpages (e.g. product pages have JSON-LD)
        const sub$ = cheerio.load(html);
        const subStructured = extractStructuredData(sub$);
        if (subStructured.jsonLd.length > 0) {
          structured.jsonLd.push(...subStructured.jsonLd);
        }
        const content = extractPageContent(cheerio.load(html), charsPerPage);
        console.log(`[crawl] ✓ ${page.label} (${content.length} chars)`);
        return { label: page.label, content };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        sections.push(`=== ${result.value.label.toUpperCase()} PAGE ===\n${result.value.content}`);
      }
    }
  }

  // Re-format structured data after collecting from subpages too
  const finalStructuredStr = structured.jsonLd.length > 0 || Object.keys(structured.openGraph).length > 0
    ? formatStructuredData(structured)
    : structuredStr;

  const pageContent = sections.join("\n\n");
  console.log(`[crawl] Complete: ${pageContent.length} chars text + ${finalStructuredStr.length} chars structured data across ${sections.length} page(s)`);

  return {
    structuredData: finalStructuredStr,
    pageContent,
    pagesCount: sections.length
  };
}

/* ── questionnaire formatting ── */

function formatQuestionnaire(q: BrandQuestionnaire): string {
  const lines: string[] = [];
  if (q.businessType) lines.push(`- Business type: ${q.businessType}`);
  if (q.businessStage) lines.push(`- Business stage: ${q.businessStage}`);
  if (q.emailListSize) lines.push(`- Email list size: ${q.emailListSize}`);
  if (q.priceRange) lines.push(`- Price range: ${q.priceRange}`);
  if (q.averageOrderValue) lines.push(`- Average order value: ${q.averageOrderValue}`);
  if (q.discountApproach) lines.push(`- Discount approach: ${q.discountApproach}`);
  if (q.keyDifferentiators?.length) lines.push(`- Key differentiators: ${q.keyDifferentiators.join(", ")}`);
  if (q.brandTone) lines.push(`- Brand tone: ${q.brandTone}`);
  if (q.competitors) lines.push(`- Top competitors: ${q.competitors}`);
  if (q.specialInstructions) lines.push(`- Special instructions: ${q.specialInstructions}`);
  return lines.length > 0 ? lines.join("\n") : "";
}

/* ── brand analysis ── */

export async function analyzeBrand(
  websiteUrl: string,
  brandName: string,
  questionnaire?: BrandQuestionnaire
): Promise<BrandProfile> {
  const crawl = await crawlSite(websiteUrl);
  const questionnaireText = questionnaire ? formatQuestionnaire(questionnaire) : "";

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a senior brand analyst at ZHS Ecom, an email/SMS marketing agency specializing in Klaviyo retention flows for ecommerce brands.

You have THREE sources of information:
1. **Crawled website content** — actual page text from the brand's site (ground truth for products, copy, offers)
2. **Structured data** — JSON-LD/Schema.org and Open Graph metadata from the site (precise product names, prices, ratings)
3. **Strategist questionnaire** — answers provided by our team (treat as absolute ground truth — always override other sources)

You also have your own training knowledge. If you recognize this brand, use what you know about their reputation, typical customer, market position, and competitors to ENRICH the profile. But never contradict what the crawled data or questionnaire says.

Produce a JSON brand profile with these exact fields:
{
  "brandName": "string",
  "industry": "string (e.g. skincare, supplements, apparel, home goods)",
  "targetAudience": "detailed string — demographics, psychographics, lifestyle, pain points",
  "brandVoice": "string — communication style based on actual site copy",
  "keyProducts": ["array of main products/categories — use real names and brief descriptions from the site"],
  "uniqueSellingPoints": ["array of 3-5 concrete differentiators — cite real claims from the site"],
  "discountStrategy": "string — describe actual discount/offer patterns found, or 'none detected'",
  "summary": "3-4 sentence brand summary that a copywriter could use to write on-brand marketing emails",
  "priceRange": "string (from structured data, site content, or questionnaire)",
  "averageOrderValue": "string (infer from product prices if possible, or 'unknown')",
  "businessStage": "string (from questionnaire or inferred)",
  "emailListSize": "string (from questionnaire or 'unknown')",
  "discountApproach": "string (from questionnaire — how aggressively they discount)",
  "keyDifferentiators": ["array from questionnaire or inferred from site"],
  "brandTone": "string (from questionnaire or inferred from site copy)",
  "competitors": "string (from questionnaire, or name likely competitors based on your knowledge)",
  "specialInstructions": "string (from questionnaire or empty)"
}

Rules:
- For products and prices: prefer structured data (JSON-LD) over body text. Use real product names.
- For competitors: if the questionnaire doesn't provide them but you recognize this brand, name 2-3 likely competitors.
- For target audience: go beyond demographics — include psychographics and buying motivations.
- Questionnaire answers are final — never override them.
- Be specific and concrete. Every field should contain actionable information, not generic filler.`
      },
      {
        role: "user",
        content: `Brand name: ${brandName}
Website URL: ${websiteUrl}
${questionnaireText ? `\n--- Strategist questionnaire answers ---\n${questionnaireText}` : ""}
${crawl.structuredData ? `\n--- Structured data (JSON-LD / Open Graph) ---\n${crawl.structuredData}` : ""}

--- Crawled website content (${crawl.pagesCount} pages) ---
${crawl.pageContent}`
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  console.log(`[analyze] AI profile generated (${raw.length} chars)`);
  const parsed = JSON.parse(raw) as BrandProfile;

  return {
    brandName: parsed.brandName || brandName,
    industry: parsed.industry || "ecommerce",
    targetAudience: parsed.targetAudience || "online shoppers",
    brandVoice: parsed.brandVoice || questionnaire?.brandTone || "friendly and professional",
    keyProducts: parsed.keyProducts || [],
    uniqueSellingPoints: parsed.uniqueSellingPoints || [],
    discountStrategy: parsed.discountStrategy || "none detected",
    summary: parsed.summary || "",
    priceRange: parsed.priceRange || questionnaire?.priceRange || "unknown",
    averageOrderValue: parsed.averageOrderValue || questionnaire?.averageOrderValue || "unknown",
    businessStage: parsed.businessStage || questionnaire?.businessStage || "unknown",
    emailListSize: parsed.emailListSize || questionnaire?.emailListSize || "unknown",
    discountApproach: parsed.discountApproach || questionnaire?.discountApproach || "unknown",
    keyDifferentiators: parsed.keyDifferentiators || questionnaire?.keyDifferentiators || [],
    brandTone: parsed.brandTone || questionnaire?.brandTone || "friendly and professional",
    competitors: parsed.competitors || questionnaire?.competitors || "unknown",
    specialInstructions: parsed.specialInstructions || questionnaire?.specialInstructions || ""
  };
}
