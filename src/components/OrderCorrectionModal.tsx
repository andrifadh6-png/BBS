import React, {useEffect, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {Camera, Check, Clock, Trash2, X} from 'lucide-react';
import type {Order, OrderStatus} from '../types';
import {formatDuration, formatShortDateTime, getOrderDeliveryDuration} from '../lib/geo';
import {parsePhotoBundle} from '../lib/photos';

interface OrderCorrectionModalProps {
  order: Order | null;
  isOwner: boolean;
  busy: boolean;
  fetchPhoto: (orderId: string) => Promise<string | null>;
  onRetakePhotos: (orderId: string) => void;
  onSaveCorrection: (
    orderId: string,
    patch: {
      name: string;
      addr: string;
      driver: string;
      tel: string;
      note: string;
      st: OrderStatus;
      fail_reason: string | null;
      done_at: number | null;
    }
  ) => Promise<void>;
  onDeleteOrder: (orderId: string) => void;
  onClose: () => void;
}

const STATUS_OPTIONS: Array<{value: OrderStatus; label: string; desc: string}> = [
  {value: 'selesai', label: 'Selesai', desc: 'Pengantaran berhasil'},
  {value: 'gagal', label: 'Kendala / Gagal', desc: 'Ada kendala saat antar'},
  {value: 'jalan', label: 'Kembalikan: Sedang diantar', desc: 'Masuk lagi ke tab Aktif'},
  {value: 'baru', label: 'Kembalikan: Baru', desc: 'Reset ke order baru'},
];

export const OrderCorrectionModal: React.FC<OrderCorrectionModalProps> = ({
  order,
  isOwner,
  busy,
  fetchPhoto,
  onRetakePhotos,
  onSaveCorrection,
  onDeleteOrder,
  onClose,
}) => {
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [driver, setDriver] = useState('');
  const [tel, setTel] = useState('');
  const [note, setNote] = useState('');
  const [st, setSt] = useState<OrderStatus>('selesai');
  const [failReason, setFailReason] = useState('');

  const [photoRaw, setPhotoRaw] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);

  useEffect(() => {
    if (!order) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [order, onClose]);

  useEffect(() => {
    if (!order) {
      setPhotoRaw(null);
      return;
    }
    setName(order.name || '');
    setAddr(order.addr || '');
    setDriver(order.driver || '');
    setTel(order.tel || '');
    setNote(order.note || '');
    setSt(order.st);
    setFailReason(order.failReason || '');

    if (order.hasPhoto) {
      let active = true;
      setLoadingPhoto(true);
      fetchPhoto(order.id)
        .then((data) => {
          if (active) setPhotoRaw(data);
        })
        .catch(() => {
          if (active) setPhotoRaw(null);
        })
        .finally(() => {
          if (active) setLoadingPhoto(false);
        });
      return () => {
        active = false;
      };
    } else {
      setPhotoRaw(null);
      setLoadingPhoto(false);
    }
  }, [order, fetchPhoto]);

  const bundle = parsePhotoBundle(photoRaw);
  const photoItems = bundle.legacy
    ? [{label: 'Foto Bukti', src: bundle.legacy}]
    : [
        ...(bundle.suratJalan ? [{label: '1. Surat Jalan', src: bundle.suratJalan}] : []),
        ...(bundle.barang ? [{label: '2. Foto Barang', src: bundle.barang}] : []),
      ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || busy) return;
    const isActive = st === 'baru' || st === 'jalan';
    await onSaveCorrection(order.id, {
      name: name.trim() || order.name,
      addr: addr.trim(),
      driver: driver.trim(),
      tel: tel.trim(),
      note: note.trim(),
      st,
      fail_reason: st === 'gagal' ? failReason.trim() || 'Gagal dikirim' : null,
      done_at: isActive ? null : order.doneAt || Date.now(),
    });
  };

  const dur = order ? getOrderDeliveryDuration(order) : null;

  return (
    <AnimatePresence>
      {order && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 20}}
            transition={{duration: 0.2, ease: [0.16, 1, 0.3, 1]}}
            className="relative z-10 w-full max-w-xl bg-white rounded-t-[26px] sm:rounded-3xl border border-slate-200 shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 bg-white">
              <div className="min-w-0">
                <h2 className="font-display text-[17px] sm:text-[18px] font-bold text-slate-900 truncate">
                  Cek & Koreksi Riwayat
                </h2>
                <p className="text-[12px] text-slate-500 flex flex-wrap items-center gap-x-2 mt-0.5">
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    {formatShortDateTime(order.doneAt || order.at)}
                  </span>
                  {dur && (
                    <span className="tabular-nums">
                      · Durasi {dur.exact ? '' : '~'}
                      {formatDuration(dur.ms)}
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="btn-surface-pill w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-[0.94]"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4">
              {/* Photo Inspection Section */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-slate-800">
                    Cek Foto Bukti (Surat Jalan & Barang)
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onClose();
                      onRetakePhotos(order.id);
                    }}
                    className="min-h-[36px] px-3 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[12px] font-bold inline-flex items-center gap-1.5 transition-all active:scale-[0.97]"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    {order.hasPhoto ? 'Foto Ulang 2x (TimeSnap)' : 'Ambil 2 Foto (TimeSnap)'}
                  </button>
                </div>

                {loadingPhoto ? (
                  <div className="h-28 rounded-xl bg-slate-200/70 animate-pulse" />
                ) : photoItems.length === 0 ? (
                  <p className="text-[12.5px] text-slate-500 py-2">
                    Belum ada foto bukti terlampir pada order ini.
                  </p>
                ) : (
                  <div className={`grid gap-2.5 ${photoItems.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    {photoItems.map((item) => (
                      <div key={item.label} className="rounded-xl bg-white border border-slate-200 p-1.5">
                        <div className="text-[11px] font-bold text-blue-700 px-1 pb-1">
                          {item.label}
                        </div>
                        <img
                          src={item.src}
                          alt={item.label}
                          referrerPolicy="no-referrer"
                          className="w-full aspect-[4/3] object-cover rounded-lg bg-slate-900"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Correction */}
              <div>
                <label className="block text-[13px] font-bold text-slate-800 mb-1.5">
                  Koreksi Status
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const selected = st === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSt(opt.value)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          selected
                            ? opt.value === 'gagal'
                              ? 'bg-red-50 border-red-300 text-red-800'
                              : 'bg-blue-50 border-blue-300 text-blue-800'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-[13px] font-bold">{opt.label}</div>
                        <div className="text-[11.5px] opacity-75">{opt.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {st === 'gagal' && (
                <div>
                  <label htmlFor="corr_fail" className="block text-[13px] font-semibold text-red-700 mb-1">
                    Alasan Kendala
                  </label>
                  <input
                    id="corr_fail"
                    value={failReason}
                    onChange={(e) => setFailReason(e.target.value)}
                    placeholder="Tuliskan alasan kendala"
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-red-50/50 border border-red-200 text-[13.5px] text-slate-900 focus:border-red-500 focus:bg-white focus:outline-none"
                  />
                </div>
              )}

              {/* Data Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="corr_name" className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                    Tujuan / Penerima
                  </label>
                  <input
                    id="corr_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="corr_drv" className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                    Nama Driver
                  </label>
                  <input
                    id="corr_drv"
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="corr_addr" className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                  Alamat
                </label>
                <input
                  id="corr_addr"
                  value={addr}
                  onChange={(e) => setAddr(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="corr_tel" className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                    Telepon
                  </label>
                  <input
                    id="corr_tel"
                    value={tel}
                    onChange={(e) => setTel(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="corr_note" className="block text-[12.5px] font-semibold text-slate-700 mb-1">
                    Catatan
                  </label>
                  <input
                    id="corr_note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
                {isOwner && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      onClose();
                      onDeleteOrder(order.id);
                    }}
                    className="min-h-[44px] px-3.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-[13px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.97]"
                  >
                    <Trash2 className="w-4 h-4" />
                    Hapus
                  </button>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn-surface-pill min-h-[44px] px-4 rounded-xl text-[13.5px] font-semibold transition-all active:scale-[0.97]"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="btn-primary-glow min-h-[44px] px-4 rounded-xl text-[13.5px] font-bold inline-flex items-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    {busy ? 'Menyimpan…' : 'Simpan Koreksi'}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
