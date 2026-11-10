import type {Order} from '../types';
import {formatShortDateTime, getOrderDeliveryDuration} from './geo';

function csvEscape(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportDailyCsv(
  rows: Order[],
  date: string,
  driverFilter: string
): void {
  const headers = [
    'No',
    'Tujuan',
    'Alamat',
    'Telepon',
    'Driver',
    'Catatan',
    'Status',
    'Alasan Kendala',
    'Waktu Input',
    'Mulai Antar',
    'Selesai',
    'Durasi (Menit)',
    'Foto Bukti',
    'Koordinat',
  ];

  const lines = [headers.map(csvEscape).join(',')];

  rows.forEach((o, idx) => {
    const dur = getOrderDeliveryDuration(o);
    const durMinutes = dur ? Math.max(1, Math.round(dur.ms / 60000)) : '';
    const coords =
      o.lat != null && o.lng != null ? `${o.lat}, ${o.lng}` : o.link || '';

    const line = [
      idx + 1,
      o.name,
      o.addr,
      o.tel,
      o.driver || '-',
      o.note,
      o.st.toUpperCase(),
      o.st === 'gagal' ? o.failReason || '-' : '',
      formatShortDateTime(o.at),
      o.startAt ? formatShortDateTime(o.startAt) : '-',
      o.doneAt ? formatShortDateTime(o.doneAt) : '-',
      durMinutes,
      o.hasPhoto ? 'Lengkap' : 'Tidak ada',
      coords,
    ];
    lines.push(line.map(csvEscape).join(','));
  });

  // UTF-8 BOM for clean Excel opening on Windows/Mac
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeDriver = (driverFilter || 'semua').replace(/\W+/g, '-');
  a.href = url;
  a.download = `rekap-${date}-${safeDriver}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
