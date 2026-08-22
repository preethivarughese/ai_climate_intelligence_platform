// Base URL for the FastAPI backend. Empty in dev so the Vite proxy handles /api,
// set VITE_API_BASE (e.g. https://api.example.org) for deployed builds.
export const API_BASE: string = (import.meta.env.VITE_API_BASE ?? '').replace(/\/$/, '');

export const apiUrl = (path: string): string => `${API_BASE}${path}`;
