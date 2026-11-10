import {jsPDF} from 'jspdf';
import type {Order} from '../types';
import {formatHm, loadImageElement} from './geo';
import {parsePhotoBundle} from './photos';

interface LoadedPdfImage {
  label: string;
  data: string;
  w: number;
  h: number;
}

export async function exportDailyPdf(
  rows: Order[],
  date: string,
  driverFilter: string,
  fetchPhoto: (orderId: string) => Promise<string | null>
): Promise<void> {
  const doc = new jsPDF({unit: 'mm', format: 'a4'});
  const W = 210;
  const H = 297;
  const M = 15;
  let y = M;
  let n = 0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`DRIVER BBS - Rekap Pengantaran ${date} - ${driverFilter || 'Semua driver'}`, M, y + 4);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const doneCount = rows.filter((o) => o.st === 'selesai').length;
  const failCount = rows.filter((o) => o.st === 'gagal').length;
  doc.text(`Total order: ${rows.length}  |  Selesai: ${doneCount}  |  Gagal: ${failCount}`, M, y);
  y += 8;

  for (const o of rows) {
    n += 1;
    const loadedImages: LoadedPdfImage[] = [];
    if (o.hasPhoto) {
      try {
        const rawData = await fetchPhoto(o.id);
        const bundle = parsePhotoBundle(rawData);
        const pairs: Array<{label: string; src?: string}> = bundle.legacy
          ? [{label: 'Bukti Antar', src: bundle.legacy}]
          : [
              {label: '1. Surat Jalan', src: bundle.suratJalan},
              {label: '2. Foto Barang', src: bundle.barang},
            ];

        for (const item of pairs) {
          if (!item.src) continue;
          const el = await loadImageElement(item.src);
          if (el) {
            loadedImages.push({
              label: item.label,
              data: item.src,
              w: el.width,
              h: el.height,
            });
          }
        }
      } catch {
        // ignore broken image
      }
    }

    const t1 = doc.splitTextToSize(`${n}. ${o.name} (Driver: ${o.driver || '-'})`, W - 2 * M);
    const t2 = doc.splitTextToSize(`${o.addr || ''}${o.note ? ` | Catatan: ${o.note}` : ''}`, W - 2 * M);
    const t3 = `Mulai ${formatHm(o.startAt)}  |  Selesai/Tutup ${formatHm(o.doneAt)}  |  Status: ${o.st.toUpperCase()}${
      o.failReason ? ` (${o.failReason})` : ''
    }`;

    let imgBlockH = 6;
    const colGap = 5;
    const maxColW = loadedImages.length === 2 ? (W - 2 * M - colGap) / 2 : W - 2 * M;
    const sizedImages = loadedImages.map((im) => {
      let iw = maxColW;
      let ih = (iw * im.h) / im.w;
      const maxH = loadedImages.length === 2 ? 75 : 105;
      if (ih > maxH) {
        ih = maxH;
        iw = (ih * im.w) / im.h;
      }
      return {...im, iw, ih};
    });

    if (sizedImages.length > 0) {
      imgBlockH = Math.max(...sizedImages.map((im) => im.ih)) + 8;
    }

    if (y + (t1.length + t2.length + 1) * 5 + imgBlockH + 8 > H - M) {
      doc.addPage();
      y = M;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(t1, M, y + 4);
    y += t1.length * 5 + 1;

    doc.setFont('helvetica', 'normal');
    doc.text(t2, M, y + 4);
    y += t2.length * 5;
    doc.text(t3, M, y + 4);
    y += 7;

    if (sizedImages.length > 0) {
      sizedImages.forEach((im, idx) => {
        const xPos = M + idx * (maxColW + colGap);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(im.label, xPos, y + 2);
        doc.addImage(im.data, 'JPEG', xPos, y + 4, im.iw, im.ih);
      });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      y += Math.max(...sizedImages.map((im) => im.ih)) + 8;
    } else {
      const noteText = o.hasPhoto
        ? '(foto gagal dimuat)'
        : o.st === 'gagal'
          ? `(Kendala: ${o.failReason || '-'})`
          : '(tanpa foto)';
      doc.text(noteText, M, y + 3);
      y += 6;
    }

    doc.setDrawColor(210);
    doc.line(M, y, W - M, y);
    y += 5;
  }

  const safeDriver = (driverFilter || 'semua').replace(/\W+/g, '-');
  doc.save(`rekap-${date}-${safeDriver}.pdf`);
}
