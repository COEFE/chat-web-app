// Helper types for Next.js route handlers
export interface RouteContext<T = Record<string, string>> {
  params: T;
}
