import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import type {Order, SupabaseConfig, SupabaseOrderRow} from '../types';

export const DEFAULT_SUPABASE_URL = 'https://jauumbdwnnaukohhxtbd.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_xohlaN0NiWhb6pejZeZTzA_aPUt7WvL';
const STORAGE_KEY = 'sbcfg2';

export function loadSupabaseConfig(): SupabaseConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SupabaseConfig>;
      if (parsed.u && parsed.k) {
        return {u: parsed.u, k: parsed.k};
      }
    }
  } catch {
    // ignore storage errors
  }
  return {u: DEFAULT_SUPABASE_URL, k: DEFAULT_SUPABASE_KEY};
}

export function saveSupabaseConfig(cfg: SupabaseConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // ignore storage errors
  }
}

export function createSupabaseInstance(cfg: SupabaseConfig): SupabaseClient | null {
  try {
    return createClient(cfg.u, cfg.k);
  } catch (err) {
    console.error('Supabase init failed:', err);
    return null;
  }
}

export async function testSupabaseConnection(cfg: SupabaseConfig): Promise<{ok: boolean; message: string}> {
  try {
    const res = await fetch(`${cfg.u}/rest/v1/orders?select=id&limit=1`, {
      headers: {apikey: cfg.k},
    });
    if (res.ok) return {ok: true, message: 'Koneksi tersambung'};
    if (res.status === 401 || res.status === 403) {
      return {ok: false, message: `Akses ditolak (${res.status}). Periksa publishable key dan policy RLS.`};
    }
    if (res.status === 404) {
      return {ok: false, message: 'Tabel orders tidak ditemukan.'};
    }
    const text = await res.text();
    return {ok: false, message: `Server membalas ${res.status}: ${text.slice(0, 120)}`};
  } catch {
    return {ok: false, message: `Tidak bisa terhubung ke ${cfg.u}. Periksa Project URL.`};
  }
}

export function mapOrderRow(r: SupabaseOrderRow): Order {
  return {
    id: r.id,
    name: r.name,
    addr: r.addr || '',
    tel: r.tel || '',
    driver: r.driver || '',
    note: r.note || '',
    st: r.st,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    link: r.link ?? null,
    at: r.at,
    startAt: r.start_at ?? null,
    doneAt: r.done_at ?? null,
    dLat: r.d_lat ?? null,
    dLng: r.d_lng ?? null,
    dAt: r.d_at ?? null,
    hasPhoto: Boolean(r.has_photo),
    failReason: r.fail_reason ?? null,
  };
}
