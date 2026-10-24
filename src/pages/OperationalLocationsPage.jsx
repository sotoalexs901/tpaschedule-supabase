// src/pages/OperationalLocationsPage.jsx
// AeroStation Hub - dynamic operational location registry
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useUser } from '../UserContext.jsx';

const COLLECTION = 'operational_locations';
const ROUTES_COLLECTION = 'operational_routes';
const ROUTE_SAMPLES_COLLECTION = 'operational_route_samples';
const AREAS = ['Main Terminal', 'Airside A', 'Airside C', 'Airside E', 'Airside F', 'Rental Car', 'Other'];
const TYPES = ['Counter', 'Gate', 'Lobby', 'Security', 'CBP / Customs', 'Storage', 'Train', 'Other'];
const field = { width: '100%', boxSizing: 'border-box', padding: 11, borderRadius: 9, border: '1px solid #cbd5e1', background: '#fff' };
const button = { padding: '11px 15px', borderRadius: 9, border: '1px solid #bfdbfe', background: '#eff6ff', cursor: 'pointer', fontWeight: 700 };
const blank = { name: '', area: 'Airside F', otherArea: '', type: 'Counter', otherType: '', notes: '', latitude: '', longitude: '', accuracyMeters: '', radiusMeters: '60', capturedAt: '' };
const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const text = value => String(value || '').trim();
const displayTime = value => { const d = value?.toDate?.() || (value ? new Date(value) : null); return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : 'Not available'; };
const userName = u => u?.displayName || u?.fullName || u?.name || u?.username || 'Management';

