import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {motion, AnimatePresence} from 'motion/react';
import {
  ListChecks,
  Route as RouteIcon,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Search,
  Download,
  Trash2,
  PackageCheck,
  UserCheck,
  Settings2,
  ArrowLeftRight,
  Navigation,
  ChevronRight,
  X,
  RotateCcw,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  ArrowUpDown,
} from 'lucide-react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {APIProvider, useMapsLibrary} from '@vis.gl/react-google-maps';
import type {
  Order,
  OrderStatus,
  RouteOrigin,
  SupabaseConfig,
  SupabaseOrderRow,
  TabId,
  TravelModeOption,
  UserRole,
} from './types';
import {
  createSupabaseInstance,
  loadSupabaseConfig,
  mapOrderRow,
  saveSupabaseConfig,
  testSupabaseConnection,
} from './lib/supabaseClient';
import {
  buildMultiStopGoogleMapsUrl,
  dateOfOrder,
  formatDuration,
  formatFullDate,
  formatHm,
  getCurrentPosition,
  getOrderDeliveryDuration,
  todayIso,
  type LatLng,
} from './lib/geo';
import {serializePhotoBundle} from './lib/photos';
import {exportDailyPdf} from './lib/pdfExport';
import {exportDailyCsv} from './lib/csvExport';
import {OrderCard} from './components/OrderCard';
import {RouteEditorPanel} from './components/RouteEditorPanel';
import {NewOrderSheet, type NewOrderPayload} from './components/NewOrderSheet';
import {ConfirmDialog, FailReasonDialog, PhotoModal} from './components/Modals';
import {TimestampCameraModal} from './components/TimestampCameraModal';
import {OrderCorrectionModal} from './components/OrderCorrectionModal';

const TAB_ITEMS: Array<{
  id: TabId;
  label: string;
  mobileLabel: string;
  icon: React.FC<{className?: string}>;
}> = [
  {id: 'aktif', label: 'Order Aktif', mobileLabel: 'Aktif', icon: ListChecks},
  {id: 'peta', label: 'Rute', mobileLabel: 'Rute', icon: RouteIcon},
  {id: 'selesai', label: 'Selesai', mobileLabel: 'Selesai', icon: CheckCircle2},
  {id: 'riw', label: 'Riwayat', mobileLabel: 'Riwayat', icon: Clock},
  {id: 'rekap', label: 'Rekap', mobileLabel: 'Rekap', icon: FileText},
];

const GOOGLE_MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
const HAS_MAPS_API_KEY =
  Boolean(GOOGLE_MAPS_API_KEY) && GOOGLE_MAPS_API_KEY !== 'MY_GOOGLE_MAPS_API_KEY';

const RoutesLibraryLoader: React.FC<{
  onLoad: (lib: google.maps.RoutesLibrary | null) => void;
}> = ({onLoad}) => {
  const routesLib = useMapsLibrary('routes');
  useEffect(() => {
    onLoad(routesLib);
  }, [routesLib, onLoad]);
  return null;
};

const OptionalMapsProvider: React.FC<{
  apiKey: string;
  enabled: boolean;
  onRoutesLib: (lib: google.maps.RoutesLibrary | null) => void;
  onError: (msg: string | null) => void;
  children: React.ReactNode;
}> = ({apiKey, enabled, onRoutesLib, onError, children}) => {
  if (!enabled) return <>{children}</>;
  return (
    <APIProvider
      apiKey={apiKey}
      libraries={['routes']}
      language="id"
      region="ID"
      onLoad={() => onError(null)}
      onError={() => onError('Gagal memuat layanan Google Maps Routes API. Periksa API key.')}
    >
      <RoutesLibraryLoader onLoad={onRoutesLib} />
      {children}
    </APIProvider>
  );
};

