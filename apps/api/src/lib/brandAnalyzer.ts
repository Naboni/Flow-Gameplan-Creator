import * as cheerio from "cheerio";
import { getOpenAI } from "./openai.js";

export type BrandQuestionnaire = {
  discountNotes?: string;
  specialInstructions?: string;
  filloutResponses?: Record<string, string>;
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
  brandLogoUrl?: string;
  brandColor?: string;
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

/* ── brand visual extraction ── */

function resolveUrl(href: string, origin: string): string {
  if (href.startsWith("http")) return href;
  return `${origin}${href.startsWith("/") ? "" : "/"}${href}`;
}

function extractBrandVisuals(
  $: cheerio.CheerioAPI,
  baseUrl: string,
  og: Record<string, string>,
  jsonLd: Record<string, unknown>[]
): BrandVisuals {
  const origin = new URL(baseUrl).origin;

  let logoUrl: string | null = null;

  // 1. JSON-LD Organization/WebSite logo (highest quality)
  for (const item of jsonLd) {
    const logo = item.logo;
    if (typeof logo === "string") { logoUrl = resolveUrl(logo, origin); break; }
    if (logo && typeof logo === "object" && "url" in (logo as Record<string, unknown>)) {
      const u = (logo as Record<string, string>).url;
      if (u) { logoUrl = resolveUrl(u, origin); break; }
    }
  }

  // 2. Apple-touch-icon (usually 180x180 high-res)
  if (!logoUrl) {
    const ati = $('link[rel="apple-touch-icon"]').attr("href");
    if (ati) logoUrl = resolveUrl(ati, origin);
  }

  // 3. High-res PNG/SVG favicon
  if (!logoUrl) {
    const pngIcon = $('link[rel="icon"][type="image/png"]').attr("href")
      || $('link[rel="icon"][type="image/svg+xml"]').attr("href");
    if (pngIcon) logoUrl = resolveUrl(pngIcon, origin);
  }

  // 4. Open Graph image
  if (!logoUrl && og["image"]) {
    logoUrl = og["image"];
  }

  // 5. Generic favicon link
  if (!logoUrl) {
    const favicon = $('link[rel="icon"]').attr("href") || $('link[rel="shortcut icon"]').attr("href");
    if (favicon) logoUrl = resolveUrl(favicon, origin);
  }

  // 6. Last resort: /favicon.ico
  if (!logoUrl) {
    logoUrl = `${origin}/favicon.ico`;
  }

  // Theme color extraction
  let themeColor: string | null = null;
  const sources = [
    $('meta[name="theme-color"]').attr("content"),
    $('meta[name="msapplication-TileColor"]').attr("content"),
    $('meta[name="msapplication-navbutton-color"]').attr("content"),
  ];
  for (const src of sources) {
    if (src?.trim()) { themeColor = src.trim(); break; }
  }

  return { logoUrl, themeColor };
}

/* ── main crawl ── */

type BrandVisuals = {
  logoUrl: string | null;
  themeColor: string | null;
};

type CrawlResult = {
  structuredData: string;
  pageContent: string;
  pagesCount: number;
  visuals: BrandVisuals;
};

async function crawlSite(url: string): Promise<CrawlResult> {
  console.log(`[crawl] Starting crawl of ${url}`);
  const homepageHtml = await fetchPage(url, 15_000);
  if (!homepageHtml) throw new Error(`Failed to fetch ${url}`);

  // Extract structured data from homepage (JSON-LD, OG, meta)
  const homePage$ = cheerio.load(homepageHtml);
  const structured = extractStructuredData(homePage$);
  const structuredStr = formatStructuredData(structured);
  const visuals = extractBrandVisuals(homePage$, url, structured.openGraph, structured.jsonLd);
  console.log(`[crawl] Structured data: ${structured.jsonLd.length} JSON-LD blocks, ${Object.keys(structured.openGraph).length} OG tags`);
  console.log(`[crawl] Brand visuals: logo=${visuals.logoUrl ?? "none"}, color=${visuals.themeColor ?? "none"}`);

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
    pagesCount: sections.length,
    visuals
  };
}

/* ── questionnaire formatting ── */

