// Base URL for the FastAPI backend. Empty in dev so the Vite proxy handles /api,
// set VITE_API_BASE (e.g. https://api.example.org) for deployed builds.
const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || 'https://ai-climate-intelligence-platform.onrender.com';

export function apiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${cleanPath}`;
}