export default function App() {
  // Supabase connection state
  const [sbConfig, setSbConfig] = useState<SupabaseConfig>(() => loadSupabaseConfig());
  const [sbClient, setSbClient] = useState<SupabaseClient | null>(() =>
    createSupabaseInstance(loadSupabaseConfig())
  );
  const [connStatus, setConnStatus] = useState<string>('');
  const [showConnPanel, setShowConnPanel] = useState(false);
  const [cfgUrlInput, setCfgUrlInput] = useState(sbConfig.u);
  const [cfgKeyInput, setCfgKeyInput] = useState(sbConfig.k);

  // Session & Navigation state
  const [role, setRole] = useState<UserRole | null>(null);
  const [tab, setTab] = useState<TabId>('aktif');
  const [driverFilter, setDriverFilter] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(() => todayIso());
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [activeStatusFilter, setActiveStatusFilter] = useState<
    'all' | 'baru' | 'jalan' | 'overdue'
  >('all');
  const [sortActiveByRoute, setSortActiveByRoute] = useState<boolean>(false);
  const [historyQuery, setHistoryQuery] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'selesai' | 'gagal'>('all');
  const [historyDurationFilter, setHistoryDurationFilter] = useState<
    'all' | 'fast' | 'medium' | 'slow'
  >('all');

  // Orders & UI feedback
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{msg: string; bad: boolean} | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [routesLib, setRoutesLib] = useState<google.maps.RoutesLibrary | null>(null);
  const [mapsApiError, setMapsApiError] = useState<string | null>(null);

  // Modals & sheets
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [photoPreviewSrc, setPhotoPreviewSrc] = useState<string | null>(null);
  const [cameraOrderId, setCameraOrderId] = useState<string | null>(null);
  const [correctingOrderId, setCorrectingOrderId] = useState<string | null>(null);
  const [failTargetId, setFailTargetId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    message: string;
    confirmLabel: string;
    destructive: boolean;
    onConfirm: () => void;
  }>({
    open: false,
    message: '',
    confirmLabel: 'Lanjut',
    destructive: false,
    onConfirm: () => {},
  });

  const cameraOrder = useMemo(
    () => orders.find((o) => o.id === cameraOrderId) ?? null,
    [orders, cameraOrderId]
  );

  const correctingOrder = useMemo(
    () => orders.find((o) => o.id === correctingOrderId) ?? null,
    [orders, correctingOrderId]
  );

  // Combined Google Maps route sequence state
  const [routeOrderIds, setRouteOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('bbs_route_order');
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [excludedOrderIds, setExcludedOrderIds] = useState<string[]>([]);
  const [routeOrigin, setRouteOrigin] = useState<RouteOrigin>({
    mode: 'gps',
    lat: null,
    lng: null,
    label: 'Titik awal otomatis (Stop #1)',
  });
  const [travelMode, setTravelMode] = useState<TravelModeOption>('DRIVING');

  const showToast = useCallback((msg: string, bad = false) => {
    setToast({msg, bad});
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, bad ? 5500 : 3000);
  }, []);

  // Persist route order locally
  useEffect(() => {
    try {
      localStorage.setItem('bbs_route_order', JSON.stringify(routeOrderIds));
    } catch {
      // ignore storage errors
    }
  }, [routeOrderIds]);

  // Initial connection check on login screen
  useEffect(() => {
    if (role !== null) return;
    let active = true;
    setConnStatus('Mengecek koneksi…');
    testSupabaseConnection(sbConfig).then((res) => {
      if (active) setConnStatus(res.message);
    });
    return () => {
      active = false;
    };
  }, [role, sbConfig]);

  const loadOrders = useCallback(async () => {
    if (!sbClient) return;
    setLoadingOrders(true);
    try {
      const res = await sbClient
        .from('orders')
        .select('*')
        .order('at', {ascending: false})
        .limit(1000);
      if (res.error) throw res.error;
      const mapped = ((res.data || []) as SupabaseOrderRow[]).map(mapOrderRow);
      setOrders(mapped);
    } catch (err) {
      showToast(`Data gagal dimuat: ${(err as Error).message || err}`, true);
    } finally {
      setLoadingOrders(false);
    }
  }, [sbClient, showToast]);

  // Subscribe & poll when signed in
  useEffect(() => {
    if (!role || !sbClient) return;
    loadOrders();

    const channel = sbClient
      .channel('orders-live')
      .on('postgres_changes', {event: '*', schema: 'public', table: 'orders'}, () => {
        if (!busy) loadOrders();
      })
      .subscribe();

    const interval = window.setInterval(() => {
      if (!busy && !document.hidden) loadOrders();
    }, 20000);

    return () => {
      window.clearInterval(interval);
      sbClient.removeChannel(channel);
    };
  }, [role, sbClient, busy, loadOrders]);

  // Refresh live clock while viewing Active Orders so >60m delivery warnings appear automatically
  useEffect(() => {
    if (!role || tab !== 'aktif') return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      if (!document.hidden) setNowMs(Date.now());
    }, 30000);
    return () => window.clearInterval(timer);
  }, [role, tab]);

  const handleSaveConnection = async () => {
    let u = cfgUrlInput.trim().replace(/\/+$/, '');
    const k = cfgKeyInput.trim();
    if (u && !/^https?:\/\//.test(u)) u = `https://${u}`;
    const nextCfg: SupabaseConfig = {u: u || sbConfig.u, k: k || sbConfig.k};
    setSbConfig(nextCfg);
    saveSupabaseConfig(nextCfg);
    setSbClient(createSupabaseInstance(nextCfg));
    setConnStatus('Mengecek koneksi…');
    const res = await testSupabaseConnection(nextCfg);
    setConnStatus(res.message);
  };

  const handleEnterRole = (chosenRole: UserRole) => {
    if (!sbClient) {
      showToast('Koneksi Supabase gagal dibuat. Periksa pengaturan koneksi.', true);
      return;
    }
    if (chosenRole === 'driver') {
      try {
        const savedDrv = localStorage.getItem('drv') || '';
        setDriverFilter(savedDrv);
      } catch {
        // ignore
      }
    } else {
      setDriverFilter('');
    }
    setRole(chosenRole);
  };

  const isOwner = role === 'owner';

  // Derived collections
  const driverNames = useMemo(() => {
    const set = new Set(orders.map((o) => o.driver).filter(Boolean));
    if (driverFilter) set.add(driverFilter);
    return Array.from(set).sort();
  }, [orders, driverFilter]);

  const activeOrders = useMemo(
    () =>
      orders
        .filter(
          (o) =>
            o.st !== 'selesai' &&
            o.st !== 'gagal' &&
            (!driverFilter || o.driver === driverFilter)
        )
        .sort((a, b) => (a.st === 'jalan' ? 0 : 1) - (b.st === 'jalan' ? 0 : 1)),
    [orders, driverFilter]
  );

  // Ordered active stops for Route tab & combined Google Maps URL
  const orderedActiveStops = useMemo(() => {
    const ordered = [
      ...routeOrderIds
        .map((id) => activeOrders.find((o) => o.id === id))
        .filter((o): o is Order => Boolean(o)),
      ...activeOrders.filter((o) => !routeOrderIds.includes(o.id)),
    ];
    return ordered.filter((o) => !excludedOrderIds.includes(o.id));
  }, [activeOrders, routeOrderIds, excludedOrderIds]);

  const activeMultiStopUrl = useMemo(
    () => buildMultiStopGoogleMapsUrl(orderedActiveStops, routeOrigin, travelMode),
    [orderedActiveStops, routeOrigin, travelMode]
  );

  const doneOrdersForDate = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.st === 'selesai' || o.st === 'gagal') &&
          dateOfOrder(o) === selectedDate &&
          (!driverFilter || o.driver === driverFilter)
      ),
    [orders, selectedDate, driverFilter]
  );

  const summaryCounts = useMemo(
    () => ({
      baru: orders.filter((o) => o.st === 'baru').length,
      jalan: orders.filter((o) => o.st === 'jalan').length,
      selesai: orders.filter((o) => o.st === 'selesai' && dateOfOrder(o) === selectedDate).length,
      gagal: orders.filter((o) => o.st === 'gagal' && dateOfOrder(o) === selectedDate).length,
    }),
    [orders, selectedDate]
  );

  const activeOverdueCount = useMemo(
    () =>
      activeOrders.filter(
        (o) => o.st === 'jalan' && o.startAt != null && nowMs - o.startAt > 60 * 60 * 1000
      ).length,
    [activeOrders, nowMs]
  );

  const filteredActiveOrders = useMemo(() => {
    const q = activeQuery.trim().toLowerCase();
    const list = activeOrders.filter((o) => {
      if (activeStatusFilter === 'baru' && o.st !== 'baru') return false;
      if (activeStatusFilter === 'jalan' && o.st !== 'jalan') return false;
      if (
        activeStatusFilter === 'overdue' &&
        !(o.st === 'jalan' && o.startAt != null && nowMs - o.startAt > 60 * 60 * 1000)
      ) {
        return false;
      }
      if (!q) return true;
      const haystack = `${o.name} ${o.addr} ${o.driver} ${o.tel} ${o.note}`.toLowerCase();
      return haystack.includes(q);
    });

    if (sortActiveByRoute && routeOrderIds.length > 0) {
      const rank: Record<string, number> = {};
      routeOrderIds.forEach((id, idx) => {
        rank[id] = idx;
      });
      return [...list].sort((a, b) => {
        const ra = rank[a.id] ?? Number.MAX_SAFE_INTEGER;
        const rb = rank[b.id] ?? Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return (a.st === 'jalan' ? 0 : 1) - (b.st === 'jalan' ? 0 : 1);
      });
    }
    return list;
  }, [activeOrders, activeQuery, activeStatusFilter, nowMs, sortActiveByRoute, routeOrderIds]);

  const doneOrdersSummary = useMemo(
    () => ({
      total: doneOrdersForDate.length,
      selesai: doneOrdersForDate.filter((o) => o.st === 'selesai').length,
      gagal: doneOrdersForDate.filter((o) => o.st === 'gagal').length,
      withPhoto: doneOrdersForDate.filter((o) => o.hasPhoto).length,
    }),
    [doneOrdersForDate]
  );

  const rekapStats = useMemo(() => {
    const rows = orders.filter(
      (o) => (!driverFilter || o.driver === driverFilter) && dateOfOrder(o) === selectedDate
    );
    const selesai = rows.filter((o) => o.st === 'selesai').length;
    const gagal = rows.filter((o) => o.st === 'gagal').length;
    const aktif = rows.filter((o) => o.st === 'baru' || o.st === 'jalan').length;
    const withPhoto = rows.filter((o) => o.hasPhoto).length;
    const durations = rows
      .map((o) => getOrderDeliveryDuration(o)?.ms)
      .filter((ms): ms is number => typeof ms === 'number');
    const avgDurationMs =
      durations.length > 0
        ? durations.reduce((acc, v) => acc + v, 0) / durations.length
        : null;

    const driverMap: Record<string, Order[]> = {};
    for (const o of rows) {
      const drv = o.driver || 'Tanpa driver';
      if (!driverMap[drv]) driverMap[drv] = [];
      driverMap[drv].push(o);
    }

    const byDriver = Object.keys(driverMap)
      .sort()
      .map((drv) => {
        const items = driverMap[drv];
        const drvDurations = items
          .map((o) => getOrderDeliveryDuration(o)?.ms)
          .filter((ms): ms is number => typeof ms === 'number');
        return {
          driver: drv,
          total: items.length,
          selesai: items.filter((o) => o.st === 'selesai').length,
          gagal: items.filter((o) => o.st === 'gagal').length,
          aktif: items.filter((o) => o.st === 'baru' || o.st === 'jalan').length,
          avgDurationMs:
            drvDurations.length > 0
              ? drvDurations.reduce((acc, v) => acc + v, 0) / drvDurations.length
              : null,
        };
      });

    return {
      total: rows.length,
      selesai,
      gagal,
      aktif,
      withPhoto,
      avgDurationMs,
      byDriver,
    };
  }, [orders, driverFilter, selectedDate]);

  // History base & smart search + status/duration chip filtering
  const historyBaseOrders = useMemo(
    () =>
      orders.filter(
        (o) =>
          (o.st === 'selesai' || o.st === 'gagal') &&
          (!driverFilter || o.driver === driverFilter)
      ),
    [orders, driverFilter]
  );

  const matchesHistoryQuery = useCallback((o: Order, rawQuery: string) => {
    const tokens = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return true;
    const d = dateOfOrder(o);
    const dur = getOrderDeliveryDuration(o);
    const statusText =
      o.st === 'gagal' ? 'gagal kendala batal' : 'selesai sukses berhasil';
    const durText =
      dur?.bucket === 'fast'
        ? 'cepat'
        : dur?.bucket === 'medium'
          ? 'normal sedang'
          : dur?.bucket === 'slow'
            ? 'lama'
            : '';
    const haystack = [
      o.name,
      o.addr,
      o.tel,
      o.driver,
      o.note,
      o.failReason || '',
      d,
      formatFullDate(d),
      statusText,
      durText,
      o.hasPhoto ? 'foto' : '',
    ]
      .join(' ')
      .toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  }, []);

  const historyQueryMatched = useMemo(
    () => historyBaseOrders.filter((o) => matchesHistoryQuery(o, historyQuery)),
    [historyBaseOrders, historyQuery, matchesHistoryQuery]
  );

  const historyChipCounts = useMemo(() => {
    const forStatus = historyQueryMatched.filter((o) => {
      if (historyDurationFilter === 'all') return true;
      const dur = getOrderDeliveryDuration(o);
      return dur?.bucket === historyDurationFilter;
    });
    const forDuration = historyQueryMatched.filter((o) => {
      if (historyStatusFilter === 'all') return true;
      return o.st === historyStatusFilter;
    });

    const status = {
      all: forStatus.length,
      selesai: forStatus.filter((o) => o.st === 'selesai').length,
      gagal: forStatus.filter((o) => o.st === 'gagal').length,
    };

    const duration = {
      all: forDuration.length,
      fast: 0,
      medium: 0,
      slow: 0,
    };
    for (const o of forDuration) {
      const dur = getOrderDeliveryDuration(o);
      if (dur) duration[dur.bucket] += 1;
    }

    return {status, duration};
  }, [historyQueryMatched, historyStatusFilter, historyDurationFilter]);

  const smartQueryHint = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return null;
    if ((q.includes('gagal') || q.includes('kendala')) && historyStatusFilter !== 'gagal') {
      return {type: 'status' as const, value: 'gagal' as const, label: 'Filter Status: Gagal'};
    }
    if ((q.includes('selesai') || q.includes('sukses')) && historyStatusFilter !== 'selesai') {
      return {type: 'status' as const, value: 'selesai' as const, label: 'Filter Status: Selesai'};
    }
    if (q.includes('cepat') && historyDurationFilter !== 'fast') {
      return {
        type: 'duration' as const,
        value: 'fast' as const,
        label: 'Filter Durasi: Cepat (<30 mnt)',
      };
    }
    if (q.includes('lama') && historyDurationFilter !== 'slow') {
      return {
        type: 'duration' as const,
        value: 'slow' as const,
        label: 'Filter Durasi: Lama (>60 mnt)',
      };
    }
    return null;
  }, [historyQuery, historyStatusFilter, historyDurationFilter]);

  const historyFilteredCount = useMemo(
    () =>
      historyQueryMatched.filter((o) => {
        if (historyStatusFilter !== 'all' && o.st !== historyStatusFilter) return false;
        if (historyDurationFilter !== 'all') {
          const dur = getOrderDeliveryDuration(o);
          if (!dur || dur.bucket !== historyDurationFilter) return false;
        }
        return true;
      }).length,
    [historyQueryMatched, historyStatusFilter, historyDurationFilter]
  );

  // History grouped by date -> driver
  const historyGroups = useMemo(() => {
    const filtered = historyQueryMatched.filter((o) => {
      if (historyStatusFilter !== 'all' && o.st !== historyStatusFilter) return false;
      if (historyDurationFilter !== 'all') {
        const dur = getOrderDeliveryDuration(o);
        if (!dur || dur.bucket !== historyDurationFilter) return false;
      }
      return true;
    });

    const byDate: Record<string, Record<string, Order[]>> = {};
    for (const o of filtered) {
      const d = dateOfOrder(o);
      const drv = o.driver || 'Tanpa driver';
      if (!byDate[d]) byDate[d] = {};
      if (!byDate[d][drv]) byDate[d][drv] = [];
      byDate[d][drv].push(o);
    }

    return Object.keys(byDate)
      .sort()
      .reverse()
      .map((date) => {
        const driversMap = byDate[date];
        const total = Object.values(driversMap).reduce((sum, list) => sum + list.length, 0);
        const drivers = Object.keys(driversMap)
          .sort()
          .map((drv) => ({
            driver: drv,
            items: driversMap[drv].sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0)),
          }));
        return {date, total, drivers};
      });
  }, [historyQueryMatched, historyStatusFilter, historyDurationFilter]);

  // Supabase order actions
  const updateOrderPatch = async (id: string, patch: Record<string, unknown>) => {
    if (!sbClient) return;
    const res = await sbClient.from('orders').update(patch).eq('id', id);
    if (res.error) throw res.error;
  };

  const fetchPhoto = async (orderId: string): Promise<string | null> => {
    if (!sbClient) return null;
    const res = await sbClient
      .from('photos')
      .select('data')
      .eq('order_id', orderId)
      .maybeSingle();
    return (res.data as {data?: string} | null)?.data ?? null;
  };

  const handleStartOrder = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateOrderPatch(id, {st: 'jalan', start_at: Date.now()});
      showToast('Pengantaran dimulai');
      await loadOrders();
      getCurrentPosition().then((pos) => {
        if (pos) {
          updateOrderPatch(id, {d_lat: pos.lat, d_lng: pos.lng, d_at: Date.now()}).catch(() => {});
        }
      });
    } catch (err) {
      showToast(`Gagal: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handlePhotoDone = (id: string) => {
    setCameraOrderId(id);
  };

  const handleConfirmTimestampPhoto = async (
    orderId: string,
    suratJalanUrl: string,
    barangUrl: string,
    coords: LatLng | null
  ) => {
    if (!sbClient || busy) return;
    setBusy(true);
    try {
      showToast('Menyimpan 2 foto TimeSnap…');
      const now = Date.now();
      const bundledData = serializePhotoBundle(suratJalanUrl, barangUrl);
      const photoRes = await sbClient
        .from('photos')
        .upsert({order_id: orderId, data: bundledData, at: now});
      if (photoRes.error) throw photoRes.error;
      const existingOrder = orders.find((o) => o.id === orderId);
      const patch: Record<string, unknown> = {
        st: 'selesai',
        done_at: existingOrder?.doneAt ?? now,
        has_photo: true,
      };
      if (coords) {
        patch.d_lat = coords.lat;
        patch.d_lng = coords.lng;
        patch.d_at = now;
      }
      await updateOrderPatch(orderId, patch);
      setCameraOrderId(null);
      showToast('2 foto TimeSnap tersimpan, order selesai');
      await loadOrders();
    } catch (err) {
      showToast(
        `Foto gagal disimpan: ${(err as Error).message}. Coba lagi atau pilih Selesai.`,
        true
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCorrection = async (
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
  ) => {
    if (!sbClient || busy) return;
    setBusy(true);
    try {
      await updateOrderPatch(orderId, patch);
      setCorrectingOrderId(null);
      showToast('Koreksi riwayat tersimpan');
      await loadOrders();
    } catch (err) {
      showToast(`Gagal menyimpan koreksi: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handleDoneNoPhoto = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateOrderPatch(id, {st: 'selesai', done_at: Date.now()});
      showToast('Order selesai');
      await loadOrders();
    } catch (err) {
      showToast(`Gagal: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmFail = async (reason: string) => {
    const targetId = failTargetId;
    setFailTargetId(null);
    if (!targetId || busy) return;
    setBusy(true);
    try {
      await updateOrderPatch(targetId, {st: 'gagal', done_at: Date.now(), fail_reason: reason});
      showToast('Order dilaporkan kendala', true);
      await loadOrders();
    } catch (err) {
      showToast(`Gagal: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handleViewPhoto = async (id: string) => {
    try {
      const data = await fetchPhoto(id);
      if (!data) {
        showToast('Foto tidak ditemukan.', true);
        return;
      }
      setPhotoPreviewSrc(data);
    } catch {
      showToast('Foto gagal dimuat. Coba lagi.', true);
    }
  };

  const handleDeleteOrder = (id: string) => {
    if (!isOwner || busy || !sbClient) return;
    setConfirmState({
      open: true,
      message: 'Hapus order ini beserta datanya?',
      confirmLabel: 'Hapus',
      destructive: true,
      onConfirm: async () => {
        setConfirmState((s) => ({...s, open: false}));
        setBusy(true);
        try {
          const res = await sbClient.from('orders').delete().eq('id', id);
          if (res.error) throw res.error;
          setRouteOrderIds((prev) => prev.filter((x) => x !== id));
          setExcludedOrderIds((prev) => prev.filter((x) => x !== id));
          showToast('Order dihapus');
          await loadOrders();
        } catch (err) {
          showToast(`Gagal menghapus: ${(err as Error).message}`, true);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleWipeOrders = (list: Order[], label: string) => {
    if (!isOwner || busy || !sbClient) return;
    if (!list.length) {
      showToast('Tidak ada order untuk dihapus.', true);
      return;
    }
    setConfirmState({
      open: true,
      message: `Hapus ${list.length} order ${label} beserta fotonya? Pastikan PDF sudah diunduh. Data tidak bisa dikembalikan.`,
      confirmLabel: 'Hapus',
      destructive: true,
      onConfirm: async () => {
        setConfirmState((s) => ({...s, open: false}));
        setBusy(true);
        try {
          const idsToDelete = list.map((o) => o.id);
          const res = await sbClient.from('orders').delete().in('id', idsToDelete);
          if (res.error) throw res.error;
          const deleteSet = new Set(idsToDelete);
          setRouteOrderIds((prev) => prev.filter((x) => !deleteSet.has(x)));
          setExcludedOrderIds((prev) => prev.filter((x) => !deleteSet.has(x)));
          showToast(`${list.length} order dihapus`);
          await loadOrders();
        } catch (err) {
          showToast(`Gagal menghapus: ${(err as Error).message}`, true);
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleSaveSingleOrder = async (row: NewOrderPayload) => {
    if (!sbClient) return;
    const res = await sbClient.from('orders').insert({...row, st: 'baru'});
    if (res.error) {
      showToast(`Order gagal disimpan: ${res.error.message}`, true);
      throw res.error;
    }
    showToast('Order tersimpan');
    await loadOrders();
  };

  const handleSaveBulkOrders = async (rows: NewOrderPayload[], totalLines: number) => {
    if (!sbClient) return;
    const payload = rows.map((r) => ({...r, st: 'baru'}));
    const res = await sbClient.from('orders').insert(payload);
    if (res.error) {
      showToast(`Order gagal disimpan: ${res.error.message}`, true);
      throw res.error;
    }
    const partial = rows.length < totalLines;
    showToast(
      `${rows.length} dari ${totalLines} order tersimpan${partial ? ', sebagian baris dilewati' : ''}`,
      partial
    );
    await loadOrders();
  };

  const handleSaveOrderLocation = async (
    orderId: string,
    patch: {addr?: string; lat?: number | null; lng?: number | null; link?: string | null}
  ) => {
    try {
      await updateOrderPatch(orderId, patch);
      showToast('Alamat dan titik order diperbarui');
      await loadOrders();
    } catch (err) {
      showToast(`Gagal memperbarui lokasi: ${(err as Error).message}`, true);
    }
  };

  const handleExportPdf = async () => {
    if (busy) return;
    const rows = orders
      .filter((o) => (!driverFilter || o.driver === driverFilter) && dateOfOrder(o) === selectedDate)
      .sort((a, b) => (a.driver || '').localeCompare(b.driver || '') || a.at - b.at);
    if (!rows.length) {
      showToast('Tidak ada order pada tanggal ini.', true);
      return;
    }
    setBusy(true);
    showToast('Menyusun PDF…');
    try {
      await exportDailyPdf(rows, selectedDate, driverFilter, fetchPhoto);
      showToast('PDF siap diunduh');
    } catch (err) {
      showToast(`PDF gagal dibuat: ${(err as Error).message}`, true);
    } finally {
      setBusy(false);
    }
  };

  const handleExportCsv = () => {
    if (busy) return;
    const rows = orders
      .filter((o) => (!driverFilter || o.driver === driverFilter) && dateOfOrder(o) === selectedDate)
      .sort((a, b) => (a.driver || '').localeCompare(b.driver || '') || a.at - b.at);
    if (!rows.length) {
      showToast('Tidak ada order pada tanggal ini.', true);
      return;
    }
    exportDailyCsv(rows, selectedDate, driverFilter);
    showToast('File CSV siap diunduh');
  };

  const currentTabTitle =
    tab === 'aktif'
      ? 'Order Aktif'
      : tab === 'peta'
        ? 'Rute'
        : tab === 'selesai'
          ? 'Pengantaran Selesai'
          : tab === 'riw'
            ? 'Riwayat Pengantaran'
            : 'Rekap & Reset Data';

  return (
    <OptionalMapsProvider
      apiKey={GOOGLE_MAPS_API_KEY}
      enabled={HAS_MAPS_API_KEY}
      onRoutesLib={setRoutesLib}
      onError={setMapsApiError}
    >
    <div className="h-[100dvh] w-full overflow-hidden bg-[#F4F7FB] text-slate-900 flex flex-col">
      {/* Role Entry Screen */}
      {role === null ? (
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-3 min-[360px]:p-5 bg-[radial-gradient(ellipse_at_top,#DBEAFE_0%,#F4F7FB_55%,#EEF4FC_100%)]">
          <motion.div
            initial={{opacity: 0, y: 12}}
            animate={{opacity: 1, y: 0}}
            transition={{duration: 0.24, ease: [0.16, 1, 0.3, 1]}}
            className="w-full max-w-[460px] bg-white border border-slate-200 rounded-[24px] min-[360px]:rounded-[28px] p-5 min-[360px]:p-7 sm:p-8 shadow-[0_20px_50px_-14px_rgba(37,99,235,0.16)]"
          >
            <div className="flex items-center gap-3.5 mb-7">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-[0_8px_20px_-4px_rgba(37,99,235,0.42)] flex items-center justify-center shrink-0">
                <PackageCheck className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-[22px] min-[360px]:text-[24px] font-extrabold tracking-tight text-slate-900 leading-tight">
                  Driver BBS
                </h1>
                <p className="text-[13.5px] text-slate-500 mt-0.5">
                  Pilih peran untuk masuk ke aplikasi pengantaran
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleEnterRole('owner')}
                className="btn-primary-glow w-full min-h-[68px] px-4 min-[360px]:px-5 py-3.5 rounded-2xl font-bold text-[14.5px] min-[360px]:text-[15.5px] flex items-center justify-between gap-3 transition-all active:scale-[0.985]"
              >
                <span className="flex items-center gap-3 text-left min-w-0">
                  <span className="w-10 h-10 rounded-xl bg-white/20 border border-white/20 flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-extrabold leading-tight truncate">
                      Owner / Staff
                    </span>
                    <span className="block text-[12px] font-medium text-blue-100 mt-0.5 truncate">
                      Input order, pantau driver & rekap PDF
                    </span>
                  </span>
                </span>
                <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleEnterRole('driver')}
                className="btn-surface-pill w-full min-h-[68px] px-4 min-[360px]:px-5 py-3.5 rounded-2xl hover:border-blue-300 hover:bg-blue-50/60 text-slate-900 font-semibold text-[14.5px] min-[360px]:text-[15.5px] flex items-center justify-between gap-3 transition-all active:scale-[0.985]"
              >
                <span className="flex items-center gap-3 text-left min-w-0">
                  <span className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                    <Navigation className="w-5 h-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold leading-tight truncate text-slate-900">
                      Driver Armada
                    </span>
                    <span className="block text-[12px] font-normal text-slate-500 mt-0.5 truncate">
                      Buka rute Google Maps & foto TimeSnap
                    </span>
                  </span>
                </span>
                <span className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                  <ChevronRight className="w-4 h-4" />
                </span>
              </button>
            </div>

            <div className="mt-7 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowConnPanel((v) => !v)}
                  className="min-h-[36px] px-2.5 -ml-2.5 rounded-xl hover:bg-slate-100 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  <Settings2 className="w-4 h-4" />
                  Pengaturan database
                </button>
                {connStatus && (
                  <span className="text-[12px] text-slate-500 truncate max-w-[190px]">
                    {connStatus}
                  </span>
                )}
              </div>

              <AnimatePresence>
                {showConnPanel && (
                  <motion.div
                    initial={{opacity: 0, height: 0}}
                    animate={{opacity: 1, height: 'auto'}}
                    exit={{opacity: 0, height: 0}}
                    className="overflow-hidden text-left"
                  >
                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-2.5">
                      <div>
                        <label htmlFor="cu" className="block text-[12px] font-semibold text-slate-700 mb-1">
                          Project URL
                        </label>
                        <input
                          id="cu"
                          value={cfgUrlInput}
                          onChange={(e) => setCfgUrlInput(e.target.value)}
                          placeholder="https://xxxx.supabase.co"
                          className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="ck" className="block text-[12px] font-semibold text-slate-700 mb-1">
                          Publishable key
                        </label>
                        <input
                          id="ck"
                          value={cfgKeyInput}
                          onChange={(e) => setCfgKeyInput(e.target.value)}
                          placeholder="sb_publishable_..."
                          className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveConnection}
                        className="btn-primary-glow w-full min-h-[42px] rounded-xl text-[13px] font-bold transition-all active:scale-[0.98]"
                      >
                        Simpan dan tes koneksi
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative">
          {/* Desktop Slim App Icon Rail */}
          <aside className="hidden lg:flex w-[84px] shrink-0 bg-white border-r border-slate-200 flex-col items-center py-4 justify-between z-30">
            <div className="flex flex-col items-center gap-5 w-full px-2.5">
              <div
                title="Driver BBS"
                className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shadow-[0_6px_16px_-4px_rgba(37,99,235,0.4)]"
              >
                <PackageCheck className="w-5 h-5" />
              </div>

              <nav className="flex flex-col items-center gap-1.5 w-full">
                {TAB_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = tab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      className={`relative w-full py-2.5 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.96] ${
                        active
                          ? 'text-blue-600'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {active && (
                        <motion.div
                          layoutId="appRailPill"
                          transition={{type: 'spring', stiffness: 420, damping: 30}}
                          className="absolute inset-0 rounded-2xl bg-blue-50 border border-blue-200 -z-10"
                        />
                      )}
                      <Icon className="w-5 h-5" />
                      <span className="text-[11px] font-semibold tracking-tight">
                        {item.mobileLabel}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <button
              type="button"
              onClick={() => setRole(null)}
              title="Ganti Peran"
              className="btn-surface-pill w-14 py-2 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.96]"
            >
              <ArrowLeftRight className="w-4 h-4 text-blue-600" />
              <span className="text-[10px] font-semibold">
                {isOwner ? 'Owner' : 'Driver'}
              </span>
            </button>
          </aside>

          {/* Main Full-Viewport Workspace */}
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#F4F7FB]">
            {/* Sticky Clean White Header */}
            <header className="bg-white/95 backdrop-blur-xl border-b border-slate-200 px-3 min-[360px]:px-4 lg:px-8 py-3 min-[360px]:py-3.5 shrink-0 z-20">
              <div className="max-w-5xl mx-auto space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="lg:hidden w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <PackageCheck className="w-4 h-4" />
                    </div>
                    <h1 className="font-display text-[17px] min-[360px]:text-[20px] font-extrabold text-slate-900 truncate">
                      {currentTabTitle}
                    </h1>
                  </div>

                  <div className="flex items-center gap-1.5 min-[360px]:gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={loadingOrders}
                      onClick={() => loadOrders()}
                      title="Muat ulang data order"
                      aria-label="Muat ulang data order"
                      className="btn-surface-pill w-[38px] h-[38px] lg:w-[40px] lg:h-[40px] rounded-xl flex items-center justify-center transition-all active:scale-[0.95] disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`w-4 h-4 text-slate-600 ${loadingOrders ? 'animate-spin text-blue-600' : ''}`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole(null)}
                      className="lg:hidden btn-surface-pill min-h-[38px] px-2.5 rounded-xl text-[12px] font-semibold transition-all active:scale-[0.96]"
                    >
                      {isOwner ? 'Owner' : 'Driver'}
                    </button>
                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => setNewOrderOpen(true)}
                        className="btn-primary-glow min-h-[38px] lg:min-h-[40px] px-3 lg:px-4 rounded-xl text-[12.5px] lg:text-[13px] font-bold inline-flex items-center gap-1.5 transition-all active:scale-[0.96] whitespace-nowrap"
                      >
                        <Plus className="w-4 h-4" />
                        Order
                      </button>
                    )}
                  </div>
                </div>

                {/* Unified 4-cell KPI Strip on Active Orders */}
                {tab === 'aktif' && (
                  <div className="grid grid-cols-4 divide-x divide-slate-200 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
                    <div className="px-2.5 min-[360px]:px-3.5 py-2">
                      <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-amber-600">
                        Baru
                      </div>
                      <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 leading-tight mt-0.5">
                        {summaryCounts.baru}
                      </div>
                    </div>
                    <div className="px-2.5 min-[360px]:px-3.5 py-2">
                      <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-blue-600">
                        Jalan
                      </div>
                      <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 leading-tight mt-0.5">
                        {summaryCounts.jalan}
                      </div>
                    </div>
                    <div className="px-2.5 min-[360px]:px-3.5 py-2">
                      <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-emerald-600">
                        Selesai
                      </div>
                      <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 leading-tight mt-0.5">
                        {summaryCounts.selesai}
                      </div>
                    </div>
                    <div className="px-2.5 min-[360px]:px-3.5 py-2">
                      <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-red-600">
                        Gagal
                      </div>
                      <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 leading-tight mt-0.5">
                        {summaryCounts.gagal}
                      </div>
                    </div>
                  </div>
                )}

                {/* Filter Toolbar + Rute Quick Launcher */}
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Filter Driver"
                    value={driverFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDriverFilter(val);
                      try {
                        localStorage.setItem('drv', val);
                      } catch {
                        // ignore
                      }
                    }}
                    className="flex-1 min-w-0 min-[360px]:min-w-[140px] min-h-[40px] px-2.5 min-[360px]:px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[13px] font-semibold text-slate-800 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Semua driver</option>
                    {driverNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>

                  {tab === 'aktif' && activeMultiStopUrl && (
                    <a
                      href={activeMultiStopUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[40px] px-3 min-[360px]:px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[12.5px] min-[360px]:text-[13px] font-bold inline-flex items-center gap-1.5 transition-all active:scale-[0.97] whitespace-nowrap shrink-0"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      Rute ({orderedActiveStops.length})
                    </a>
                  )}

                  {(tab === 'selesai' || tab === 'rekap') && (
                    <input
                      type="date"
                      aria-label="Tanggal"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="min-w-0 min-h-[40px] px-2.5 min-[360px]:px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[12.5px] min-[360px]:text-[13px] font-semibold text-slate-800 tabular-nums focus:border-blue-500 focus:outline-none"
                    />
                  )}

                  {tab === 'riw' && (
                    <div className="relative w-full sm:w-auto sm:flex-1 sm:min-w-[200px]">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        value={historyQuery}
                        onChange={(e) => setHistoryQuery(e.target.value)}
                        placeholder="Cari nama, alamat, driver, kendala, atau tanggal"
                        aria-label="Cari riwayat"
                        className="w-full min-h-[40px] pl-9 pr-9 py-1.5 rounded-xl bg-white border border-slate-200 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                      />
                      {historyQuery && (
                        <button
                          type="button"
                          onClick={() => setHistoryQuery('')}
                          aria-label="Bersihkan pencarian"
                          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {tab === 'aktif' && activeOrders.length > 0 && (
                  <div className="space-y-2 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[160px]">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          value={activeQuery}
                          onChange={(e) => setActiveQuery(e.target.value)}
                          placeholder="Cari tujuan, alamat, atau catatan…"
                          aria-label="Cari order aktif"
                          className="w-full min-h-[38px] pl-9 pr-8 py-1.5 rounded-xl bg-white border border-slate-200 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                        />
                        {activeQuery && (
                          <button
                            type="button"
                            onClick={() => setActiveQuery('')}
                            aria-label="Bersihkan pencarian"
                            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {routeOrderIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSortActiveByRoute((v) => !v)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 active:scale-[0.97] ${
                            sortActiveByRoute
                              ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                              : 'btn-surface-pill text-slate-600'
                          }`}
                        >
                          <ArrowUpDown className="w-3.5 h-3.5" />
                          Sesuai Rute
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {(
                        [
                          {id: 'all', label: 'Semua', count: activeOrders.length},
                          {
                            id: 'baru',
                            label: 'Baru',
                            count: activeOrders.filter((o) => o.st === 'baru').length,
                          },
                          {
                            id: 'jalan',
                            label: 'Diantar',
                            count: activeOrders.filter((o) => o.st === 'jalan').length,
                          },
                        ] as const
                      ).map((chip) => {
                        const active = activeStatusFilter === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setActiveStatusFilter(chip.id)}
                            className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-[12px] font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 active:scale-[0.97] ${
                              active
                                ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                                : 'btn-surface-pill text-slate-600'
                            }`}
                          >
                            <span>{chip.label}</span>
                            <span className="tabular-nums opacity-75">{chip.count}</span>
                          </button>
                        );
                      })}

                      {(activeOverdueCount > 0 || activeStatusFilter === 'overdue') && (
                        <button
                          type="button"
                          onClick={() => setActiveStatusFilter('overdue')}
                          className={`min-h-[34px] px-2.5 py-1 rounded-xl border text-[12px] font-bold inline-flex items-center gap-1 transition-all whitespace-nowrap shrink-0 active:scale-[0.97] ${
                            activeStatusFilter === 'overdue'
                              ? 'bg-red-50 border-red-300 text-red-700 shadow-xs'
                              : 'bg-red-50/70 border-red-200 text-red-700 hover:bg-red-50'
                          }`}
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          <span>&gt; 60 mnt</span>
                          <span className="tabular-nums">{activeOverdueCount}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'riw' && (
                  <div className="pt-1 space-y-2">
                    {/* Status Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {(
                        [
                          {id: 'all', label: 'Semua Status', count: historyChipCounts.status.all},
                          {id: 'selesai', label: 'Selesai', count: historyChipCounts.status.selesai},
                          {id: 'gagal', label: 'Gagal', count: historyChipCounts.status.gagal},
                        ] as const
                      ).map((chip) => {
                        const active = historyStatusFilter === chip.id;
                        const activeStyle =
                          chip.id === 'gagal'
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-blue-50 border-blue-200 text-blue-700';
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setHistoryStatusFilter(chip.id)}
                            className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 active:scale-[0.97] ${
                              active ? `${activeStyle} shadow-xs` : 'btn-surface-pill text-slate-600'
                            }`}
                          >
                            <span>{chip.label}</span>
                            <span className="tabular-nums opacity-75">{chip.count}</span>
                          </button>
                        );
                      })}

                      {(historyStatusFilter !== 'all' ||
                        historyDurationFilter !== 'all' ||
                        historyQuery.trim() !== '') && (
                        <button
                          type="button"
                          onClick={() => {
                            setHistoryStatusFilter('all');
                            setHistoryDurationFilter('all');
                            setHistoryQuery('');
                          }}
                          className="btn-surface-pill min-h-[40px] px-3 py-1.5 rounded-xl text-[12.5px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 active:scale-[0.97]"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Delivery Duration Range Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                      {(
                        [
                          {id: 'all', label: 'Semua Durasi', count: historyChipCounts.duration.all},
                          {id: 'fast', label: 'Cepat (< 30 mnt)', count: historyChipCounts.duration.fast},
                          {
                            id: 'medium',
                            label: 'Normal (30–60 mnt)',
                            count: historyChipCounts.duration.medium,
                          },
                          {id: 'slow', label: 'Lama (> 60 mnt)', count: historyChipCounts.duration.slow},
                        ] as const
                      ).map((chip) => {
                        const active = historyDurationFilter === chip.id;
                        return (
                          <button
                            key={chip.id}
                            type="button"
                            onClick={() => setHistoryDurationFilter(chip.id)}
                            className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-[12.5px] font-semibold inline-flex items-center gap-1.5 transition-all whitespace-nowrap shrink-0 active:scale-[0.97] ${
                              active
                                ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-xs'
                                : 'btn-surface-pill text-slate-600'
                            }`}
                          >
                            <span>{chip.label}</span>
                            <span className="tabular-nums opacity-75">{chip.count}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-slate-500 tabular-nums">
                      <span>
                        Menampilkan {historyFilteredCount} dari {historyBaseOrders.length} riwayat
                      </span>
                      {smartQueryHint && (
                        <button
                          type="button"
                          onClick={() => {
                            if (smartQueryHint.type === 'status') {
                              setHistoryStatusFilter(smartQueryHint.value);
                            } else {
                              setHistoryDurationFilter(smartQueryHint.value);
                            }
                          }}
                          className="text-blue-600 font-semibold hover:underline"
                        >
                          Terapkan {smartQueryHint.label}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </header>

            {/* Scrollable Workspace Content */}
            <div className="flex-1 overflow-y-auto px-2.5 min-[360px]:px-4 lg:px-8 py-4 min-[360px]:py-5 pb-24 lg:pb-8">
              <div className="max-w-5xl mx-auto">
                <AnimatePresence mode="wait">
                  {tab === 'aktif' && (
                    <motion.div
                      key="tab-aktif"
                      initial={{opacity: 0, y: 6}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -4}}
                      transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
                    >
                      {loadingOrders && activeOrders.length === 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="h-44 rounded-2xl bg-white border border-slate-200 animate-pulse"
                            />
                          ))}
                        </div>
                      ) : activeOrders.length === 0 ? (
                        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
                          <h3 className="font-display text-[17px] font-bold text-slate-900">
                            Tidak ada order aktif
                          </h3>
                          <p className="text-[13.5px] text-slate-500 mt-1">
                            {isOwner
                              ? 'Tekan + Order untuk menambahkan pengiriman baru.'
                              : 'Menunggu order pengantaran baru dari owner.'}
                          </p>
                        </div>
                      ) : filteredActiveOrders.length === 0 ? (
                        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
                          <h3 className="font-display text-[17px] font-bold text-slate-900">
                            Tidak ada order yang cocok
                          </h3>
                          <p className="text-[13.5px] text-slate-500 mt-1">
                            Coba ubah kata kunci pencarian atau pilih filter status lain.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveQuery('');
                              setActiveStatusFilter('all');
                            }}
                            className="mt-4 min-h-[40px] px-4 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[13px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.97]"
                          >
                            <RotateCcw className="w-4 h-4" />
                            Tampilkan semua order aktif
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-stretch">
                          <AnimatePresence mode="popLayout">
                            {filteredActiveOrders.map((order, idx) => {
                              const rIdx = orderedActiveStops.findIndex((s) => s.id === order.id);
                              return (
                                <OrderCard
                                  key={order.id}
                                  order={order}
                                  index={idx}
                                  isOwner={isOwner}
                                  busy={busy}
                                  routeIndex={rIdx >= 0 ? rIdx : null}
                                  nowMs={nowMs}
                                  onStart={handleStartOrder}
                                  onPhotoDone={handlePhotoDone}
                                  onDoneNoPhoto={handleDoneNoPhoto}
                                  onFail={(id) => setFailTargetId(id)}
                                  onViewPhoto={handleViewPhoto}
                                  onCorrect={isOwner ? (id) => setCorrectingOrderId(id) : undefined}
                                  onDelete={handleDeleteOrder}
                                />
                              );
                            })}
                          </AnimatePresence>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {tab === 'peta' && (
                    <motion.div
                      key="tab-peta"
                      initial={{opacity: 0, y: 6}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -4}}
                      transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
                    >
                      <RouteEditorPanel
                        activeOrders={activeOrders}
                        routeOrderIds={routeOrderIds}
                        excludedOrderIds={excludedOrderIds}
                        routeOrigin={routeOrigin}
                        travelMode={travelMode}
                        hasMapsApiKey={HAS_MAPS_API_KEY}
                        routesLib={routesLib}
                        mapsApiError={mapsApiError}
                        onUpdateRouteOrderIds={setRouteOrderIds}
                        onToggleExcludeStop={(id) =>
                          setExcludedOrderIds((prev) =>
                            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                          )
                        }
                        onUpdateOrigin={setRouteOrigin}
                        onUpdateTravelMode={setTravelMode}
                        onSaveOrderLocation={handleSaveOrderLocation}
                        onToast={showToast}
                      />
                    </motion.div>
                  )}

                  {tab === 'selesai' && (
                    <motion.div
                      key="tab-selesai"
                      initial={{opacity: 0, y: 6}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -4}}
                      transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
                      className="space-y-3.5"
                    >
                      {doneOrdersForDate.length === 0 ? (
                        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
                          <h3 className="font-display text-[17px] font-bold text-slate-900">
                            Belum ada pengantaran selesai
                          </h3>
                          <p className="text-[13.5px] text-slate-500 mt-1">
                            Tidak ada catatan pengantaran pada tanggal {selectedDate}.
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-4 divide-x divide-slate-200 rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
                            <div className="px-2.5 min-[360px]:px-3.5 py-2.5">
                              <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-slate-500">
                                Total
                              </div>
                              <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 mt-0.5">
                                {doneOrdersSummary.total}
                              </div>
                            </div>
                            <div className="px-2.5 min-[360px]:px-3.5 py-2.5">
                              <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-emerald-600">
                                Selesai
                              </div>
                              <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 mt-0.5">
                                {doneOrdersSummary.selesai}
                              </div>
                            </div>
                            <div className="px-2.5 min-[360px]:px-3.5 py-2.5">
                              <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-red-600">
                                Kendala
                              </div>
                              <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 mt-0.5">
                                {doneOrdersSummary.gagal}
                              </div>
                            </div>
                            <div className="px-2.5 min-[360px]:px-3.5 py-2.5">
                              <div className="text-[10.5px] min-[360px]:text-[11px] font-semibold text-blue-600">
                                Ada Foto
                              </div>
                              <div className="font-mono-num text-[15px] min-[360px]:text-[16px] font-bold text-slate-900 mt-0.5">
                                {doneOrdersSummary.withPhoto}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                            <AnimatePresence mode="popLayout">
                              {doneOrdersForDate.map((order, idx) => (
                                <OrderCard
                                  key={order.id}
                                  order={order}
                                  index={idx}
                                  isOwner={isOwner}
                                  busy={busy}
                                  onStart={handleStartOrder}
                                  onPhotoDone={handlePhotoDone}
                                  onDoneNoPhoto={handleDoneNoPhoto}
                                  onFail={(id) => setFailTargetId(id)}
                                  onViewPhoto={handleViewPhoto}
                                  onCorrect={(id) => setCorrectingOrderId(id)}
                                  onDelete={handleDeleteOrder}
                                />
                              ))}
                            </AnimatePresence>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}

                  {tab === 'riw' && (
                    <motion.div
                      key="tab-riw"
                      initial={{opacity: 0, y: 6}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -4}}
                      transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
                      className="space-y-4"
                    >
                      {historyGroups.length === 0 ? (
                        <div className="rounded-2xl bg-white border border-slate-200 p-10 text-center">
                          <h3 className="font-display text-[17px] font-bold text-slate-900">
                            {historyBaseOrders.length > 0
                              ? 'Tidak ada riwayat yang cocok'
                              : 'Belum ada riwayat'}
                          </h3>
                          <p className="text-[13.5px] text-slate-500 mt-1">
                            {historyBaseOrders.length > 0
                              ? 'Coba ubah kata kunci pencarian atau pilih chip filter lain.'
                              : 'Order yang selesai atau berkendala akan muncul di sini.'}
                          </p>
                          {historyBaseOrders.length > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setHistoryStatusFilter('all');
                                setHistoryDurationFilter('all');
                                setHistoryQuery('');
                              }}
                              className="mt-4 min-h-[42px] px-4 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-[13px] font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.97]"
                            >
                              <RotateCcw className="w-4 h-4" />
                              Reset semua filter
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                          {historyGroups.map((group) => (
                            <section
                              key={group.date}
                              className="rounded-2xl bg-white border border-slate-200 p-4 shadow-xs"
                            >
                              <div className="flex items-baseline justify-between gap-2 pb-2.5 border-b border-slate-200">
                                <h2 className="font-display text-[16px] font-bold text-slate-900">
                                  {formatFullDate(group.date)}
                                </h2>
                                <span className="text-[12.5px] font-medium text-slate-500 tabular-nums">
                                  {group.total} order
                                </span>
                              </div>

                              <div className="mt-3 space-y-4">
                                {group.drivers.map((drvGroup) => (
                                  <div key={drvGroup.driver}>
                                    <div className="text-[13px] font-bold text-slate-700 mb-1.5">
                                      {drvGroup.driver}{' '}
                                      <span className="font-normal text-slate-500 tabular-nums">
                                        ({drvGroup.items.length})
                                      </span>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                      {drvGroup.items.map((o) => {
                                        const dur = getOrderDeliveryDuration(o);
                                        return (
                                          <div
                                            key={o.id}
                                            className="py-2.5 flex items-start justify-between gap-3"
                                          >
                                            <div className="flex items-start gap-3 min-w-0">
                                              <span className="font-mono-num text-[12.5px] font-semibold text-blue-600 pt-0.5 shrink-0">
                                                {formatHm(o.doneAt || o.at)}
                                              </span>
                                              <div className="min-w-0">
                                                <div className="text-[14px] font-semibold text-slate-900 flex flex-wrap items-baseline gap-x-1.5">
                                                  <span>{o.name}</span>
                                                  <span
                                                    className={`text-[12px] font-medium ${
                                                      o.st === 'gagal'
                                                        ? 'text-red-600'
                                                        : 'text-emerald-600'
                                                    }`}
                                                  >
                                                    · {o.st === 'gagal' ? 'Gagal' : 'Selesai'}
                                                  </span>
                                                  {dur && (
                                                    <span className="text-[12px] font-normal text-slate-500 tabular-nums">
                                                      · {dur.exact ? '' : '~'}
                                                      {formatDuration(dur.ms)}
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="text-[12.5px] text-slate-500 truncate">
                                                  {o.addr}
                                                </div>
                                                {o.st === 'gagal' && o.failReason && (
                                                  <div className="text-[12px] text-red-600 mt-0.5">
                                                    Kendala: {o.failReason}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                              {o.hasPhoto && (
                                                <button
                                                  type="button"
                                                  onClick={() => handleViewPhoto(o.id)}
                                                  className="min-h-[34px] px-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-[12px] font-semibold text-blue-700 transition-all active:scale-[0.96]"
                                                >
                                                  Foto
                                                </button>
                                              )}
                                              <button
                                                type="button"
                                                onClick={() => setCorrectingOrderId(o.id)}
                                                className="btn-surface-pill min-h-[34px] px-2.5 rounded-xl text-[12px] font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 transition-all active:scale-[0.96]"
                                              >
                                                Cek / Koreksi
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {tab === 'rekap' && (
                    <motion.div
                      key="tab-rekap"
                      initial={{opacity: 0, y: 6}}
                      animate={{opacity: 1, y: 0}}
                      exit={{opacity: 0, y: -4}}
                      transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
                      className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch"
                    >
                      {/* Daily & Per-Driver Summary */}
                      <div className="md:col-span-2 rounded-2xl bg-white border border-slate-200 p-4 min-[360px]:p-5 shadow-xs space-y-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div>
                            <h3 className="font-display text-[17px] font-bold text-slate-900">
                              Ringkasan Tanggal {formatFullDate(selectedDate)}
                            </h3>
                            <p className="text-[12.5px] text-slate-500 mt-0.5">
                              {driverFilter
                                ? `Filter driver: ${driverFilter}`
                                : 'Menampilkan semua driver'}
                              {rekapStats.avgDurationMs != null &&
                                ` · Rata-rata antar ${formatDuration(rekapStats.avgDurationMs)}`}
                            </p>
                          </div>
                          {rekapStats.aktif > 0 && (
                            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-semibold tabular-nums">
                              {rekapStats.aktif} masih aktif
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
                            <div className="text-[11.5px] font-semibold text-slate-500">
                              Total Order
                            </div>
                            <div className="font-mono-num text-[20px] font-bold text-slate-900 mt-0.5">
                              {rekapStats.total}
                            </div>
                          </div>
                          <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 px-3 py-2.5">
                            <div className="text-[11.5px] font-semibold text-emerald-700">
                              Selesai
                            </div>
                            <div className="font-mono-num text-[20px] font-bold text-emerald-800 mt-0.5">
                              {rekapStats.selesai}
                            </div>
                          </div>
                          <div className="rounded-xl bg-red-50/70 border border-red-200 px-3 py-2.5">
                            <div className="text-[11.5px] font-semibold text-red-700">
                              Kendala
                            </div>
                            <div className="font-mono-num text-[20px] font-bold text-red-800 mt-0.5">
                              {rekapStats.gagal}
                            </div>
                          </div>
                          <div className="rounded-xl bg-blue-50/70 border border-blue-200 px-3 py-2.5">
                            <div className="text-[11.5px] font-semibold text-blue-700">
                              Foto Lengkap
                            </div>
                            <div className="font-mono-num text-[20px] font-bold text-blue-800 mt-0.5">
                              {rekapStats.withPhoto}
                              <span className="text-[13px] font-semibold text-blue-600">
                                /{rekapStats.total}
                              </span>
                            </div>
                          </div>
                        </div>

                        {rekapStats.byDriver.length > 0 && (
                          <div className="pt-2 border-t border-slate-200">
                            <h4 className="text-[13px] font-bold text-slate-700 mb-2">
                              Performa per Driver
                            </h4>
                            <div className="divide-y divide-slate-100">
                              {rekapStats.byDriver.map((drv) => (
                                <div
                                  key={drv.driver}
                                  className="py-2 flex flex-wrap items-center justify-between gap-2 text-[13px]"
                                >
                                  <span className="font-semibold text-slate-900">
                                    {drv.driver}
                                  </span>
                                  <div className="flex flex-wrap items-center gap-2 tabular-nums text-[12px]">
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                                      {drv.total} order
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-semibold">
                                      {drv.selesai} selesai
                                    </span>
                                    {drv.gagal > 0 && (
                                      <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">
                                        {drv.gagal} gagal
                                      </span>
                                    )}
                                    {drv.avgDurationMs != null && (
                                      <span className="text-slate-500">
                                        rata-rata {formatDuration(drv.avgDurationMs)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <h3 className="font-display text-[17px] font-bold text-slate-900">
                            Ekspor Laporan Harian
                          </h3>
                          <p className="text-[13.5px] text-slate-500 mt-1 leading-relaxed">
                            Unduh laporan PDF lengkap dengan 2 foto bukti TimeSnap atau ekspor tabel
                            CSV untuk dibuka di Excel / Google Sheets.
                          </p>
                        </div>
                        <div className="mt-4 space-y-2.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleExportPdf}
                            className="btn-primary-glow w-full min-h-[48px] px-4 rounded-xl font-bold text-[14.5px] inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            <Download className="w-4 h-4" />
                            Unduh PDF dengan Foto Bukti
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={handleExportCsv}
                            className="btn-surface-pill w-full min-h-[44px] px-4 rounded-xl font-semibold text-[13.5px] inline-flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                          >
                            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                            Unduh CSV (Excel)
                          </button>
                        </div>
                      </div>

                      {isOwner && (
                        <div className="rounded-2xl bg-red-50/70 border border-red-200 p-5 shadow-xs flex flex-col justify-between">
                          <div>
                            <h3 className="font-display text-[17px] font-bold text-red-700">
                              Reset Data
                            </h3>
                            <p className="text-[13.5px] text-red-700/80 mt-1 leading-relaxed">
                              Menghapus order beserta foto buktinya. Pastikan Anda telah mengunduh PDF
                              rekap terlebih dahulu karena data yang dihapus tidak dapat dikembalikan.
                            </p>
                          </div>
                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                handleWipeOrders(
                                  orders.filter(
                                    (o) =>
                                      (o.st === 'selesai' || o.st === 'gagal') &&
                                      dateOfOrder(o) === selectedDate
                                  ),
                                  `selesai/gagal tanggal ${selectedDate}`
                                )
                              }
                              className="min-h-[44px] px-4 rounded-xl bg-white border border-red-200 hover:bg-red-50 text-red-700 font-semibold text-[13.5px] inline-flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-[0.97]"
                            >
                              <Trash2 className="w-4 h-4" />
                              Reset tanggal ini
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleWipeOrders(orders.slice(), '(semua)')}
                              className="btn-danger-glow min-h-[44px] px-4 rounded-xl font-bold text-[13.5px] inline-flex items-center justify-center gap-1.5 transition-all active:scale-[0.97]"
                            >
                              <Trash2 className="w-4 h-4" />
                              Hapus semua data
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Mobile Fixed Bottom App Tab Bar */}
          <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border-t border-slate-200 shadow-[0_-6px_24px_rgba(15,23,42,0.06)] pb-[env(safe-area-inset-bottom,0px)]">
            <div className="grid grid-cols-5 h-16 px-1">
              {TAB_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`relative flex flex-col items-center justify-center gap-0.5 rounded-2xl my-1 transition-colors ${
                      active ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {active && (
                      <motion.div
                        layoutId="mobileTabActive"
                        transition={{type: 'spring', stiffness: 420, damping: 32}}
                        className="absolute inset-x-1.5 inset-y-1 rounded-xl bg-blue-50 border border-blue-200 -z-10"
                      />
                    )}
                    <Icon className="w-5 h-5" />
                    <span className="text-[10px] min-[360px]:text-[10.5px] font-semibold tracking-tight truncate max-w-full px-0.5">
                      {item.mobileLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* Sheets & Modals */}
          <NewOrderSheet
            open={newOrderOpen}
            driverNames={driverNames}
            onClose={() => setNewOrderOpen(false)}
            onSaveSingle={handleSaveSingleOrder}
            onSaveBulk={handleSaveBulkOrders}
            onToast={showToast}
          />

          <TimestampCameraModal
            order={cameraOrder}
            busy={busy}
            onClose={() => setCameraOrderId(null)}
            onConfirmPhotos={handleConfirmTimestampPhoto}
          />

          <OrderCorrectionModal
            order={correctingOrder}
            isOwner={isOwner}
            busy={busy}
            fetchPhoto={fetchPhoto}
            onRetakePhotos={(id) => setCameraOrderId(id)}
            onSaveCorrection={handleSaveCorrection}
            onDeleteOrder={handleDeleteOrder}
            onClose={() => setCorrectingOrderId(null)}
          />

          <PhotoModal
            photoSrc={photoPreviewSrc}
            onClose={() => setPhotoPreviewSrc(null)}
          />

          <FailReasonDialog
            open={failTargetId !== null}
            onConfirm={handleConfirmFail}
            onCancel={() => setFailTargetId(null)}
          />

          <ConfirmDialog
            open={confirmState.open}
            message={confirmState.message}
            confirmLabel={confirmState.confirmLabel}
            destructive={confirmState.destructive}
            onConfirm={confirmState.onConfirm}
            onCancel={() => setConfirmState((s) => ({...s, open: false}))}
          />
        </div>
      )}

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{opacity: 0, y: 16}}
            animate={{opacity: 1, y: 0}}
            exit={{opacity: 0, y: 12}}
            transition={{duration: 0.18}}
            role="status"
            className={`fixed left-4 right-4 sm:left-auto sm:right-6 bottom-20 lg:bottom-6 z-50 sm:max-w-sm px-4 py-3 rounded-2xl shadow-xl border text-[13.5px] font-semibold ${
              toast.bad
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-blue-600 border-blue-700 text-white'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </OptionalMapsProvider>
  );
}
