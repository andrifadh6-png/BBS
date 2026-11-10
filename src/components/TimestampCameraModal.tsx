import React, {useCallback, useEffect, useRef, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {
  Camera,
  Check,
  Clock,
  MapPin,
  RotateCcw,
  SwitchCamera,
  Upload,
  X,
  ArrowRight,
  FileText,
  Package,
} from 'lucide-react';
import type {Order} from '../types';
import {getCurrentPosition, loadImageElement, type LatLng} from '../lib/geo';

export type PhotoStep = 'suratJalan' | 'barang';

interface TimestampCameraModalProps {
  order: Order | null;
  busy: boolean;
  onClose: () => void;
  onConfirmPhotos: (
    orderId: string,
    suratJalanUrl: string,
    barangUrl: string,
    coords: LatLng | null
  ) => Promise<void>;
}

function formatStampDateTime(date: Date): {timeStr: string; dateStr: string} {
  const timeStr = date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const dateStr = date.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return {timeStr, dateStr};
}

async function renderTimestampedJpeg(
  source: HTMLVideoElement | HTMLImageElement,
  srcWidth: number,
  srcHeight: number,
  order: Order,
  step: PhotoStep,
  coords: LatLng | null,
  now: Date
): Promise<string> {
  const maxDim = 860;
  let scale = Math.min(1, maxDim / Math.max(srcWidth, srcHeight));
  let quality = 0.74;
  let output = '';

  const {timeStr, dateStr} = formatStampDateTime(now);
  const coordText = coords
    ? `GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
    : order.addr || 'Lokasi pengantaran';
  const subText = `${order.name}${order.driver ? ` · ${order.driver}` : ''}`;
  const stepTag = step === 'suratJalan' ? 'SURAT JALAN' : 'FOTO BARANG';

  for (let attempt = 0; attempt < 5; attempt++) {
    const w = Math.max(320, Math.round(srcWidth * scale));
    const h = Math.max(240, Math.round(srcHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) break;

    ctx.drawImage(source, 0, 0, w, h);

    // Bottom gradient scrim for stamp readability
    const scrimH = Math.round(Math.max(115, h * 0.35));
    const grad = ctx.createLinearGradient(0, h - scrimH, 0, h);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.56)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.88)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - scrimH, w, scrimH);

    const pad = Math.round(Math.max(14, w * 0.03));
    const timeFontSize = Math.round(Math.max(18, w * 0.043));
    const dateFontSize = Math.round(Math.max(12, w * 0.023));
    const metaFontSize = Math.round(Math.max(11, w * 0.021));
    const tagFontSize = Math.round(Math.max(10, w * 0.017));

    const blockHeight = timeFontSize + dateFontSize + metaFontSize * 2 + 24;
    const blockTop = h - pad - blockHeight;
    const barW = Math.max(4, Math.round(w * 0.008));

    ctx.fillStyle = '#3B82F6';
    ctx.fillRect(pad, blockTop + 3, barW, blockHeight - 3);

    const textX = pad + barW + Math.round(Math.max(9, w * 0.018));

    // Top-right badge: Step Type + TimeSnap
    const badgeLabel = `${stepTag} · TIMESNAP`;
    ctx.font = `700 ${tagFontSize}px "Plus Jakarta Sans", system-ui, sans-serif`;
    const badgeMetrics = ctx.measureText(badgeLabel);
    const badgePadX = 9;
    const badgeH = tagFontSize + 9;
    const badgeW = badgeMetrics.width + badgePadX * 2;
    const badgeX = w - pad - badgeW;
    const badgeY = h - pad - badgeH;

    ctx.fillStyle = 'rgba(37, 99, 235, 0.9)';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    } else {
      ctx.rect(badgeX, badgeY, badgeW, badgeH);
    }
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeLabel, badgeX + badgePadX, badgeY + badgeH / 2);

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${timeFontSize}px "JetBrains Mono", monospace`;
    ctx.fillText(timeStr, textX, blockTop);

    let curY = blockTop + timeFontSize + 3;
    ctx.fillStyle = '#BFDBFE';
    ctx.font = `600 ${dateFontSize}px "DM Sans", system-ui, sans-serif`;
    ctx.fillText(dateStr, textX, curY);

    curY += dateFontSize + 7;
    ctx.fillStyle = '#F8FAFC';
    ctx.font = `700 ${metaFontSize}px "DM Sans", system-ui, sans-serif`;
    const maxTextW = Math.max(130, w - textX - pad);
    ctx.fillText(subText, textX, curY, maxTextW);

    curY += metaFontSize + 4;
    ctx.fillStyle = '#E2E8F0';
    ctx.font = `500 ${metaFontSize}px "DM Sans", system-ui, sans-serif`;
    const maxBottomW = Math.max(110, badgeX - textX - 10);
    ctx.fillText(coordText, textX, curY, maxBottomW);

    output = canvas.toDataURL('image/jpeg', quality);
    if (output.length < 115000) break;
    scale *= 0.82;
    quality -= 0.08;
  }

  return output;
}

