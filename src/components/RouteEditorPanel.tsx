import React, {useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {
  ArrowUp,
  ArrowDown,
  Navigation,
  LocateFixed,
  Car,
  Bike,
  Check,
  Pencil,
  RotateCcw,
  Sparkles,
  Loader2,
  X,
} from 'lucide-react';
import type {Order, RouteOrigin, TravelModeOption} from '../types';
import {
  buildMultiStopGoogleMapsUrl,
  formatDistance,
  formatDuration,
  getCurrentPosition,
  parseLoc,
} from '../lib/geo';
import {
  optimizeStopsWithRouteMatrix,
  type StopLegEstimate,
} from '../lib/routeOptimizer';

interface RouteEditorPanelProps {
  activeOrders: Order[];
  routeOrderIds: string[];
  excludedOrderIds: string[];
  routeOrigin: RouteOrigin;
  travelMode: TravelModeOption;
  hasMapsApiKey: boolean;
  routesLib: google.maps.RoutesLibrary | null;
  mapsApiError: string | null;
  onUpdateRouteOrderIds: (ids: string[]) => void;
  onToggleExcludeStop: (id: string) => void;
  onUpdateOrigin: (origin: RouteOrigin) => void;
  onUpdateTravelMode: (mode: TravelModeOption) => void;
  onSaveOrderLocation: (
    orderId: string,
    patch: {addr?: string; lat?: number | null; lng?: number | null; link?: string | null}
  ) => Promise<void>;
  onToast: (msg: string, bad?: boolean) => void;
}

export const RouteEditorPanel: React.FC<RouteEditorPanelProps> = ({
  activeOrders,
  routeOrderIds,
  excludedOrderIds,
  routeOrigin,
  travelMode,
  hasMapsApiKey,
  routesLib,
  mapsApiError,
  onUpdateRouteOrderIds,
  onToggleExcludeStop,
  onUpdateOrigin,
  onUpdateTravelMode,
  onSaveOrderLocation,
  onToast,
}) => {
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editAddr, setEditAddr] = useState('');
  const [editCoordRaw, setEditCoordRaw] = useState('');
  const [savingStop, setSavingStop] = useState(false);
  const [locatingOrigin, setLocatingOrigin] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizationSummary, setOptimizationSummary] = useState<{
    totalDistanceMeters: number;
    totalDurationMillis: number;
    stopCount: number;
    legsByStopId: Record<string, StopLegEstimate>;
  } | null>(null);

  const orderedStops = [
    ...routeOrderIds
      .map((id) => activeOrders.find((o) => o.id === id))
      .filter((o): o is Order => Boolean(o)),
    ...activeOrders.filter((o) => !routeOrderIds.includes(o.id)),
  ];

  const includedStops = orderedStops.filter((o) => !excludedOrderIds.includes(o.id));
  const multiStopUrl = buildMultiStopGoogleMapsUrl(includedStops, routeOrigin, travelMode);

  const moveStop = (index: number, direction: -1 | 1) => {
    const ids = orderedStops.map((o) => o.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= ids.length) return;
    const copy = [...ids];
    const [item] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, item);
    setOptimizationSummary(null);
    onUpdateRouteOrderIds(copy);
  };

  const resetSequence = () => {
    setOptimizationSummary(null);
    onUpdateRouteOrderIds(activeOrders.map((o) => o.id));
    onToast('Urutan pengantaran dikembalikan ke default');
  };

  const handleUseGpsOrigin = async () => {
    setLocatingOrigin(true);
    const pos = await getCurrentPosition();
    setLocatingOrigin(false);
    if (pos) {
      onUpdateOrigin({
        mode: 'gps',
        lat: pos.lat,
        lng: pos.lng,
        label: 'Lokasi Saya Sekarang',
      });
      onToast('Titik berangkat diatur ke posisi GPS saat ini');
    } else {
      onToast('Lokasi GPS tidak terbaca. Pastikan izin lokasi aktif.', true);
    }
  };

  const handleClearOrigin = () => {
    onUpdateOrigin({
      mode: 'gps',
      lat: null,
      lng: null,
      label: 'Titik awal otomatis (Stop #1)',
    });
    onToast('Titik berangkat kembali otomatis');
  };

  const handleOptimizeRoute = async () => {
    if (optimizing) return;
    if (includedStops.length === 0) {
      onToast('Pilih minimal 1 tujuan aktif untuk dioptimalkan.', true);
      return;
    }
    if (!hasMapsApiKey) {
      onToast('API Key Google Maps (VITE_GOOGLE_MAPS_API_KEY) belum diatur.', true);
      return;
    }
    if (mapsApiError) {
      onToast(mapsApiError, true);
      return;
    }
    if (!routesLib?.RouteMatrix) {
      onToast('Layanan Google Maps Routes belum siap, coba sebentar lagi.', true);
      return;
    }

    setOptimizing(true);
    try {
      const gpsPos = await getCurrentPosition();
      const originPos =
        gpsPos ??
        (routeOrigin.lat != null && routeOrigin.lng != null
          ? {lat: routeOrigin.lat, lng: routeOrigin.lng}
          : null);

      if (!originPos) {
        onToast(
          'Lokasi GPS saat ini tidak terbaca. Aktifkan izin lokasi browser lalu coba lagi.',
          true
        );
        return;
      }

      if (gpsPos) {
        onUpdateOrigin({
          mode: 'gps',
          lat: gpsPos.lat,
          lng: gpsPos.lng,
          label: 'Lokasi Saya Sekarang',
        });
      }

      const result = await optimizeStopsWithRouteMatrix({
        routesLib,
        origin: originPos,
        stops: includedStops,
        travelMode,
      });

      const excludedInOrder = orderedStops
        .filter((o) => excludedOrderIds.includes(o.id))
        .map((o) => o.id);

      onUpdateRouteOrderIds([...result.orderedStopIds, ...excludedInOrder]);

      const legsByStopId: Record<string, StopLegEstimate> = {};
      for (const leg of result.legs) {
        legsByStopId[leg.stopId] = leg;
      }
      setOptimizationSummary({
        totalDistanceMeters: result.totalDistanceMeters,
        totalDurationMillis: result.totalDurationMillis,
        stopCount: result.routableCount,
        legsByStopId,
      });

      const distLabel =
        result.totalDistanceMeters > 0 ? ` · ${formatDistance(result.totalDistanceMeters)}` : '';
      onToast(`Rute dioptimalkan untuk ${result.routableCount} titik${distLabel}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      onToast(`Gagal mengoptimalkan rute: ${message}`, true);
    } finally {
      setOptimizing(false);
    }
  };

  const openEditStop = (order: Order) => {
    setEditingStopId(order.id);
    setEditAddr(order.addr || '');
    setEditCoordRaw(
      order.lat != null && order.lng != null ? `${order.lat}, ${order.lng}` : order.link || ''
    );
  };

  const saveEditStop = async (orderId: string) => {
    setSavingStop(true);
    try {
      const parsed = parseLoc(editCoordRaw);
      await onSaveOrderLocation(orderId, {
        addr: editAddr.trim(),
        lat: parsed ? parsed.lat : null,
        lng: parsed ? parsed.lng : null,
        link: !parsed && editCoordRaw.trim() ? editCoordRaw.trim() : null,
      });
      setEditingStopId(null);
    } finally {
      setSavingStop(false);
    }
  };

  return (
    <div className="space-y-3 min-[360px]:space-y-4">
      {/* Combined Google Maps Launcher & Route Settings */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-50 via-white to-white border border-blue-200 p-3.5 min-[360px]:p-4 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-[16px] min-[360px]:text-[17px] font-bold text-slate-900">
              Rute Google Maps
            </h3>
            <p className="text-[12.5px] text-slate-500">
              Buka semua tujuan sekaligus dalam satu navigasi Google Maps
            </p>
          </div>

          {multiStopUrl ? (
            <a
              href={multiStopUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary-glow w-full min-[360px]:w-auto min-h-[44px] px-4 py-2 rounded-xl text-[13.5px] font-bold inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] whitespace-nowrap"
            >
              <Navigation className="w-4 h-4" />
              Buka Rute ({includedStops.length} titik)
            </a>
          ) : (
            <span className="text-[12.5px] text-slate-500 italic">
              Pilih minimal 1 tujuan aktif
            </span>
          )}
        </div>

        <div className="pt-2.5 border-t border-blue-100 flex flex-wrap items-center justify-between gap-2.5">
          {/* Travel Mode Switch */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => onUpdateTravelMode('DRIVING')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                travelMode === 'DRIVING'
                  ? 'bg-white text-blue-600 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              Mobil
            </button>
            <button
              type="button"
              onClick={() => onUpdateTravelMode('TWO_WHEELER')}
              className={`min-h-[36px] px-3 py-1.5 rounded-lg text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap ${
                travelMode === 'TWO_WHEELER'
                  ? 'bg-white text-blue-600 border border-blue-200 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              Motor
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={locatingOrigin}
              onClick={handleUseGpsOrigin}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
            >
              <LocateFixed className="w-3.5 h-3.5" />
              {locatingOrigin ? 'GPS…' : 'GPS Saya'}
            </button>
            {routeOrigin.lat != null && (
              <button
                type="button"
                onClick={handleClearOrigin}
                className="btn-surface-pill min-h-[38px] px-2.5 py-1.5 rounded-xl text-[12px] font-semibold inline-flex items-center gap-1 transition-all active:scale-[0.97]"
              >
                <X className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
          </div>
        </div>

        {routeOrigin.lat != null && routeOrigin.lng != null && (
          <div className="text-[12px] font-mono-num text-blue-700">
            Titik berangkat GPS aktif: {routeOrigin.lat}, {routeOrigin.lng}
          </div>
        )}
      </div>

      {/* Stop Sequence Editor */}
      <div className="rounded-2xl bg-white border border-slate-200 p-3.5 min-[360px]:p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="font-display text-[16px] font-bold text-slate-900">
              Urutan Tujuan ({includedStops.length}/{orderedStops.length})
            </h3>
            <p className="text-[12.5px] text-slate-500">
              Optimalkan otomatis dari posisi saat ini atau atur manual sebelum navigasi
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={optimizing || includedStops.length === 0}
              onClick={handleOptimizeRoute}
              className="min-h-[38px] px-3 min-[360px]:px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[12.5px] font-bold inline-flex items-center gap-1.5 transition-all active:scale-[0.97] disabled:opacity-50 whitespace-nowrap"
            >
              {optimizing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              {optimizing ? 'Mengoptimalkan…' : 'Optimalkan Rute'}
            </button>

            <button
              type="button"
              onClick={resetSequence}
              title="Reset urutan"
              className="btn-surface-pill min-h-[38px] px-3 py-1.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.97] whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              Reset
            </button>
          </div>
        </div>

        {optimizationSummary && (
          <div className="rounded-xl bg-blue-50/80 border border-blue-200 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-blue-800">
            <span className="font-semibold">
              Urutan dioptimalkan dari posisi saat ini ({optimizationSummary.stopCount} titik)
            </span>
            {optimizationSummary.totalDistanceMeters > 0 && (
              <span className="font-mono-num font-bold text-blue-700">
                {formatDistance(optimizationSummary.totalDistanceMeters)}
                {optimizationSummary.totalDurationMillis > 0
                  ? ` · ~${formatDuration(optimizationSummary.totalDurationMillis)}`
                  : ''}
              </span>
            )}
          </div>
        )}

        {orderedStops.length === 0 ? (
          <div className="py-10 text-center text-[13.5px] text-slate-500">
            Belum ada order aktif untuk rute Google Maps.
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {orderedStops.map((stop, idx) => {
                const isExcluded = excludedOrderIds.includes(stop.id);
                const includedIdx = includedStops.findIndex((s) => s.id === stop.id);
                const isEditing = editingStopId === stop.id;
                const legEstimate = optimizationSummary?.legsByStopId[stop.id];

                return (
                  <motion.div
                    layout
                    key={stop.id}
                    initial={{opacity: 0, y: 6}}
                    animate={{opacity: 1, y: 0}}
                    exit={{opacity: 0}}
                    transition={{duration: 0.16}}
                    className={`rounded-xl border p-3 transition-colors ${
                      isExcluded
                        ? 'bg-slate-50 border-slate-200 opacity-55'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap min-[360px]:flex-nowrap items-start gap-2 min-[360px]:gap-2.5">
                      {/* Include checkbox */}
                      <button
                        type="button"
                        onClick={() => {
                          setOptimizationSummary(null);
                          onToggleExcludeStop(stop.id);
                        }}
                        aria-label={isExcluded ? 'Sertakan di Rute' : 'Kecualikan dari Rute'}
                        className={`mt-0.5 w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-all active:scale-[0.92] ${
                          isExcluded
                            ? 'border-slate-300 bg-white text-transparent'
                            : 'border-blue-600 bg-blue-600 text-white shadow-xs'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>

                      {/* Stop number + info */}
                      <div className="flex-1 min-w-[140px] text-left">
                        <div className="flex flex-wrap items-center gap-1.5 min-[360px]:gap-2">
                          {includedIdx >= 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 font-mono-num text-[11px] font-bold shrink-0">
                              #{includedIdx + 1}
                            </span>
                          )}
                          <span className="font-display text-[14px] min-[360px]:text-[14.5px] font-bold text-slate-900 truncate">
                            {stop.name}
                          </span>
                          {!isExcluded && legEstimate && legEstimate.distanceMeters != null && (
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono-num text-[11px] font-semibold shrink-0">
                              +{formatDistance(legEstimate.distanceMeters)}
                              {legEstimate.durationMillis != null
                                ? ` · ${formatDuration(legEstimate.durationMillis)}`
                                : ''}
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] min-[360px]:text-[12.5px] text-slate-600 truncate mt-0.5">
                          {stop.addr || 'Alamat kosong'}
                        </div>
                        {stop.driver && (
                          <div className="text-[11px] min-[360px]:text-[11.5px] text-slate-500 mt-0.5">
                            Driver: {stop.driver}
                          </div>
                        )}
                      </div>

                      {/* Reorder & Edit buttons */}
                      <div className="flex items-center gap-1 shrink-0 ml-auto">
                        <button
                          type="button"
                          onClick={() => (isEditing ? setEditingStopId(null) : openEditStop(stop))}
                          title="Edit alamat & titik Maps"
                          className="btn-surface-pill w-8 h-8 min-[360px]:w-9 min-[360px]:h-9 rounded-xl flex items-center justify-center transition-all active:scale-[0.94]"
                        >
                          {isEditing ? (
                            <X className="w-4 h-4 text-slate-600" />
                          ) : (
                            <Pencil className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveStop(idx, -1)}
                          title="Pindah ke atas"
                          className="btn-surface-pill w-8 h-8 min-[360px]:w-9 min-[360px]:h-9 rounded-xl flex items-center justify-center disabled:opacity-35 transition-all active:scale-[0.94]"
                        >
                          <ArrowUp className="w-4 h-4 text-slate-700" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === orderedStops.length - 1}
                          onClick={() => moveStop(idx, 1)}
                          title="Pindah ke bawah"
                          className="btn-surface-pill w-8 h-8 min-[360px]:w-9 min-[360px]:h-9 rounded-xl flex items-center justify-center disabled:opacity-35 transition-all active:scale-[0.94]"
                        >
                          <ArrowDown className="w-4 h-4 text-slate-700" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Address & Coordinate Editor */}
                    <AnimatePresence>
                      {isEditing && (
                        <motion.div
                          initial={{opacity: 0, height: 0}}
                          animate={{opacity: 1, height: 'auto'}}
                          exit={{opacity: 0, height: 0}}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
                            <div>
                              <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                                Alamat Tujuan
                              </label>
                              <input
                                type="text"
                                value={editAddr}
                                onChange={(e) => setEditAddr(e.target.value)}
                                placeholder="Ketik alamat tujuan..."
                                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-[12px] font-semibold text-slate-700 mb-1">
                                Koordinat atau Link Google Maps
                              </label>
                              <input
                                type="text"
                                value={editCoordRaw}
                                onChange={(e) => setEditCoordRaw(e.target.value)}
                                placeholder="-6.2088, 106.8456"
                                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono-num text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none"
                              />
                            </div>

                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingStopId(null)}
                                className="btn-surface-pill min-h-[38px] px-3 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all active:scale-[0.97]"
                              >
                                Batal
                              </button>
                              <button
                                type="button"
                                disabled={savingStop}
                                onClick={() => saveEditStop(stop.id)}
                                className="btn-primary-glow min-h-[38px] px-3.5 py-1.5 rounded-xl text-[12.5px] font-bold disabled:opacity-50 transition-all active:scale-[0.97]"
                              >
                                {savingStop ? 'Menyimpan…' : 'Simpan'}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
};
