// Server-side data access for Server Components (SSR/SSG/ISR).
// These call the Express API directly so the public storefront can render
// real HTML for crawlers — no client-side Redux/RTK Query involved here.
import 'server-only';
import type { MenuItem } from '../../api/apiSlice';
import { DEFAULT_RESTAURANT, type Restaurant } from '../site';

const API_ORIGIN = process.env.API_ORIGIN || 'http://127.0.0.1:3001';

async function apiFetch<T>(path: string, revalidateSeconds = 300): Promise<T | null> {
  try {
    const res = await fetch(`${API_ORIGIN}/api${path}`, {
      next: { revalidate: revalidateSeconds },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getMenuItems(category?: string): Promise<MenuItem[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  params.set('available', 'true');
  const data = await apiFetch<MenuItem[]>(`/menu?${params}`);
  return data ?? [];
}

export async function getCategories(): Promise<string[]> {
  const data = await apiFetch<string[]>('/menu/categories');
  return data ?? [];
}

/** Live restaurant profile (name, hours, address, …). Falls back to defaults. */
export async function getRestaurant(): Promise<Restaurant> {
  const data = await apiFetch<Partial<Restaurant>>('/settings/restaurant', 60);
  return { ...DEFAULT_RESTAURANT, ...(data ?? {}) } as Restaurant;
}
