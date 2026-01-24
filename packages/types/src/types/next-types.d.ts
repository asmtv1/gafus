export interface NextApiRequest {
  body: Record<string, unknown>;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[]>;
  method: string;
  url: string;
}
export interface NextApiResponse {
  status: (code: number) => NextApiResponse;
  json: (data: unknown) => NextApiResponse;
  send: (data: unknown) => NextApiResponse;
  end: () => NextApiResponse;
  setHeader: (name: string, value: string) => NextApiResponse;
}
export interface NextRequest {
  nextUrl: {
    pathname: string;
    searchParams: URLSearchParams;
  };
  url: string;
  method: string;
  headers: Headers;
}
export interface NextResponse {
  next: () => NextResponse;
  redirect: (url: string | URL) => NextResponse;
  rewrite: (destination: string | URL) => NextResponse;
  headers: Headers;
  cookies: Record<string, string>;
}
//# sourceMappingURL=next-types.d.ts.map
