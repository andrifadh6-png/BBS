export type OrderStatus = 'baru' | 'jalan' | 'selesai' | 'gagal';

export type UserRole = 'owner' | 'driver';

export type TabId = 'aktif' | 'peta' | 'selesai' | 'riw' | 'rekap';

export type TravelModeOption = 'DRIVING' | 'TWO_WHEELER';

export interface Order {
  id: string;
  name: string;
  addr: string;
  tel: string;
  driver: string;
  note: string;
  st: OrderStatus;
  lat: number | null;
  lng: number | null;
  link: string | null;
  at: number;
  startAt: number | null;
  doneAt: number | null;
  dLat: number | null;
  dLng: number | null;
  dAt: number | null;
  hasPhoto: boolean;
  failReason: string | null;
}

export interface SupabaseOrderRow {
  id: string;
  name: string;
  addr: string;
  tel?: string | null;
  driver?: string | null;
  note?: string | null;
  st: OrderStatus;
  lat?: number | null;
  lng?: number | null;
  link?: string | null;
  at: number;
  start_at?: number | null;
  done_at?: number | null;
  d_lat?: number | null;
  d_lng?: number | null;
  d_at?: number | null;
  has_photo?: boolean | null;
  fail_reason?: string | null;
}

export interface SupabaseConfig {
  u: string;
  k: string;
}

export interface RouteOrigin {
  mode: 'gps' | 'custom';
  lat: number | null;
  lng: number | null;
  label: string;
}

export interface RouteLegInfo {
  fromName: string;
  toName: string;
  distanceMeters: number;
  durationMillis: number;
}

export interface ComputedRouteSummary {
  totalDistanceMeters: number;
  totalDurationMillis: number;
  legs: RouteLegInfo[];
}