const metersBetween = (a, b) => {
  if (!a || !b) return 0;
  const toRad = value => (value * Math.PI) / 180;
  const earth = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earth * Math.asin(Math.sqrt(h));
};
const routeDuration = seconds => {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}m ${String(secs).padStart(2, '0')}s`;
};

const percentile = (values, percentileValue) => {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const rank = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
};
const median = values => {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};
const routeConfidence = count => {
  if (count >= 16) return { label: 'HIGH', background: '#ecfdf5', color: '#047857' };
  if (count >= 6) return { label: 'MEDIUM', background: '#eff6ff', color: '#1d4ed8' };
  if (count >= 3) return { label: 'LOW', background: '#fff7ed', color: '#c2410c' };
  return { label: 'LEARNING', background: '#f8fafc', color: '#64748b' };
};

export default function OperationalLocationsPage() {
  const { user } = useUser();
  const role = String(user?.role || '').toLowerCase();
  const allowed = role === 'station_manager' || role === 'duty_manager';
  const manager = role === 'station_manager';
  const [items, setItems] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routeSamples, setRouteSamples] = useState([]);
  const [routeSamplesLoading, setRouteSamplesLoading] = useState(true);
  const [approvingLearningKey, setApprovingLearningKey] = useState('');
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [existingPhotoUrl, setExistingPhotoUrl] = useState('');
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [routeOriginId, setRouteOriginId] = useState('');
  const [routeDestinationId, setRouteDestinationId] = useState('');
  const [routeMode, setRouteMode] = useState('WCHR');
  const [routeRecording, setRouteRecording] = useState(false);
  const [routePaused, setRoutePaused] = useState(false);
  const [routeStartedAt, setRouteStartedAt] = useState('');
  const [routeElapsedSeconds, setRouteElapsedSeconds] = useState(0);
  const [routeDistanceMeters, setRouteDistanceMeters] = useState(0);
  const [routePoints, setRoutePoints] = useState([]);
  const [routeCheckpoints, setRouteCheckpoints] = useState([]);
  const [checkpointName, setCheckpointName] = useState('');
  const [routeAccuracy, setRouteAccuracy] = useState(null);
  const [routeSaving, setRouteSaving] = useState(false);
  const routeWatchId = useRef(null);
  const lastRoutePoint = useRef(null);
  const change = (key, value) => setForm(old => ({ ...old, [key]: value }));
  const resetPhoto = () => { setPhotoFile(null); setPhotoPreview(''); setExistingPhotoUrl(''); setPhotoRemoved(false); };

  const activeLocations = useMemo(() => items.filter(item => item.active !== false), [items]);
  const stopRouteWatch = () => {
    if (routeWatchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(routeWatchId.current);
      routeWatchId.current = null;
    }
  };
  const beginRouteWatch = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is unavailable on this device.');
      return false;
    }
    stopRouteWatch();
    routeWatchId.current = navigator.geolocation.watchPosition(position => {
      const now = Date.now();
      const point = {
        latitude: Number(position.coords.latitude.toFixed(7)),
        longitude: Number(position.coords.longitude.toFixed(7)),
        accuracyMeters: Math.round(position.coords.accuracy || 0),
        speedMps: Number.isFinite(position.coords.speed) ? Number(position.coords.speed.toFixed(2)) : null,
        heading: Number.isFinite(position.coords.heading) ? Number(position.coords.heading.toFixed(1)) : null,
        capturedAt: new Date(now).toISOString(),
        capturedAtMs: now,
      };
      setRouteAccuracy(point.accuracyMeters);
      const previous = lastRoutePoint.current;
      const moved = previous ? metersBetween(previous, point) : 0;
      const elapsed = previous ? now - previous.capturedAtMs : Infinity;
      if (!previous || moved >= 2 || elapsed >= 4000) {
        if (previous && moved < 250) setRouteDistanceMeters(value => value + moved);
        lastRoutePoint.current = point;
        setRoutePoints(old => [...old.slice(-1498), point]);
      }
    }, e => {
      setError(`Route GPS failed: ${e.message}. Keep location permission enabled while recording.`);
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 });
    return true;
  };
  const startRouteRecording = () => {
    setError(''); setMessage('');
    if (!routeOriginId || !routeDestinationId) { setError('Select an origin and destination for the route.'); return; }
    if (routeOriginId === routeDestinationId) { setError('Origin and destination must be different.'); return; }
    if (!beginRouteWatch()) return;
    const started = new Date().toISOString();
    setRouteStartedAt(started);
    setRouteElapsedSeconds(0);
    setRouteDistanceMeters(0);
    setRoutePoints([]);
    setRouteCheckpoints([]);
    setCheckpointName('');
    lastRoutePoint.current = null;
    setRoutePaused(false);
    setRouteRecording(true);
    setMessage('Route recording started. Keep AeroStation Hub open while recording.');
  };
  const pauseRouteRecording = () => {
    stopRouteWatch();
    setRoutePaused(true);
    setMessage('Route recording paused.');
  };
  const resumeRouteRecording = () => {
    if (!beginRouteWatch()) return;
    setRoutePaused(false);
    setMessage('Route recording resumed.');
  };
  const cancelRouteRecording = () => {
    stopRouteWatch();
    setRouteRecording(false);
    setRoutePaused(false);
    setRouteStartedAt('');
    setRouteElapsedSeconds(0);
    setRouteDistanceMeters(0);
    setRoutePoints([]);
    setRouteCheckpoints([]);
    setCheckpointName('');
    lastRoutePoint.current = null;
    setMessage('Route recording cancelled.');
  };
  const addRouteCheckpoint = () => {
    const name = text(checkpointName);
    if (!name) { setError('Enter a checkpoint name first.'); return; }
    const point = lastRoutePoint.current;
    setRouteCheckpoints(old => [...old, {
      name,
      elapsedSeconds: routeElapsedSeconds,
      latitude: point?.latitude ?? null,
      longitude: point?.longitude ?? null,
      accuracyMeters: point?.accuracyMeters ?? null,
      capturedAt: new Date().toISOString(),
    }]);
    setCheckpointName('');
    setError('');
    setMessage(`Checkpoint added: ${name}`);
  };
  const completeRouteRecording = async () => {
    if (!routeRecording || routeSaving) return;
    stopRouteWatch();
    const origin = items.find(item => item.id === routeOriginId);
    const destination = items.find(item => item.id === routeDestinationId);
    if (!origin || !destination) { setError('Origin or destination is no longer available.'); return; }
    if (routePoints.length < 2) { setError('Not enough GPS points were captured to save this route.'); return; }
    setRouteSaving(true); setError('');
    try {
      const identity = user?.uid || user?.id || user?.employeeId || '';
      await addDoc(collection(db, ROUTES_COLLECTION), {
        originLocationId: origin.id,
        originName: origin.name,
        originArea: origin.area,
        destinationLocationId: destination.id,
        destinationName: destination.name,
        destinationArea: destination.area,
        routeMode,
        status: 'completed',
        startedAt: routeStartedAt,
        completedAt: new Date().toISOString(),
        durationSeconds: routeElapsedSeconds,
        distanceMeters: Math.round(routeDistanceMeters),
        pointCount: routePoints.length,
        checkpointCount: routeCheckpoints.length,
        checkpoints: routeCheckpoints,
        points: routePoints.map(({ capturedAtMs, ...point }) => point),
        createdById: String(identity),
        createdByName: userName(user),
        createdAt: serverTimestamp(),
        source: 'route_recorder_v1',
      });
      setMessage(`Route saved: ${origin.name} to ${destination.name} · ${routeDuration(routeElapsedSeconds)}.`);
      setRouteRecording(false);
      setRoutePaused(false);
      setRouteStartedAt('');
      setRouteElapsedSeconds(0);
      setRouteDistanceMeters(0);
      setRoutePoints([]);
      setRouteCheckpoints([]);
      setCheckpointName('');
      lastRoutePoint.current = null;
    } catch (e) {
      setError(`Route save failed: ${e.message}. Firestore permissions may need review for operational_routes.`);
    } finally {
      setRouteSaving(false);
    }
  };
  useEffect(() => {
    if (!photoFile) { setPhotoPreview(''); return undefined; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    if (!routeRecording || routePaused) return undefined;
    const id = window.setInterval(() => setRouteElapsedSeconds(value => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [routeRecording, routePaused]);
  useEffect(() => () => stopRouteWatch(), []);
  const selectPhoto = e => {
    setError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Use a JPG, PNG or WebP photo.'); e.target.value = ''; return; }
    if (file.size > 8 * 1024 * 1024) { setError('Photo must be 8 MB or smaller.'); e.target.value = ''; return; }
    setPhotoFile(file); setPhotoRemoved(false);
    e.target.value = '';
  };

  useEffect(() => {
    if (!allowed) { setLoading(false); return; }
    return onSnapshot(collection(db, COLLECTION), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
      setError('');
    }, e => { setLoading(false); setError(`Unable to load locations: ${e.message}`); });
  }, [allowed]);

  useEffect(() => {
    if (!allowed) { setRoutesLoading(false); return; }
    return onSnapshot(collection(db, ROUTES_COLLECTION), snap => {
      setRoutes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRoutesLoading(false);
    }, e => { setRoutesLoading(false); setError(`Unable to load recorded routes: ${e.message}`); });
  }, [allowed]);


  useEffect(() => {
    if (!allowed) { setRouteSamplesLoading(false); return; }
    return onSnapshot(collection(db, ROUTE_SAMPLES_COLLECTION), snap => {
      setRouteSamples(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setRouteSamplesLoading(false);
    }, e => {
      setRouteSamplesLoading(false);
      setError(`Unable to load employee route learning samples: ${e.message}`);
    });
  }, [allowed]);

  const visible = useMemo(() => items.filter(x => `${x.name} ${x.area} ${x.type} ${x.id}`.toLowerCase().includes(search.toLowerCase())).sort((a,b) => (a.area || '').localeCompare(b.area || '') || (a.name || '').localeCompare(b.name || '')), [items, search]);

  const routeSummaries = useMemo(() => {
    const groups = new Map();
    routes.filter(route => route.status === 'completed').forEach(route => {
      const key = `${route.originLocationId || route.originName}__${route.destinationLocationId || route.destinationName}__${route.routeMode || 'WCHR'}`;
      const group = groups.get(key) || { key, originName: route.originName || 'Origin', destinationName: route.destinationName || 'Destination', routeMode: route.routeMode || 'WCHR', count: 0, totalSeconds: 0, totalMeters: 0, samples: [] };
      group.count += 1;
      group.totalSeconds += Number(route.durationSeconds) || 0;
      group.totalMeters += Number(route.distanceMeters) || 0;
      group.samples.push(route);
      groups.set(key, group);
    });
    return Array.from(groups.values()).map(group => ({ ...group, averageSeconds: group.count ? Math.round(group.totalSeconds / group.count) : 0, averageMeters: group.count ? Math.round(group.totalMeters / group.count) : 0 })).sort((a,b) => `${a.originName} ${a.destinationName}`.localeCompare(`${b.originName} ${b.destinationName}`));
  }, [routes]);


  const learningGroups = useMemo(() => {
    const groups = new Map();
    routeSamples
      .filter(sample => String(sample.learning_status || '').toUpperCase() === 'COMPLETED')
      .filter(sample => Number(sample.duration_seconds) > 0)
      .filter(sample => text(sample.origin_name) && text(sample.destination_name))
      .forEach(sample => {
        const originName = text(sample.origin_name);
        const destinationName = text(sample.destination_name);
        const direction = String(sample.service_direction || 'OB').toUpperCase();
        const serviceType = String(sample.service_type || 'WCHR').toUpperCase();
        const key = `${originName.toUpperCase()}__${destinationName.toUpperCase()}__${direction}__${serviceType}`;
        const group = groups.get(key) || {
          key, originName, destinationName, direction, serviceType,
          samples: [], durations: [], agents: new Set(),
        };
        group.samples.push(sample);
        group.durations.push(Number(sample.duration_seconds));
        if (text(sample.agent_id || sample.agent_name)) group.agents.add(text(sample.agent_id || sample.agent_name));
        groups.set(key, group);
      });

    return Array.from(groups.values()).map(group => {
      const typicalSeconds = median(group.durations);
      const p90Seconds = percentile(group.durations, 90);
      const fastestSeconds = Math.min(...group.durations);
      const confidence = routeConfidence(group.samples.length);
      const originLocation = activeLocations.find(item => text(item.name).toUpperCase() === group.originName.toUpperCase());
      const destinationLocation = activeLocations.find(item => text(item.name).toUpperCase() === group.destinationName.toUpperCase());
      const alreadyApproved = routes.some(route =>
        route.source === 'route_learning_approved_v1' &&
        text(route.learningKey) === group.key
      );
      return {
        ...group,
        agentCount: group.agents.size,
        typicalSeconds,
        p90Seconds,
        fastestSeconds,
        confidence,
        originLocation,
        destinationLocation,
        alreadyApproved,
      };
    }).sort((a, b) => b.samples.length - a.samples.length || `${a.originName} ${a.destinationName}`.localeCompare(`${b.originName} ${b.destinationName}`));
  }, [routeSamples, activeLocations, routes]);

  const approveLearningRoute = async group => {
    if (!allowed || approvingLearningKey) return;
    if (group.samples.length < 3) {
      setError('At least 3 completed employee trips are required before a learned route can be approved.');
      return;
    }
    if (group.alreadyApproved) {
      setError('This learned route has already been approved.');
      return;
    }
    const confirmed = window.confirm(
      `Approve learned route ${group.originName} → ${group.destinationName}?\n\n` +
      `${group.samples.length} completed trips · Typical ${routeDuration(group.typicalSeconds)} · P90 ${routeDuration(group.p90Seconds)} · Confidence ${group.confidence.label}.`
    );
    if (!confirmed) return;
    setApprovingLearningKey(group.key);
    setError('');
    try {
      const identity = user?.uid || user?.id || user?.employeeId || '';
      await addDoc(collection(db, ROUTES_COLLECTION), {
        originLocationId: group.originLocation?.id || '',
        originName: group.originName,
        originArea: group.originLocation?.area || '',
        destinationLocationId: group.destinationLocation?.id || '',
        destinationName: group.destinationName,
        destinationArea: group.destinationLocation?.area || '',
        routeMode: group.serviceType,
        serviceDirection: group.direction,
        status: 'completed',
        durationSeconds: group.typicalSeconds,
        averageSeconds: group.typicalSeconds,
        p90Seconds: group.p90Seconds,
        fastestSeconds: group.fastestSeconds,
        sampleCount: group.samples.length,
        agentCount: group.agentCount,
        confidence: group.confidence.label,
        learningKey: group.key,
        sampleIds: group.samples.map(sample => sample.id),
        createdById: String(identity),
        createdByName: userName(user),
        createdAt: serverTimestamp(),
        approvedAt: serverTimestamp(),
        approvedById: String(identity),
        approvedByName: userName(user),
        source: 'route_learning_approved_v1',
      });
      setMessage(`Learned route approved: ${group.originName} to ${group.destinationName} · typical ${routeDuration(group.typicalSeconds)}.`);
    } catch (e) {
      setError(`Unable to approve learned route: ${e.message}`);
    } finally {
      setApprovingLearningKey('');
    }
  };

  const capture = () => {
    setMessage(''); setError('');
    if (!navigator.geolocation) { setError('Geolocation is unavailable on this device.'); return; }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(position => {
      const { latitude, longitude, accuracy } = position.coords;
      setForm(old => ({ ...old, latitude: latitude.toFixed(7), longitude: longitude.toFixed(7), accuracyMeters: Math.round(accuracy), capturedAt: new Date().toISOString() }));
      setCapturing(false);
      setMessage('GPS captured. Verify the location name and accuracy before saving.');
    }, e => { setCapturing(false); setError(`Location capture failed: ${e.message}. Allow location access and try again.`); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };

  const save = async e => {
    e.preventDefault(); setError(''); setMessage('');
    if (!allowed) return;
    const name = text(form.name);
    const area = form.area === 'Other' ? text(form.otherArea) : form.area;
    const type = form.type === 'Other' ? text(form.otherType) : form.type;
    const lat = Number(form.latitude), lng = Number(form.longitude), accuracy = Number(form.accuracyMeters), radius = Number(form.radiusMeters);
    if (name.length < 3 || !area || !type) { setError('Provide a location name, area, and type.'); return; }
    if (form.latitude === '' || form.longitude === '' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { setError('Capture valid GPS coordinates first.'); return; }
    if (form.accuracyMeters === '' || !Number.isFinite(accuracy) || accuracy < 0) { setError('GPS accuracy is required.'); return; }
    if (!Number.isFinite(radius) || radius < 15 || radius > 300) { setError('Detection radius must be between 15 and 300 meters.'); return; }
    if (!form.capturedAt && !editingId) { setError('Capture the GPS location before saving.'); return; }
    const id = editingId || slug(`${area}_${name}`);
    if (!id) { setError('Invalid location ID.'); return; }
    const identity = user?.uid || user?.id || user?.employeeId || '';
    const data = { name, area, type, notes: text(form.notes), latitude: lat, longitude: lng, accuracyMeters: accuracy, radiusMeters: radius, gpsCapturedAt: form.capturedAt || null, updatedById: String(identity), updatedByName: userName(user), updatedAt: serverTimestamp() };
    setBusy(true);
    try {
      let photoUrl = photoRemoved ? null : existingPhotoUrl || null;
      let photoPath = null;
      if (photoFile) {
        setUploading(true);
        const extension = photoFile.type === 'image/png' ? 'png' : photoFile.type === 'image/webp' ? 'webp' : 'jpg';
        const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${extension}`;
        photoPath = `operational_locations/${id}/${uniqueName}`;
        const object = storageRef(getStorage(), photoPath);
        await uploadBytes(object, photoFile, { contentType: photoFile.type, customMetadata: { locationId: id } });
        photoUrl = await getDownloadURL(object);
      }
      await runTransaction(db, async tx => {
        const ref = doc(db, COLLECTION, id);
        const existing = await tx.get(ref);
        if (!editingId && existing.exists()) throw new Error('A location with this ID already exists. Edit the existing record instead.');
        if (editingId && !existing.exists()) throw new Error('This location was removed. Refresh and retry.');
        const photoFields = photoFile || photoRemoved
          ? { photoUrl, photoPath: photoPath || null, photoUpdatedAt: serverTimestamp(), photoUpdatedByName: userName(user) }
          : {};
        if (existing.exists()) tx.update(ref, { ...data, ...photoFields });
        else tx.set(ref, { ...data, ...photoFields, locationId: id, active: true, createdById: String(identity), createdByName: userName(user), createdAt: serverTimestamp() });
      });
      setForm(blank); setEditingId(''); resetPhoto(); setMessage(`Location ${editingId ? 'updated' : 'registered'} successfully.`);
    } catch (e) { setError(`Save failed: ${e.message}. Firestore permissions may need review.`); }
    finally { setBusy(false); setUploading(false); }
  };

  const edit = item => {
    setEditingId(item.id);
    setPhotoFile(null); setPhotoPreview(''); setExistingPhotoUrl(item.photoUrl || ''); setPhotoRemoved(false);
    setForm({ name: item.name || '', area: AREAS.includes(item.area) ? item.area : 'Other', otherArea: AREAS.includes(item.area) ? '' : item.area || '', type: TYPES.includes(item.type) ? item.type : 'Other', otherType: TYPES.includes(item.type) ? '' : item.type || '', notes: item.notes || '', latitude: String(item.latitude ?? ''), longitude: String(item.longitude ?? ''), accuracyMeters: String(item.accuracyMeters ?? ''), radiusMeters: String(item.radiusMeters ?? 60), capturedAt: item.gpsCapturedAt || '' });
    setError(''); setMessage('Editing an existing location. Capture GPS again if the position has changed.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggle = async item => {
    if (!manager || busy) return;
    if (!window.confirm(`${item.active === false ? 'Reactivate' : 'Deactivate'} ${item.name}? Historical records will be preserved.`)) return;
    setBusy(true); setError('');
    try {
      await runTransaction(db, async tx => {
        const ref = doc(db, COLLECTION, item.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('Location no longer exists.');
        tx.update(ref, { active: snap.data().active === false, updatedAt: serverTimestamp(), updatedByName: userName(user) });
      });
    } catch (e) { setError(`Update failed: ${e.message}`); }
    finally { setBusy(false); }
  };

  if (!allowed) return <main style={{padding:24}}><h2>Access restricted</h2><p>Only Station Managers and Duty Managers may manage operational locations.</p></main>;
  return <main style={{maxWidth:1050,margin:'0 auto',padding:'20px 16px',color:'#0f172a'}}>
    <h1 style={{marginBottom:4}}>TPA Location Management</h1>
    <p style={{color:'#64748b',marginTop:0}}>Dynamic location catalog for AeroStation Hub · Station Manager / Duty Manager</p>
    {error && <div role="alert" style={{padding:12,background:'#fff1f2',borderRadius:10,marginBottom:12}}>{error}</div>}
    {message && <div role="status" style={{padding:12,background:'#eff6ff',borderRadius:10,marginBottom:12}}>{message}</div>}
    <section style={{background:'#fff',border:'1px solid #dbeafe',borderRadius:18,padding:18,marginBottom:18,display:'grid',gap:12}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><div style={{fontSize:12,fontWeight:800,letterSpacing:1.2,color:'#2563eb'}}>LOCATION INTELLIGENCE</div><h2 style={{margin:'3px 0 0'}}>🧭 Route Recorder</h2></div>
        <span style={{padding:'6px 10px',borderRadius:999,background:routeRecording?'#ecfdf5':'#f8fafc',color:routeRecording?'#047857':'#64748b',fontSize:12,fontWeight:800}}>{routeRecording ? (routePaused ? 'PAUSED' : 'RECORDING') : 'READY'}</span>
      </div>
      <p style={{margin:0,color:'#64748b',fontSize:14}}>Record real operational routes between saved TPA locations. Add checkpoints such as Airside F Train, TSA Checkpoint or elevators while you move.</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
        <label>Origin<select style={field} value={routeOriginId} disabled={routeRecording} onChange={e=>setRouteOriginId(e.target.value)}><option value="">Select origin</option>{activeLocations.map(item=><option key={item.id} value={item.id}>{item.name} · {item.area}</option>)}</select></label>
        <label>Destination<select style={field} value={routeDestinationId} disabled={routeRecording} onChange={e=>setRouteDestinationId(e.target.value)}><option value="">Select destination</option>{activeLocations.map(item=><option key={item.id} value={item.id}>{item.name} · {item.area}</option>)}</select></label>
        <label>Route type<select style={field} value={routeMode} disabled={routeRecording} onChange={e=>setRouteMode(e.target.value)}><option>WCHR</option><option>Walking</option><option>UMNR</option><option>Other</option></select></label>
      </div>
      {!routeRecording ? <button type="button" style={{...button,background:'#0f6fae',color:'#fff',width:'fit-content'}} onClick={startRouteRecording}>▶ Start Route Recording</button> : <>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:10}}>
          <div style={{padding:12,borderRadius:12,background:'#f8fafc'}}><small style={{color:'#64748b'}}>Elapsed</small><div style={{fontWeight:900,fontSize:20}}>{routeDuration(routeElapsedSeconds)}</div></div>
          <div style={{padding:12,borderRadius:12,background:'#f8fafc'}}><small style={{color:'#64748b'}}>Recorded distance</small><div style={{fontWeight:900,fontSize:20}}>{Math.round(routeDistanceMeters)} m</div></div>
          <div style={{padding:12,borderRadius:12,background:'#f8fafc'}}><small style={{color:'#64748b'}}>GPS points</small><div style={{fontWeight:900,fontSize:20}}>{routePoints.length}</div></div>
          <div style={{padding:12,borderRadius:12,background:'#f8fafc'}}><small style={{color:'#64748b'}}>Current accuracy</small><div style={{fontWeight:900,fontSize:20}}>{routeAccuracy == null ? '—' : `±${routeAccuracy} m`}</div></div>
        </div>
        <div style={{padding:14,borderRadius:12,background:'#f8fafc',display:'grid',gap:10}}>
          <strong>Add checkpoint</strong>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}><input style={{...field,flex:'1 1 230px'}} placeholder="e.g. Airside F Train / TSA Checkpoint" value={checkpointName} onChange={e=>setCheckpointName(e.target.value)} /><button type="button" style={button} onClick={addRouteCheckpoint}>+ Add Checkpoint</button></div>
          {routeCheckpoints.length>0 && <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{routeCheckpoints.map((cp,index)=><span key={`${cp.capturedAt}_${index}`} style={{padding:'6px 9px',borderRadius:999,background:'#e0f2fe',fontSize:12,fontWeight:700}}>{index+1}. {cp.name} · {routeDuration(cp.elapsedSeconds)}</span>)}</div>}
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {!routePaused ? <button type="button" style={button} onClick={pauseRouteRecording}>⏸ Pause</button> : <button type="button" style={button} onClick={resumeRouteRecording}>▶ Resume</button>}
          <button type="button" style={{...button,background:'#047857',color:'#fff'}} disabled={routeSaving} onClick={completeRouteRecording}>{routeSaving?'Saving route…':'✅ Complete & Save Route'}</button>
          <button type="button" style={{...button,background:'#fff1f2',borderColor:'#fecdd3',color:'#be123c'}} disabled={routeSaving} onClick={cancelRouteRecording}>Cancel</button>
        </div>
        <small style={{color:'#64748b'}}>Keep AeroStation Hub open while recording. GPS indoors may drift, so checkpoints and saved operational locations remain important route anchors.</small>
      </>}
    </section>
    <form onSubmit={save} style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:18,display:'grid',gap:12}}>
      <h2 style={{margin:0,fontSize:20}}>{editingId ? 'Edit Location' : 'Register New Location'}</h2>
      <label>Location name<input style={field} required maxLength={100} placeholder="e.g. WL Counter / Gate F87" value={form.name} onChange={e=>change('name',e.target.value)} /></label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:12}}>
        <label>Airport area<select style={field} value={form.area} onChange={e=>change('area',e.target.value)}>{AREAS.map(x=><option key={x}>{x}</option>)}</select></label>
        <label>Location type<select style={field} value={form.type} onChange={e=>change('type',e.target.value)}>{TYPES.map(x=><option key={x}>{x}</option>)}</select></label>
      </div>
      {form.area==='Other' && <label>New area name<input style={field} required value={form.otherArea} onChange={e=>change('otherArea',e.target.value)} /></label>}
      {form.type==='Other' && <label>New type<input style={field} required value={form.otherType} onChange={e=>change('otherType',e.target.value)} /></label>}
      <label>Operational notes (optional)<textarea style={field} rows={2} maxLength={500} placeholder="Level, terminal side, landmark or nearby route" value={form.notes} onChange={e=>change('notes',e.target.value)} /></label>
      <div style={{padding:14,background:'#f8fafc',borderRadius:12,display:'grid',gap:10}}>
        <strong>Location Photo (optional)</strong>
        <p style={{fontSize:13,color:'#475569',margin:0}}>Take a photo with your phone or upload a JPG, PNG or WebP image (maximum 8 MB). Avoid photographing passengers, IDs, badges or restricted security information.</p>
        <label style={{...button,display:'inline-block',width:'fit-content',cursor:busy?'not-allowed':'pointer'}}>
          📷 Take Photo / Upload Photo
          <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={selectPhoto} disabled={busy} style={{position:'absolute',width:1,height:1,opacity:0}} />
        </label>
        {(photoPreview || (existingPhotoUrl && !photoRemoved)) && <div style={{display:'grid',gap:8,justifyItems:'start'}}>
          <img src={photoPreview || existingPhotoUrl} alt="Operational location preview" style={{width:'100%',maxWidth:440,maxHeight:260,objectFit:'contain',borderRadius:10,border:'1px solid #cbd5e1',background:'#fff'}} />
          <button type="button" style={button} disabled={busy} onClick={()=>{setPhotoFile(null);setPhotoPreview('');setExistingPhotoUrl('');setPhotoRemoved(true);}}>Remove Photo</button>
        </div>}
        <small>Photo is stored in Firebase Storage and its reference is saved in the location record. Existing photos are not deleted from Storage when replaced or removed.</small>
      </div>
      <div style={{padding:14,background:'#f8fafc',borderRadius:12}}>
        <button type="button" style={button} disabled={capturing||busy} onClick={capture}>{capturing?'Capturing GPS…':'📍 Capture My Location'}</button>
        <p style={{fontSize:13,color:'#475569'}}>GPS: {form.latitude && form.longitude ? `${form.latitude}, ${form.longitude}` : 'Not captured'} · Accuracy: {form.accuracyMeters === '' ? 'Unknown' : `±${form.accuracyMeters} m`}</p>
        <label style={{display:'block',marginTop:10}}>Detection radius (meters)<input type="number" min="15" max="300" step="5" style={field} value={form.radiusMeters} onChange={e=>change('radiusMeters',e.target.value)} /></label>
        <small>GPS accuracy indoors may be poor. The registered operational zone is authoritative; coordinates are supporting information. Capture is user-initiated, not continuous tracking.</small>
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}><button style={{...button,background:'#1769aa',color:'#fff'}} disabled={busy||capturing} type="submit">{uploading?'Uploading photo…':busy?'Saving…':editingId?'Save Changes':'Save New Location'}</button>{editingId&&<button type="button" style={button} onClick={()=>{setEditingId('');setForm(blank);resetPhoto();}}>Cancel Edit</button>}</div>
    </form>
    <section style={{marginTop:24,background:'#fff',border:'1px solid #c7d2fe',borderRadius:18,padding:18}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
        <div><div style={{fontSize:12,fontWeight:800,letterSpacing:1.2,color:'#4f46e5'}}>SMART ROUTE LEARNING</div><h2 style={{margin:'3px 0 0'}}>Employee Route Learning</h2></div>
        <span style={{fontSize:12,color:'#64748b'}}>{routeSamples.filter(sample=>String(sample.learning_status||'').toUpperCase()==='COMPLETED').length} completed samples</span>
      </div>
      <p style={{color:'#64748b',fontSize:14,lineHeight:1.55}}>WCHR agents generate these route samples automatically from consented live tracking while performing real services. Review the operational evidence below before approving a learned route for Dispatch and Smart Intelligence.</p>
      {routeSamplesLoading ? <p>Loading employee route learning…</p> : learningGroups.length===0 ? <div style={{padding:14,borderRadius:12,background:'#f8fafc',color:'#64748b'}}>No completed employee route samples yet. Samples will appear automatically after agents complete tracked WCHR journeys.</div> : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))',gap:12}}>{learningGroups.map(group=><article key={group.key} style={{padding:15,border:'1px solid #e2e8f0',borderRadius:14,background:'#f8fbff'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'flex-start'}}>
          <div><div style={{fontWeight:900,fontSize:15}}>{group.originName} → {group.destinationName}</div><div style={{fontSize:12,color:'#64748b',marginTop:3}}>{group.serviceType} · {group.direction} · {group.samples.length} completed trip{group.samples.length===1?'':'s'} · {group.agentCount} agent{group.agentCount===1?'':'s'}</div></div>
          <span style={{padding:'5px 9px',borderRadius:999,background:group.confidence.background,color:group.confidence.color,fontSize:11,fontWeight:900}}>{group.confidence.label}</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginTop:12}}>
          <div style={{padding:10,borderRadius:10,background:'#fff'}}><small style={{color:'#64748b'}}>Typical</small><div style={{fontWeight:900}}>{routeDuration(group.typicalSeconds)}</div></div>
          <div style={{padding:10,borderRadius:10,background:'#fff'}}><small style={{color:'#64748b'}}>P90</small><div style={{fontWeight:900}}>{routeDuration(group.p90Seconds)}</div></div>
          <div style={{padding:10,borderRadius:10,background:'#fff'}}><small style={{color:'#64748b'}}>Fastest</small><div style={{fontWeight:900}}>{routeDuration(group.fastestSeconds)}</div></div>
        </div>
        <div style={{marginTop:10,fontSize:12,color:'#64748b'}}>Location match: {group.originLocation?'✓':'⚠'} Origin · {group.destinationLocation?'✓':'⚠'} Destination</div>
        <div style={{marginTop:12}}>
          <button type="button" style={{...button,background:group.alreadyApproved?'#ecfdf5':group.samples.length>=3?'#4f46e5':'#f8fafc',color:group.alreadyApproved?'#047857':group.samples.length>=3?'#fff':'#94a3b8',borderColor:group.alreadyApproved?'#a7f3d0':group.samples.length>=3?'#4f46e5':'#e2e8f0'}} disabled={group.alreadyApproved||group.samples.length<3||Boolean(approvingLearningKey)} onClick={()=>approveLearningRoute(group)}>{group.alreadyApproved?'✓ Approved for Smart Dispatch':approvingLearningKey===group.key?'Approving…':group.samples.length<3?`Learning · ${3-group.samples.length} more trip${3-group.samples.length===1?'':'s'} needed`:'Approve Route for Smart Dispatch'}</button>
        </div>
      </article>)}</div>}
    </section>

    <section style={{marginTop:24,background:'#fff',border:'1px solid #e2e8f0',borderRadius:18,padding:18}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><div style={{fontSize:12,fontWeight:800,letterSpacing:1.2,color:'#7c3aed'}}>ROUTE INTELLIGENCE</div><h2 style={{margin:'3px 0 0'}}>Recorded Routes</h2></div><span style={{fontSize:12,color:'#64748b'}}>{routes.length} recordings</span></div>
      <p style={{color:'#64748b',fontSize:14}}>Completed recordings are grouped by origin, destination and route type. These averages can later feed Arrival Readiness and Smart Dispatch.</p>
      {routesLoading ? <p>Loading recorded routes…</p> : routeSummaries.length===0 ? <p>No routes recorded yet.</p> : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:10}}>{routeSummaries.map(route=><article key={route.key} style={{padding:14,border:'1px solid #e2e8f0',borderRadius:12,background:'#f8fafc'}}>
        <div style={{fontWeight:900}}>{route.originName} → {route.destinationName}</div>
        <div style={{fontSize:12,color:'#64748b',marginTop:3}}>{route.routeMode} · {route.count} recording{route.count===1?'':'s'}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}><div><small style={{color:'#64748b'}}>Avg time</small><div style={{fontWeight:800}}>{routeDuration(route.averageSeconds)}</div></div><div><small style={{color:'#64748b'}}>Avg distance</small><div style={{fontWeight:800}}>{route.averageMeters} m</div></div></div>
      </article>)}</div>}
    </section>
    <section style={{marginTop:24}}><h2>Registered Locations ({items.length})</h2><input style={field} placeholder="Search by location, area or ID" value={search} onChange={e=>setSearch(e.target.value)}/>
      {loading ? <p>Loading locations…</p> : visible.length===0 ? <p>No matching locations registered yet.</p> : <div style={{display:'grid',gap:10,marginTop:12}}>{visible.map(item=><article key={item.id} style={{padding:15,border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><strong>{item.name}</strong><span style={{color:item.active===false?'#b45309':'#15803d'}}>{item.active===false?'Inactive':'Active'}</span></div>
        <div style={{fontSize:13,color:'#475569',marginTop:5}}>{item.area} · {item.type} · ID: {item.id}</div>
        <div style={{fontSize:12,color:'#64748b',marginTop:5}}>GPS: {item.latitude}, {item.longitude} · ±{item.accuracyMeters ?? '?'} m · Radius: {item.radiusMeters ?? 60} m · Updated: {displayTime(item.updatedAt)} · By: {item.updatedByName || item.createdByName || 'Unknown'}</div>
        {item.notes && <p style={{fontSize:13}}>{item.notes}</p>}
        {item.photoUrl && <div style={{marginTop:10}}><img src={item.photoUrl} alt={`Registered location: ${item.name}`} loading="lazy" style={{width:'100%',maxWidth:320,maxHeight:190,objectFit:'cover',borderRadius:10,border:'1px solid #e2e8f0'}} /></div>}
        <div style={{display:'flex',gap:8,marginTop:10}}><button style={button} onClick={()=>edit(item)} disabled={busy}>Edit</button>{manager&&<button style={button} onClick={()=>toggle(item)} disabled={busy}>{item.active===false?'Reactivate':'Deactivate'}</button>}</div>
      </article>)}</div>}
    </section>
  </main>;
}
