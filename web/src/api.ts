import type { ApiErrorBody, Readings, SubmissionOut } from "./types";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly fields: string[];
  constructor(code: string, message: string, fields: string[]) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
    this.fields = fields;
  }
}

async function parseError(response: Response): Promise<ApiRequestError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  if (body?.error) {
    return new ApiRequestError(
      body.error.code,
      body.error.message,
      body.error.fields,
    );
  }
  return new ApiRequestError("HTTP_ERROR", `请求失败（HTTP ${response.status}）`, []);
}

export async function submitReadings(readings: Readings): Promise<SubmissionOut> {
  const response = await fetch("/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(readings),
  });
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as SubmissionOut;
}

export async function listSubmissions(): Promise<SubmissionOut[]> {
  const response = await fetch("/api/submissions");
  if (!response.ok) {
    throw await parseError(response);
  }
  return (await response.json()) as SubmissionOut[];
}
