export interface PhotoBundle {
  suratJalan?: string;
  barang?: string;
  legacy?: string;
}

export function serializePhotoBundle(suratJalan: string, barang: string): string {
  return JSON.stringify({
    v: 2,
    suratJalan,
    barang,
  });
}

export function parsePhotoBundle(raw: string | null | undefined): PhotoBundle {
  if (!raw) return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {suratJalan?: string; barang?: string};
      return {
        suratJalan: parsed.suratJalan || undefined,
        barang: parsed.barang || undefined,
      };
    } catch {
      return {};
    }
  }
  return {legacy: raw};
}
