import React from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {
  Navigation,
  Play,
  Camera,
  Check,
  AlertTriangle,
  Image as ImageIcon,
  Trash2,
  LocateFixed,
  Phone,
  MessageCircle,
  Pencil,
} from 'lucide-react';
import type {Order} from '../types';
import {
  buildSingleGoogleMapsUrl,
  formatDuration,
  formatHm,
  formatShortDateTime,
} from '../lib/geo';

interface OrderCardProps {
  order: Order;
  isOwner: boolean;
  busy: boolean;
  index?: number;
  routeIndex?: number | null;
  nowMs?: number;
  onStart: (id: string) => void;
  onPhotoDone: (id: string) => void;
  onDoneNoPhoto: (id: string) => void;
  onFail: (id: string) => void;
  onViewPhoto: (id: string) => void;
  onCorrect?: (id: string) => void;
  onDelete: (id: string) => void;
}

const STATUS_META = {
  baru: {
    label: 'Baru',
    surface: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  jalan: {
    label: 'Sedang diantar',
    surface: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  selesai: {
    label: 'Selesai',
    surface: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  gagal: {
    label: 'Kendala',
    surface: 'bg-red-50 text-red-700 border-red-200',
  },
} as const;

export const OrderCard: React.FC<OrderCardProps> = ({
  order,
  isOwner,
  busy,
  index = 0,
  routeIndex,
  nowMs = Date.now(),
  onStart,
  onPhotoDone,
  onDoneNoPhoto,
  onFail,
  onViewPhoto,
  onCorrect,
  onDelete,
}) => {
  const status = STATUS_META[order.st];
  const gMapsUrl = buildSingleGoogleMapsUrl(order);
  const waPhone = (() => {
    const digits = (order.tel || '').replace(/\D+/g, '');
    if (digits.length < 8) return null;
    if (digits.startsWith('0')) return `62${digits.slice(1)}`;
    if (digits.startsWith('8')) return `62${digits}`;
    return digits;
  })();
  const elapsedDeliveryMs =
    order.st === 'jalan' && order.startAt != null ? Math.max(0, nowMs - order.startAt) : null;
  const isOverdueDelivery = elapsedDeliveryMs != null && elapsedDeliveryMs > 60 * 60 * 1000;

  return (
    <motion.article
      layout="position"
      initial={{opacity: 0, y: 10}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, scale: 0.97, y: -6}}
      whileHover={{y: -2}}
      transition={{
        duration: 0.2,
        delay: Math.min(index * 0.025, 0.15),
        ease: [0.16, 1, 0.3, 1],
      }}
      className={`rounded-2xl bg-white border shadow-[0_2px_12px_rgba(15,23,42,0.05)] hover:shadow-[0_10px_24px_-6px_rgba(37,99,235,0.12)] transition-all duration-200 p-3.5 min-[360px]:p-4 flex flex-col justify-between ${
        isOverdueDelivery
          ? 'border-red-300 hover:border-red-400'
          : 'border-slate-200 hover:border-blue-300'
      }`}
    >
      <div>
        {/* Top row: Order name + Status + >60m overdue alert */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex items-start gap-2.5">
            {routeIndex != null && (
              <span className="mt-0.5 w-6 h-6 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 font-mono-num text-[11.5px] font-bold flex items-center justify-center shrink-0">
                {routeIndex + 1}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="font-display text-[16px] min-[360px]:text-[17px] font-bold text-slate-900 leading-snug break-words">
                {order.name}
              </h3>
              <p className="text-[13.5px] min-[360px]:text-[14px] text-slate-600 mt-0.5 leading-relaxed break-words">
                {order.addr || 'Alamat belum diisi'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={order.st}
                initial={{opacity: 0, scale: 0.9, y: -3}}
                animate={{opacity: 1, scale: 1, y: 0}}
                exit={{opacity: 0, scale: 0.9, y: 3}}
                transition={{duration: 0.18, ease: [0.16, 1, 0.3, 1]}}
                className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[11.5px] font-semibold whitespace-nowrap ${status.surface}`}
              >
                {status.label}
              </motion.span>
            </AnimatePresence>

            {isOverdueDelivery && elapsedDeliveryMs != null && (
              <span
                title={`Pengantaran melebihi 60 menit (${formatDuration(elapsedDeliveryMs)})`}
                aria-label={`Peringatan pengantaran lambat lebih dari 60 menit (${formatDuration(elapsedDeliveryMs)})`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[11px] font-bold whitespace-nowrap tabular-nums"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                <span>&gt; 60 mnt ({formatDuration(elapsedDeliveryMs)})</span>
              </span>
            )}
          </div>
        </div>

        {/* Clean metadata row */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] min-[360px]:text-[13px] text-slate-500">
          <span className="font-semibold text-slate-800">
            {order.driver || 'Belum ada driver'}
          </span>
          {order.tel && (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={`tel:${order.tel.replace(/\s+/g, '')}`}
                className="inline-flex items-center gap-1 text-slate-700 hover:text-blue-600 font-medium tabular-nums transition-colors"
              >
                <Phone className="w-3 h-3 text-blue-600" />
                {order.tel}
              </a>
              {waPhone && (
                <a
                  href={`https://wa.me/${waPhone}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[11px] font-bold transition-colors"
                >
                  <MessageCircle className="w-3 h-3" />
                  WA
                </a>
              )}
            </>
          )}
          {order.note && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-600">Catatan: {order.note}</span>
            </>
          )}
        </div>

        {/* Live driver GPS & completion info */}
        {(order.dLat != null && order.st === 'jalan') ||
        order.doneAt ||
        (order.st === 'gagal' && order.failReason) ? (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] min-[360px]:text-[12.5px] text-slate-500">
            {order.dLat != null && order.st === 'jalan' && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${order.dLat},${order.dLng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-semibold tabular-nums"
              >
                <LocateFixed className="w-3.5 h-3.5" />
                Posisi driver {formatHm(order.dAt)}
              </a>
            )}
            {order.doneAt && (
              <span className="tabular-nums">
                {order.st === 'gagal' ? 'Kendala' : 'Selesai'}: {formatShortDateTime(order.doneAt)}
              </span>
            )}
            {order.st === 'gagal' && order.failReason && (
              <span className="text-red-600 font-medium">Alasan: {order.failReason}</span>
            )}
          </div>
        ) : null}
      </div>

      <div>
        {/* Main Action Row — Simplified for Drivers */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {order.st === 'baru' && (
            <motion.button
              key="cta-baru-start"
              initial={{opacity: 0, y: 4}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
              type="button"
              disabled={busy}
              onClick={() => onStart(order.id)}
              className="btn-primary-glow flex-1 min-w-[130px] min-h-[44px] px-4 py-2 rounded-xl font-bold text-[14px] inline-flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              Mulai Antar
            </motion.button>
          )}

          {order.st === 'jalan' && (
            <motion.button
              key="cta-jalan-photo"
              initial={{opacity: 0, y: 4}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
              type="button"
              disabled={busy}
              onClick={() => onPhotoDone(order.id)}
              className="btn-primary-glow flex-1 min-w-[140px] min-h-[44px] px-4 py-2 rounded-xl font-bold text-[14px] inline-flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
            >
              <Camera className="w-4 h-4" />
              Foto & Selesai
            </motion.button>
          )}

          {order.st === 'selesai' && order.hasPhoto && (
            <motion.button
              key="cta-selesai"
              initial={{opacity: 0, y: 4}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
              type="button"
              onClick={() => onViewPhoto(order.id)}
              className="btn-surface-pill flex-1 min-w-[115px] min-h-[44px] px-4 py-2 rounded-xl font-semibold text-[14px] inline-flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.97] whitespace-nowrap"
            >
              <ImageIcon className="w-4 h-4 text-blue-600" />
              Lihat Foto
            </motion.button>
          )}

          <a
            href={gMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-semibold text-[13.5px] inline-flex items-center justify-center gap-1.5 transition-all duration-150 active:scale-[0.97] whitespace-nowrap"
          >
            <Navigation className="w-3.5 h-3.5" />
            Maps
          </a>
        </div>

        {/* Clean Secondary Row — Essential Actions */}
        {(order.st === 'baru' || order.st === 'jalan' || isOwner || Boolean(onCorrect)) && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
            {order.st === 'baru' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onPhotoDone(order.id)}
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[12px] font-semibold inline-flex items-center gap-1 transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
              >
                <Camera className="w-3.5 h-3.5" />
                Foto & Selesai
              </button>
            )}

            {(order.st === 'baru' || order.st === 'jalan') && (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDoneNoPhoto(order.id)}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-[12px] font-semibold inline-flex items-center gap-1 transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
                >
                  <Check className="w-3.5 h-3.5" />
                  Selesai
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onFail(order.id)}
                  className="min-h-[36px] px-2.5 py-1 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[12px] font-semibold inline-flex items-center gap-1 transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Kendala
                </button>
              </>
            )}

            {onCorrect && (isOwner || order.st === 'selesai' || order.st === 'gagal') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onCorrect(order.id)}
                className="btn-surface-pill min-h-[36px] px-2.5 py-1 rounded-xl text-[12px] font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 inline-flex items-center gap-1 transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
              >
                <Pencil className="w-3 h-3" />
                {order.st === 'selesai' || order.st === 'gagal' ? 'Cek / Koreksi' : 'Edit'}
              </button>
            )}

            {isOwner && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDelete(order.id)}
                aria-label="Hapus order"
                className="min-h-[36px] px-2.5 py-1 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[12px] font-semibold inline-flex items-center gap-1 ml-auto transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus
              </button>
            )}
          </div>
        )}
      </div>
    </motion.article>
  );
};
