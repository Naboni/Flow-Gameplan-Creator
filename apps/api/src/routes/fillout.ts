import type { Request, Response } from "express";

type FilloutQuestion = {
  id: string;
  name: string;
  type: string;
  value: unknown;
};

type FilloutSubmission = {
  submissionId: string;
  submissionTime: string;
  questions: FilloutQuestion[];
};

type FilloutListResponse = {
  responses: FilloutSubmission[];
  totalResponses: number;
  pageCount: number;
};

export async function filloutLookupRoute(req: Request, res: Response) {
  try {
    const apiKey = process.env.FILLOUT_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "FILLOUT_API_KEY is not configured on the server" });
    }

    const { formId, search } = req.body as {
      formId?: string;
      search?: string;
    };

    if (!formId) {
      return res.status(400).json({ error: "formId is required" });
    }

    const params = new URLSearchParams({
      limit: "1",
      sort: "desc",
    });
    if (search?.trim()) {
      params.set("search", search.trim());
    }

    const url = `https://api.fillout.com/v1/api/forms/${formId}/submissions?${params}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[fillout] API error ${resp.status}:`, text);
      return res.status(resp.status).json({
        error: resp.status === 401 ? "Invalid Fillout API key" : `Fillout API error (${resp.status})`,
      });
    }

    const data = (await resp.json()) as FilloutListResponse;

    if (!data.responses || data.responses.length === 0) {
      return res.status(404).json({
        error: search?.trim()
          ? `No submission found matching "${search.trim()}"`
          : "No submissions found for this form",
      });
    }

    const submission = data.responses[0];
    const responses: Record<string, string> = {};

    for (const q of submission.questions) {
      if (q.value == null || q.value === "") continue;
      const val = Array.isArray(q.value)
        ? q.value.map((v: unknown) => (typeof v === "object" && v !== null && "value" in v ? (v as { value: string }).value : String(v))).join(", ")
        : String(q.value);
      if (val.trim()) responses[q.name] = val.trim();
    }

    console.log(`[fillout] Found submission ${submission.submissionId} with ${Object.keys(responses).length} fields`);

    return res.json({
      submissionId: submission.submissionId,
      submissionTime: submission.submissionTime,
      responses,
    });
  } catch (err) {
    console.error("[fillout] Error:", err);
    return res.status(500).json({ error: "Failed to fetch from Fillout" });
  }
}
