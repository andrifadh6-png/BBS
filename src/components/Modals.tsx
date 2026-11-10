import React, {useEffect, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {X, AlertTriangle, Download} from 'lucide-react';
import {parsePhotoBundle} from '../lib/photos';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  message,
  confirmLabel = 'Lanjut',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 min-[360px]:p-4">
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.14}}
            onClick={onCancel}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{opacity: 0, scale: 0.96, y: 8}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 8}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            className="relative z-10 w-full max-w-sm max-h-[92dvh] overflow-y-auto bg-white rounded-3xl border border-slate-200 p-4 min-[360px]:p-5 shadow-2xl"
          >
            <p className="text-[14px] min-[360px]:text-[14.5px] text-slate-800 leading-relaxed break-words">
              {message}
            </p>
            <div className="mt-4 grid grid-cols-1 min-[340px]:grid-cols-2 gap-2 min-[360px]:gap-2.5">
              <button
                type="button"
                onClick={onCancel}
                className="btn-surface-pill min-h-[44px] px-3 rounded-xl font-semibold text-[13.5px] min-[360px]:text-[14px] transition-all active:scale-[0.97]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`min-h-[44px] px-3 rounded-xl font-bold text-[13.5px] min-[360px]:text-[14px] transition-all active:scale-[0.97] ${
                  destructive ? 'btn-danger-glow' : 'btn-primary-glow'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

interface FailReasonDialogProps {
  open: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export const FailReasonDialog: React.FC<FailReasonDialogProps> = ({
  open,
  onConfirm,
  onCancel,
}) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = reason.trim() || 'Gagal dikirim';
    setReason('');
    onConfirm(cleaned);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 min-[360px]:p-4">
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.14}}
            onClick={onCancel}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px]"
          />
          <motion.form
            onSubmit={handleSubmit}
            initial={{opacity: 0, scale: 0.96, y: 8}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 8}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            className="relative z-10 w-full max-w-md max-h-[92dvh] overflow-y-auto bg-white rounded-3xl border border-slate-200 p-4 min-[360px]:p-5 shadow-2xl"
          >
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-display text-[16px] min-[360px]:text-[17px] font-bold">
                Kendala Pengiriman
              </h3>
            </div>
            <p className="text-[13px] text-slate-500 mb-3">
              Tuliskan alasan mengapa paket gagal dikirim:
            </p>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Penerima tidak ada di tempat / Alamat tidak ditemukan"
              className="w-full p-2.5 min-[360px]:p-3 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] min-[360px]:text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-red-500 focus:bg-white focus:outline-none"
            />
            <div className="mt-4 grid grid-cols-1 min-[340px]:grid-cols-2 gap-2 min-[360px]:gap-2.5">
              <button
                type="button"
                onClick={onCancel}
                className="btn-surface-pill min-h-[44px] px-3 rounded-xl font-semibold text-[13.5px] min-[360px]:text-[14px] transition-all active:scale-[0.97]"
              >
                Batal
              </button>
              <button
                type="submit"
                className="btn-danger-glow min-h-[44px] px-3 rounded-xl font-bold text-[13.5px] min-[360px]:text-[14px] transition-all active:scale-[0.97]"
              >
                Simpan Kendala
              </button>
            </div>
          </motion.form>
        </div>
      )}
    </AnimatePresence>
  );
};

interface PhotoModalProps {
  photoSrc: string | null;
  onClose: () => void;
}

export const PhotoModal: React.FC<PhotoModalProps> = ({photoSrc, onClose}) => {
  useEffect(() => {
    if (!photoSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [photoSrc, onClose]);

  const bundle = parsePhotoBundle(photoSrc);
  const items: Array<{label: string; filename: string; src: string}> = bundle.legacy
    ? [{label: 'Foto Bukti Pengantaran', filename: 'bukti-antar.jpg', src: bundle.legacy}]
    : [
        ...(bundle.suratJalan
          ? [{label: '1. Foto Surat Jalan', filename: 'surat-jalan-timesnap.jpg', src: bundle.suratJalan}]
          : []),
        ...(bundle.barang
          ? [{label: '2. Foto Barang', filename: 'foto-barang-timesnap.jpg', src: bundle.barang}]
          : []),
      ];

  return (
    <AnimatePresence>
      {photoSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 min-[360px]:p-4">
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.14}}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
          />
          <motion.div
            initial={{opacity: 0, scale: 0.96}}
            animate={{opacity: 1, scale: 1}}
            exit={{opacity: 0, scale: 0.96}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            className="relative z-10 w-full max-w-xl max-h-[92dvh] overflow-y-auto bg-white rounded-3xl border border-slate-200 p-3.5 min-[360px]:p-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-display text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 truncate">
                Foto Bukti Pengantaran
              </h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="btn-surface-pill w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-[0.94]"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="py-10 text-center text-[13.5px] text-slate-500">
                Foto tidak dapat dimuat.
              </div>
            ) : (
              <div className={`grid gap-3 ${items.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {items.map((item) => (
                  <div key={item.label} className="rounded-2xl bg-slate-50 border border-slate-200 p-2">
                    <div className="flex items-center justify-between gap-2 mb-1.5 px-1">
                      <span className="text-[12px] font-bold text-blue-700 truncate">
                        {item.label}
                      </span>
                      <a
                        href={item.src}
                        download={item.filename}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 text-[11px] font-semibold text-slate-700 hover:text-blue-700 transition-colors shrink-0"
                      >
                        <Download className="w-3 h-3" />
                        Unduh
                      </a>
                    </div>
                    <img
                      src={item.src}
                      alt={item.label}
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[55dvh] object-contain rounded-xl bg-slate-900"
                    />
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn-primary-glow mt-3 w-full min-h-[44px] rounded-xl font-bold text-[14px] transition-all active:scale-[0.98]"
            >
              Tutup
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