function formatQuestionnaire(q: BrandQuestionnaire): string {
  const lines: string[] = [];
  if (q.discountNotes?.trim()) lines.push(`- Discount details: ${q.discountNotes.trim()}`);
  if (q.specialInstructions?.trim()) lines.push(`- Special instructions: ${q.specialInstructions.trim()}`);
  if (q.filloutResponses && Object.keys(q.filloutResponses).length > 0) {
    lines.push("- Onboarding form data:");
    for (const [key, val] of Object.entries(q.filloutResponses)) {
      if (val?.trim()) lines.push(`  • ${key}: ${val.trim()}`);
    }
  }
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

You have FOUR sources of information (in order of authority):
1. **Strategist notes** — discount details and special instructions from our team (ABSOLUTE ground truth)
2. **Onboarding form data** — structured answers from the client's onboarding questionnaire (if provided)
3. **Crawled website content** — actual page text from the brand's site
4. **Structured data** — JSON-LD/Schema.org and Open Graph metadata from the site
5. **Your training knowledge** — if you recognize this brand, use what you know to ENRICH the profile

You must INFER these fields from the website, structured data, and your own knowledge:
- industry, targetAudience, brandVoice, businessStage, priceRange, averageOrderValue, keyDifferentiators, brandTone, competitors

Produce a JSON brand profile with these exact fields:
{
  "brandName": "string",
  "industry": "string (e.g. skincare, supplements, apparel, home goods)",
  "targetAudience": "detailed string — demographics, psychographics, lifestyle, pain points",
  "brandVoice": "string — communication style inferred from actual site copy",
  "keyProducts": ["array of main products/categories — use real names from the site"],
  "uniqueSellingPoints": ["array of 3-5 concrete differentiators — cite real claims from the site"],
  "discountStrategy": "string — describe actual discount/offer patterns found, or 'none detected'. If strategist provided discount details, incorporate those exactly.",
  "summary": "3-4 sentence brand summary a copywriter could use for on-brand marketing emails",
  "priceRange": "string (infer from product prices or structured data)",
  "averageOrderValue": "string (infer from product prices or 'unknown')",
  "businessStage": "string (infer from site maturity, product range, reviews count)",
  "emailListSize": "string ('unknown' unless onboarding data provides it)",
  "discountApproach": "string (from strategist discount details, or inferred from site promotions)",
  "keyDifferentiators": ["array — infer from site USPs, claims, and competitive positioning"],
  "brandTone": "string (infer from site copy style — formal, casual, playful, luxury, etc.)",
  "competitors": "string (name 2-3 likely competitors based on industry and positioning)",
  "specialInstructions": "string (from strategist notes, or empty)"
}

Rules:
- For products and prices: prefer structured data (JSON-LD) over body text. Use real product names.
- For competitors: name 2-3 likely competitors based on your industry knowledge.
- For target audience: go beyond demographics — include psychographics and buying motivations.
- Strategist notes override all other sources. If they say "no discount", respect that.
- If onboarding form data is provided, treat it as high-quality client input — use it to fill any fields it covers.
- Be specific and concrete. Every field should contain actionable information, not generic filler.
- NEVER fabricate specific discount codes, percentages, or offers that aren't explicitly provided by the strategist or found on the site.`
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
    brandVoice: parsed.brandVoice || "friendly and professional",
    keyProducts: parsed.keyProducts || [],
    uniqueSellingPoints: parsed.uniqueSellingPoints || [],
    discountStrategy: parsed.discountStrategy || "none detected",
    summary: parsed.summary || "",
    priceRange: parsed.priceRange || "unknown",
    averageOrderValue: parsed.averageOrderValue || "unknown",
    businessStage: parsed.businessStage || "unknown",
    emailListSize: parsed.emailListSize || "unknown",
    discountApproach: parsed.discountApproach || questionnaire?.discountNotes || "unknown",
    keyDifferentiators: parsed.keyDifferentiators || [],
    brandTone: parsed.brandTone || "friendly and professional",
    competitors: parsed.competitors || "unknown",
    specialInstructions: parsed.specialInstructions || questionnaire?.specialInstructions || "",
    brandLogoUrl: crawl.visuals.logoUrl || undefined,
    brandColor: crawl.visuals.themeColor || undefined,
  };
}
