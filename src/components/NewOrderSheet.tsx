import React, {useEffect, useMemo, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {X, LocateFixed, Plus, Layers} from 'lucide-react';
import {getCurrentPosition, parseLoc} from '../lib/geo';

export interface NewOrderPayload {
  name: string;
  addr: string;
  tel: string;
  driver: string;
  note: string;
  lat: number | null;
  lng: number | null;
  link: string | null;
  at: number;
}

interface NewOrderSheetProps {
  open: boolean;
  driverNames: string[];
  onClose: () => void;
  onSaveSingle: (row: NewOrderPayload) => Promise<void>;
  onSaveBulk: (rows: NewOrderPayload[], totalLines: number) => Promise<void>;
  onToast: (msg: string, bad?: boolean) => void;
}

function buildRow(
  name: string,
  addr: string,
  rawLoc: string,
  driver: string,
  note: string,
  tel: string,
  at: number
): NewOrderPayload {
  const parsed = parseLoc(rawLoc);
  return {
    name,
    addr,
    tel: tel || '',
    driver: driver || '',
    note: note || '',
    lat: parsed ? parsed.lat : null,
    lng: parsed ? parsed.lng : null,
    link: !parsed && rawLoc ? rawLoc : null,
    at,
  };
}

export const NewOrderSheet: React.FC<NewOrderSheetProps> = ({
  open,
  driverNames,
  onClose,
  onSaveSingle,
  onSaveBulk,
  onToast,
}) => {
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [name, setName] = useState('');
  const [addr, setAddr] = useState('');
  const [rawLoc, setRawLoc] = useState('');
  const [driver, setDriver] = useState('');
  const [tel, setTel] = useState('');
  const [note, setNote] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [bulkDriver, setBulkDriver] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const parsedPreview = parseLoc(rawLoc);
  const bulkSummary = useMemo(() => {
    const lines = bulkText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const validCount = lines.filter((line) => {
      const p = line.split('|').map((s) => s.trim());
      return Boolean(p[0] && (p[1] || p[2]));
    }).length;
    return {total: lines.length, valid: validCount};
  }, [bulkText]);

  const handleUseMyLocation = async () => {
    setLocating(true);
    const pos = await getCurrentPosition();
    setLocating(false);
    if (pos) {
      setRawLoc(`${pos.lat}, ${pos.lng}`);
      onToast('Lokasi GPS terbaca');
    } else {
      onToast('Lokasi tidak terbaca. Izinkan akses lokasi di browser.', true);
    }
  };

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    const nm = name.trim();
    const ad = addr.trim();
    const rl = rawLoc.trim();
    if (!nm || (!ad && !rl)) {
      onToast('Isi tujuan, lalu alamat atau titik lokasi.', true);
      return;
    }
    setSaving(true);
    try {
      await onSaveSingle(buildRow(nm, ad, rl, driver.trim(), note.trim(), tel.trim(), Date.now()));
      setName('');
      setAddr('');
      setRawLoc('');
      setTel('');
      setNote('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = bulkText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!lines.length) {
      onToast('Isi minimal satu baris.', true);
      return;
    }
    const baseTime = Date.now();
    const rows: NewOrderPayload[] = [];
    lines.forEach((line, idx) => {
      const p = line.split('|').map((s) => s.trim());
      if (!p[0] || (!p[1] && !p[2])) return;
      rows.push(
        buildRow(
          p[0],
          p[1] || '',
          p[2] || '',
          p[3] || bulkDriver.trim(),
          p[4] || '',
          '',
          baseTime + lines.length - idx
        )
      );
    });
    if (!rows.length) {
      onToast('Tidak ada baris yang valid. Isi minimal Tujuan dan Alamat.', true);
      return;
    }
    setSaving(true);
    try {
      await onSaveBulk(rows, lines.length);
      if (rows.length === lines.length) setBulkText('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <motion.div
            initial={{opacity: 0}}
            animate={{opacity: 1}}
            exit={{opacity: 0}}
            transition={{duration: 0.16}}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/45 backdrop-blur-[2px]"
          />

          <motion.div
            initial={{opacity: 0, y: 24}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 24}}
            transition={{duration: 0.2, ease: [0.16, 1, 0.3, 1]}}
            className="relative z-10 w-full max-w-xl md:mx-4 bg-white rounded-t-[28px] md:rounded-3xl border border-slate-200 shadow-2xl max-h-[92dvh] flex flex-col overflow-hidden"
          >
            {/* Mobile Drag Handle */}
            <div className="md:hidden w-10 h-1.5 rounded-full bg-slate-300 mx-auto mt-2.5 shrink-0" />

            {/* Header */}
            <div className="px-3.5 min-[360px]:px-5 pt-3 min-[360px]:pt-4 pb-2.5 min-[360px]:pb-3 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h2 className="font-display text-[18px] min-[360px]:text-[20px] font-bold text-slate-900 truncate">
                  Order Baru
                </h2>
                <p className="text-[12px] min-[360px]:text-[12.5px] text-slate-500 leading-snug">
                  Isi detail penerima, alamat, atau tautan Google Maps
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Tutup"
                className="btn-surface-pill w-10 h-10 rounded-xl flex items-center justify-center transition-all active:scale-[0.94] shrink-0"
              >
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>

            <div className="p-3.5 min-[360px]:p-5 overflow-y-auto space-y-3.5 min-[360px]:space-y-4">
              {/* Segmented mode switcher */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setMode('single')}
                  className={`min-h-[40px] px-2 rounded-lg text-[12.5px] min-[360px]:text-[13.5px] font-semibold inline-flex items-center justify-center gap-1 min-[360px]:gap-1.5 transition-all whitespace-nowrap ${
                    mode === 'single'
                      ? 'bg-white text-blue-600 border border-blue-200 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 min-[360px]:w-4 min-[360px]:h-4 shrink-0" />
                  Satu order
                </button>
                <button
                  type="button"
                  onClick={() => setMode('bulk')}
                  className={`min-h-[40px] px-2 rounded-lg text-[12.5px] min-[360px]:text-[13.5px] font-semibold inline-flex items-center justify-center gap-1 min-[360px]:gap-1.5 transition-all whitespace-nowrap ${
                    mode === 'bulk'
                      ? 'bg-white text-blue-600 border border-blue-200 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 min-[360px]:w-4 min-[360px]:h-4 shrink-0" />
                  Banyak sekaligus
                </button>
              </div>

              {mode === 'single' ? (
                <form onSubmit={handleSubmitSingle} className="space-y-3.5">
                  <div>
                    <label htmlFor="f_nm" className="block text-[13px] font-semibold text-slate-700 mb-1">
                      Tujuan atau nama penerima
                    </label>
                    <input
                      id="f_nm"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Contoh: Toko Sinar Jaya / Bpk. Andi"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="f_ad" className="block text-[13px] font-semibold text-slate-700 mb-1">
                      Alamat lengkap
                    </label>
                    <input
                      id="f_ad"
                      value={addr}
                      onChange={(e) => setAddr(e.target.value)}
                      placeholder="Contoh: Jl. Sudirman No. 12, Jakarta Selatan"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label htmlFor="f_ll" className="block text-[13px] font-semibold text-slate-700 mb-1">
                      Link Google Maps atau koordinat (opsional)
                    </label>
                    <div className="flex flex-col min-[360px]:flex-row gap-2">
                      <input
                        id="f_ll"
                        value={rawLoc}
                        onChange={(e) => setRawLoc(e.target.value)}
                        placeholder="https://maps.app.goo.gl/... atau -6.2088, 106.8456"
                        className="w-full min-w-0 min-[360px]:flex-1 min-h-[44px] px-3 min-[360px]:px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[13px] min-[360px]:text-[13.5px] font-mono-num text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        disabled={locating}
                        onClick={handleUseMyLocation}
                        className="min-h-[44px] px-3.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-all active:scale-[0.97] disabled:opacity-50"
                      >
                        <LocateFixed className="w-4 h-4" />
                        {locating ? 'GPS…' : 'Lokasi Saya'}
                      </button>
                    </div>
                    {parsedPreview && (
                      <p className="text-[12px] text-blue-600 font-medium mt-1 font-mono-num">
                        Titik terbaca: {parsedPreview.lat}, {parsedPreview.lng}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="f_dr" className="block text-[13px] font-semibold text-slate-700 mb-1">
                        Nama driver
                      </label>
                      <input
                        id="f_dr"
                        list="driver-list"
                        value={driver}
                        onChange={(e) => setDriver(e.target.value)}
                        placeholder="Contoh: Budi"
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="f_tl" className="block text-[13px] font-semibold text-slate-700 mb-1">
                        Telepon penerima (opsional)
                      </label>
                      <input
                        id="f_tl"
                        inputMode="tel"
                        value={tel}
                        onChange={(e) => setTel(e.target.value)}
                        placeholder="0812..."
                        className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="f_nt" className="block text-[13px] font-semibold text-slate-700 mb-1">
                      Catatan atau barang
                    </label>
                    <input
                      id="f_nt"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Contoh: 3 dus barang pecah belah"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary-glow w-full min-h-[48px] rounded-xl font-bold text-[15px] transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan…' : 'Simpan Order'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmitBulk} className="space-y-3.5">
                  <div className="text-[12.5px] text-slate-600 leading-relaxed bg-blue-50/70 border border-blue-100 rounded-xl p-3 space-y-1.5">
                    <p>
                      Satu order per baris, dipisah tanda <code className="font-mono-num font-bold text-blue-700">|</code>. Urutan:{' '}
                      <span className="font-medium text-slate-900">
                        Tujuan | Alamat | Link Maps atau koordinat | Driver | Catatan
                      </span>
                      . Hanya Tujuan dan Alamat yang wajib.
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[12px] font-semibold text-blue-700 tabular-nums">
                        {bulkSummary.total > 0
                          ? `${bulkSummary.valid} dari ${bulkSummary.total} baris siap disimpan`
                          : 'Belum ada baris diisi'}
                      </span>
                      {!bulkText.trim() && (
                        <button
                          type="button"
                          onClick={() =>
                            setBulkText(
                              'Toko Sumber Rejeki | Jl. Sudirman No. 12, Jakarta | -6.2088, 106.8456 | Budi | 3 dus\nPT Maju Bersama | Jl. Gatot Subroto Kav. 21 | | Andi | Pecah belah'
                            )
                          }
                          className="text-[12px] font-bold text-blue-700 hover:underline"
                        >
                          Isi contoh
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={6}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="PT Maju | Jl. Sudirman 10 | -6.2088, 106.8456 | Budi | 2 dus"
                    className="w-full p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                  />

                  <div>
                    <label htmlFor="b_dr" className="block text-[13px] font-semibold text-slate-700 mb-1">
                      Driver default untuk baris tanpa nama driver
                    </label>
                    <input
                      id="b_dr"
                      list="driver-list"
                      value={bulkDriver}
                      onChange={(e) => setBulkDriver(e.target.value)}
                      placeholder="Opsional"
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary-glow w-full min-h-[48px] rounded-xl font-bold text-[15px] transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {saving ? 'Menyimpan…' : 'Simpan Semua Order'}
                  </button>
                </form>
              )}

              <datalist id="driver-list">
                {driverNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