export const TimestampCameraModal: React.FC<TimestampCameraModalProps> = ({
  order,
  busy,
  onClose,
  onConfirmPhotos,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileFallbackRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState<PhotoStep>('suratJalan');
  const [suratJalanUrl, setSuratJalanUrl] = useState<string | null>(null);
  const [barangUrl, setBarangUrl] = useState<string | null>(null);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraState, setCameraState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [cameraMsg, setCameraMsg] = useState('');
  const [coords, setCoords] = useState<LatLng | null>(null);
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  const [processing, setProcessing] = useState(false);

  const currentPreview = step === 'suratJalan' ? suratJalanUrl : barangUrl;
  const bothReady = Boolean(suratJalanUrl && barangUrl);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!order) {
      setStep('suratJalan');
      setSuratJalanUrl(null);
      setBarangUrl(null);
      setProcessing(false);
      stopStream();
    } else {
      setStep('suratJalan');
      setSuratJalanUrl(null);
      setBarangUrl(null);
    }
  }, [order, stopStream]);

  // Live clock tick inside viewfinder
  useEffect(() => {
    if (!order || currentPreview) return;
    setLiveNow(new Date());
    const id = window.setInterval(() => setLiveNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [order, currentPreview]);

  // Grab GPS coordinates for stamp when modal opens
  useEffect(() => {
    if (!order) return;
    let active = true;
    setCoords(null);
    getCurrentPosition().then((pos) => {
      if (active && pos) setCoords(pos);
    });
    return () => {
      active = false;
    };
  }, [order]);

  // Start / restart live camera stream when capturing active step
  useEffect(() => {
    if (!order || currentPreview) {
      stopStream();
      return;
    }

    let cancelled = false;
    const startCamera = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraState('unavailable');
        setCameraMsg('Kamera langsung tidak tersedia di browser ini. Gunakan tombol Ambil dari HP.');
        return;
      }

      setCameraState('loading');
      setCameraMsg('');
      stopStream();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {ideal: facingMode},
            width: {ideal: 1280},
            height: {ideal: 960},
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraState('ready');
      } catch {
        if (!cancelled) {
          setCameraState('unavailable');
          setCameraMsg('Izin kamera belum aktif atau kamera tidak terdeteksi. Gunakan tombol Ambil dari HP.');
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopStream();
    };
  }, [order, facingMode, currentPreview, stopStream]);

  const assignCapturedUrl = (dataUrl: string) => {
    if (step === 'suratJalan') {
      setSuratJalanUrl(dataUrl);
    } else {
      setBarangUrl(dataUrl);
    }
  };

  const handleCaptureFrame = async () => {
    if (!order || !videoRef.current || processing) return;
    const video = videoRef.current;
    const vw = video.videoWidth || 1280;
    const vh = video.videoHeight || 720;
    setProcessing(true);
    try {
      const dataUrl = await renderTimestampedJpeg(video, vw, vh, order, step, coords, new Date());
      if (dataUrl) {
        assignCapturedUrl(dataUrl);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleFileFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !order) return;

    setProcessing(true);
    try {
      const rawDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Gagal membaca foto'));
        reader.readAsDataURL(file);
      });
      const img = await loadImageElement(rawDataUrl);
      if (!img) return;
      const stamped = await renderTimestampedJpeg(
        img,
        img.naturalWidth || img.width,
        img.naturalHeight || img.height,
        order,
        step,
        coords,
        new Date()
      );
      if (stamped) {
        assignCapturedUrl(stamped);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!order || !suratJalanUrl || !barangUrl || busy || processing) return;
    await onConfirmPhotos(order.id, suratJalanUrl, barangUrl, coords);
  };

  const {timeStr, dateStr} = formatStampDateTime(liveNow);
  const stepTitle = step === 'suratJalan' ? '1. Foto Surat Jalan' : '2. Foto Barang';

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
            className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs"
          />

          <motion.div
            initial={{opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 20}}
            transition={{duration: 0.2, ease: [0.16, 1, 0.3, 1]}}
            className="relative z-10 w-full max-w-lg bg-white rounded-t-[26px] sm:rounded-3xl border border-slate-200 shadow-2xl max-h-[94dvh] flex flex-col overflow-hidden"
          >
            {/* Header + 2-Step Progress Switcher */}
            <div className="px-4 pt-3 pb-3 border-b border-slate-200 space-y-2.5 shrink-0 bg-white">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-bold">
                      TimeSnap (2 Foto)
                    </span>
                    <h3 className="font-display text-[15px] sm:text-[16px] font-bold text-slate-900 truncate">
                      {stepTitle}
                    </h3>
                  </div>
                  <p className="text-[12px] text-slate-500 truncate mt-0.5">{order.name}</p>
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

              {/* 2-Step Pills */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStep('suratJalan')}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${
                    step === 'suratJalan'
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                      : suratJalanUrl
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {suratJalanUrl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">1. Surat Jalan</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep('barang')}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 transition-all ${
                    step === 'barang'
                      ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs'
                      : barangUrl
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  {barangUrl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <Package className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">2. Foto Barang</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3 bg-slate-50">
              {currentPreview ? (
                <div className="space-y-3">
                  {/* If both photos are captured, show side-by-side summary when on step 2, else current step preview */}
                  {bothReady ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 p-1.5">
                        <div className="flex items-center justify-between px-1 pb-1">
                          <span className="text-[11px] font-bold text-slate-700">1. Surat Jalan</span>
                          <button
                            type="button"
                            onClick={() => {
                              setSuratJalanUrl(null);
                              setStep('suratJalan');
                            }}
                            className="text-[11px] font-semibold text-blue-600 hover:underline"
                          >
                            Ulang
                          </button>
                        </div>
                        <img
                          src={suratJalanUrl!}
                          alt="Foto Surat Jalan"
                          className="w-full aspect-[4/3] object-cover rounded-xl bg-slate-900"
                        />
                      </div>

                      <div className="rounded-2xl overflow-hidden bg-white border border-slate-200 p-1.5">
                        <div className="flex items-center justify-between px-1 pb-1">
                          <span className="text-[11px] font-bold text-slate-700">2. Foto Barang</span>
                          <button
                            type="button"
                            onClick={() => {
                              setBarangUrl(null);
                              setStep('barang');
                            }}
                            className="text-[11px] font-semibold text-blue-600 hover:underline"
                          >
                            Ulang
                          </button>
                        </div>
                        <img
                          src={barangUrl!}
                          alt="Foto Barang"
                          className="w-full aspect-[4/3] object-cover rounded-xl bg-slate-900"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative rounded-2xl overflow-hidden bg-slate-900 border border-slate-200">
                      <img
                        src={currentPreview}
                        alt={stepTitle}
                        className="w-full max-h-[52dvh] object-contain mx-auto"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (step === 'suratJalan') {
                          setSuratJalanUrl(null);
                        } else {
                          setBarangUrl(null);
                        }
                      }}
                      className="btn-surface-pill min-h-[46px] px-4 rounded-xl font-semibold text-[14px] inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Foto Ulang
                    </button>

                    {bothReady ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={handleConfirmSave}
                        className="btn-primary-glow min-h-[46px] px-4 rounded-xl font-bold text-[14px] inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50"
                      >
                        <Check className="w-4 h-4" />
                        {busy ? 'Menyimpan…' : 'Simpan 2 Foto & Selesai'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setStep(step === 'suratJalan' ? 'barang' : 'suratJalan')}
                        className="btn-primary-glow min-h-[46px] px-4 rounded-xl font-bold text-[14px] inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
                      >
                        <span>{step === 'suratJalan' ? 'Lanjut: Foto Barang' : 'Lanjut: Surat Jalan'}</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative aspect-[4/3] w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 flex items-center justify-center">
                    {cameraState === 'unavailable' ? (
                      <div className="p-5 text-center space-y-3">
                        <div className="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-400/30 text-blue-300 flex items-center justify-center mx-auto">
                          <Camera className="w-6 h-6" />
                        </div>
                        <p className="text-[13px] text-slate-200 leading-relaxed max-w-xs mx-auto">
                          {cameraMsg}
                        </p>
                        <button
                          type="button"
                          onClick={() => fileFallbackRef.current?.click()}
                          className="btn-primary-glow min-h-[44px] px-4 py-2 rounded-xl font-bold text-[13.5px] inline-flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                        >
                          <Upload className="w-4 h-4" />
                          Ambil {step === 'suratJalan' ? 'Surat Jalan' : 'Foto Barang'}
                        </button>
                      </div>
                    ) : (
                      <>
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />

                        {cameraState === 'loading' && (
                          <div className="absolute inset-0 bg-slate-900/75 flex items-center justify-center text-white text-[13px] font-medium">
                            Membuka kamera…
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
                          }
                          title="Ganti kamera depan/belakang"
                          aria-label="Ganti kamera"
                          className="absolute top-2.5 right-2.5 w-9 h-9 rounded-xl bg-slate-900/65 hover:bg-slate-900/85 border border-white/20 text-white flex items-center justify-center backdrop-blur-xs transition-all active:scale-[0.94]"
                        >
                          <SwitchCamera className="w-4 h-4" />
                        </button>

                        {/* Live TimeSnap Stamp Preview */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-transparent p-3 pt-8 pointer-events-none">
                          <div className="flex items-end justify-between gap-2">
                            <div className="border-l-4 border-blue-500 pl-2.5 min-w-0">
                              <div className="font-mono-num text-[20px] sm:text-[22px] font-extrabold text-white leading-none">
                                {timeStr}
                              </div>
                              <div className="text-[11.5px] font-semibold text-blue-200 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3 shrink-0" />
                                <span>{dateStr}</span>
                              </div>
                              <div className="text-[11.5px] font-bold text-white truncate mt-1">
                                {order.name}
                                {order.driver ? ` · ${order.driver}` : ''}
                              </div>
                              <div className="text-[11px] text-slate-200 truncate flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3 text-blue-400 shrink-0" />
                                <span className="truncate">
                                  {coords
                                    ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`
                                    : order.addr || 'Mengambil lokasi GPS…'}
                                </span>
                              </div>
                            </div>

                            <span className="px-2 py-0.5 rounded-md bg-blue-600/90 text-white text-[10px] font-bold tracking-wide shrink-0">
                              {step === 'suratJalan' ? 'SURAT JALAN' : 'FOTO BARANG'}
                            </span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Shutter + Gallery Controls */}
                  <div className="flex items-center gap-2.5">
                    {cameraState === 'ready' && (
                      <button
                        type="button"
                        disabled={processing || busy}
                        onClick={handleCaptureFrame}
                        className="btn-primary-glow flex-1 min-h-[48px] px-4 rounded-xl font-bold text-[14.5px] inline-flex items-center justify-center gap-2 transition-all active:scale-[0.97] disabled:opacity-50"
                      >
                        <Camera className="w-5 h-5" />
                        {processing
                          ? 'Memproses…'
                          : step === 'suratJalan'
                            ? 'Jepret Surat Jalan'
                            : 'Jepret Foto Barang'}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={processing || busy}
                      onClick={() => fileFallbackRef.current?.click()}
                      className={`btn-surface-pill min-h-[48px] px-3.5 rounded-xl font-semibold text-[13px] inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50 ${
                        cameraState === 'ready' ? 'shrink-0' : 'flex-1'
                      }`}
                    >
                      <Upload className="w-4 h-4 text-blue-600" />
                      <span>{cameraState === 'ready' ? 'Galeri' : 'Pilih Foto / Kamera HP'}</span>
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={fileFallbackRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileFallback}
                className="sr-only"
                tabIndex={-1}
              />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
