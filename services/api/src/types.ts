export interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
  requestId: string;
}

export interface HttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}
