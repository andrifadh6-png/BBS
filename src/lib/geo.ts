import type {Order, RouteOrigin} from '../types';

export interface LatLng {
  lat: number;
  lng: number;
}

export function todayIso(): string {
  return new Date().toLocaleDateString('sv');
}

export function dateOfOrder(o: Order): string {
  return new Date(o.doneAt || o.at).toLocaleDateString('sv');
}

export function formatHm(t: number | null | undefined): string {
  if (!t) return '-';
  return new Date(t).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatShortDateTime(t: number | null | undefined): string {
  if (!t) return '-';
  return new Date(t).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatFullDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(millis: number): string {
  const totalMins = Math.max(1, Math.round(millis / 60000));
  if (totalMins < 60) return `${totalMins} mnt`;
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hours} jam ${mins} mnt` : `${hours} jam`;
}

export function getOrderDeliveryDuration(
  o: Order
): {ms: number; exact: boolean; bucket: 'fast' | 'medium' | 'slow'} | null {
  if (!o.doneAt) return null;
  let ms: number | null = null;
  let exact = false;
  if (o.startAt != null && o.doneAt >= o.startAt) {
    ms = o.doneAt - o.startAt;
    exact = true;
  } else if (o.doneAt >= o.at) {
    ms = o.doneAt - o.at;
    exact = false;
  }
  if (ms == null) return null;
  const mins = ms / 60000;
  const bucket: 'fast' | 'medium' | 'slow' =
    mins < 30 ? 'fast' : mins <= 60 ? 'medium' : 'slow';
  return {ms, exact, bucket};
}

export function parseLoc(raw: string | null | undefined): LatLng | null {
  const s = (raw || '').trim();
  if (!s) return null;
  const m =
    s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
    s.match(/[?&](?:q|query|ll|destination)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/) ||
    s.match(/^(-?\d+\.\d+)\s*[,; ]\s*(-?\d+\.\d+)$/);
  return m ? {lat: Number(m[1]), lng: Number(m[2])} : null;
}

export function getOrderDestinationTarget(o: Order): LatLng | string | null {
  if (o.lat != null && o.lng != null) {
    return {lat: o.lat, lng: o.lng};
  }
  const parsed = parseLoc(o.link);
  if (parsed) return parsed;
  if (o.addr.trim()) return o.addr.trim();
  return null;
}

export function buildSingleGoogleMapsUrl(o: Order): string {
  if (o.lat != null && o.lng != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
  }
  if (o.link && /^https?:\/\//.test(o.link)) {
    return o.link;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.addr || o.name)}`;
}

export function buildWazeUrl(o: Order): string {
  if (o.lat != null && o.lng != null) {
    return `https://waze.com/ul?ll=${o.lat},${o.lng}&navigate=yes`;
  }
  return `https://waze.com/ul?q=${encodeURIComponent(o.addr || o.name)}&navigate=yes`;
}

export function buildMultiStopGoogleMapsUrl(
  stops: Order[],
  origin?: RouteOrigin | null,
  travelMode: 'DRIVING' | 'TWO_WHEELER' = 'DRIVING'
): string | null {
  const validTargets = stops
    .map((o) => {
      if (o.lat != null && o.lng != null) return `${o.lat},${o.lng}`;
      const parsed = parseLoc(o.link);
      if (parsed) return `${parsed.lat},${parsed.lng}`;
      if (o.addr.trim()) return o.addr.trim();
      return null;
    })
    .filter((v): v is string => Boolean(v));

  if (validTargets.length === 0) return null;

  const params = new URLSearchParams({api: '1'});
  if (origin && origin.lat != null && origin.lng != null) {
    params.set('origin', `${origin.lat},${origin.lng}`);
  }
  const destination = validTargets[validTargets.length - 1];
  params.set('destination', destination);
  const waypoints = validTargets.slice(0, -1);
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.join('|'));
  }
  params.set('travelmode', travelMode === 'TWO_WHEELER' ? 'two-wheeler' : 'driving');
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function getCurrentPosition(): Promise<LatLng | null> {
  return new Promise((resolve) => {
    try {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6)),
          }),
        () => resolve(null),
        {enableHighAccuracy: true, timeout: 8000}
      );
    } catch {
      resolve(null);
    }
  });
}

export function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

export async function shrinkImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Foto tidak terbaca'));
    reader.readAsDataURL(file);
  });

  const im = await loadImageElement(dataUrl);
  if (!im) throw new Error('Format foto tidak didukung');

  let scale = Math.min(1, 900 / Math.max(im.width, im.height));
  let quality = 0.7;
  let output = '';

  for (let i = 0; i < 5; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(im.width * scale);
    canvas.height = Math.round(im.height * scale);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    }
    output = canvas.toDataURL('image/jpeg', quality);
    if (output.length < 170000) break;
    scale *= 0.8;
    quality -= 0.08;
  }

  return output;
}
