import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useUser } from "../UserContext.jsx";
import { matchOperationalLocation } from "../utils/operationalGeofence.js";
import { cleanText, getEmployeeIdentifier, safeUpper } from "../utils/wchrOperations.js";

const ACTIVE_SHIFT_STATUS = "ACTIVE";
const BREAK_AVAILABILITY = "BREAK";
const UNAVAILABLE_AVAILABILITY = "UNAVAILABLE";
const WCHR_PAGE_PATH = "/wchr";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

export default function GlobalWchrLiveLocationTracker() {
  const { user } = useUser();
  const location = useLocation();

  const [employee, setEmployee] = useState(null);
  const [shift, setShift] = useState(null);
  const [zones, setZones] = useState([]);

  const onDedicatedWchrPage =
    location.pathname === WCHR_PAGE_PATH ||
    location.pathname.startsWith(`${WCHR_PAGE_PATH}/`);

  useEffect(() => {
    let cancelled = false;

    async function resolveEmployee() {
      if (!user) {
        setEmployee(null);
        return;
      }

      try {
        const linkedEmployeeId = cleanText(user?.employeeId);
        if (linkedEmployeeId) {
          const snapshot = await getDoc(doc(db, "employees", linkedEmployeeId));
          if (snapshot.exists()) {
            if (!cancelled) setEmployee({ id: snapshot.id, ...snapshot.data() });
            return;
          }
        }

        const usernames = Array.from(
          new Set([user?.username, user?.loginUsername].map(normalizeText).filter(Boolean))
        );

        for (const username of usernames) {
          const snapshot = await getDocs(
            query(collection(db, "employees"), where("loginUsername", "==", username))
          );
          if (!snapshot.empty) {
            const first = snapshot.docs[0];
            if (!cancelled) setEmployee({ id: first.id, ...first.data() });
            return;
          }
        }

        if (!cancelled) setEmployee(null);
      } catch (error) {
        console.warn("Global WCHR tracker could not resolve employee:", error);
        if (!cancelled) setEmployee(null);
      }
    }

    resolveEmployee();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.uid, user?.employeeId, user?.username, user?.loginUsername]);

  const agentId = useMemo(
    () => getEmployeeIdentifier(employee, user),
    [employee, user]
  );

  useEffect(() => {
    if (!agentId) {
      setShift(null);
      return undefined;
    }

    return onSnapshot(
      doc(db, "wchr_agent_shifts", agentId),
      (snapshot) => {
        setShift(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
      },
      (error) => {
        console.warn("Global WCHR tracker shift listener failed:", error);
        setShift(null);
      }
    );
  }, [agentId]);

  useEffect(() => {
    return onSnapshot(
      collection(db, "operational_locations"),
      (snapshot) => {
        setZones(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => item.active !== false)
        );
      },
      (error) => {
        console.warn("Global WCHR tracker location catalog failed:", error);
        setZones([]);
      }
    );
  }, []);

  useEffect(() => {
    // The dedicated WCHR page already owns the route-learning GPS watcher.
    // Suspend the global watcher there to avoid duplicate browser geolocation watchers.
    if (onDedicatedWchrPage) return undefined;

    const availability = safeUpper(shift?.availability_status);
    const persistentConsent = employee?.live_tracking_consent === true;

    if (
      !agentId ||
      safeUpper(shift?.status) !== ACTIVE_SHIFT_STATUS ||
      !persistentConsent ||
      [BREAK_AVAILABILITY, UNAVAILABLE_AVAILABILITY].includes(availability)
    ) {
      return undefined;
    }

    if (!navigator.geolocation) return undefined;

    let cancelled = false;
    let lastSavedAt = 0;
    let candidateZone = "";
    let consecutiveMatches = 0;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        if (cancelled) return;

        const { latitude, longitude, accuracy } = position.coords || {};
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

        const zone = matchOperationalLocation(position.coords, zones);
        const zoneName = cleanText(zone?.name);

        if (zoneName && zoneName === candidateZone) {
          consecutiveMatches += 1;
        } else {
          candidateZone = zoneName;
          consecutiveMatches = 1;
        }

        const confirmedZone = Boolean(zoneName && consecutiveMatches >= 2);
        const nowMs = Date.now();
        if (nowMs - lastSavedAt < 15000) return;
        lastSavedAt = nowMs;

        try {
          const shiftRef = doc(db, "wchr_agent_shifts", agentId);
          const shiftFields = {
            live_gps: {
              latitude,
              longitude,
              accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
              recorded_at: serverTimestamp(),
              source: "browser_geolocation_global",
            },
            global_live_tracking_active: true,
            global_live_tracking_page: location.pathname,
            global_live_tracking_at: serverTimestamp(),
            updated_at: serverTimestamp(),
          };

          if (confirmedZone) {
            shiftFields.current_location = zoneName;
            shiftFields.location_source = "gps_geofence_global";
            shiftFields.location_id = zone.id;
            shiftFields.location_updated_at = serverTimestamp();
          }

          await updateDoc(shiftRef, shiftFields);

          const activeReportId = cleanText(shift?.active_report_id);
          if (activeReportId && confirmedZone) {
            try {
              await updateDoc(doc(db, "wch_reports", activeReportId), {
                current_location: zoneName,
                last_location: zoneName,
                last_location_update_at: serverTimestamp(),
                last_updated_at: serverTimestamp(),
              });
            } catch (reportError) {
              console.warn("Global WCHR tracker report location update failed:", reportError);
            }
          }
        } catch (error) {
          console.warn("Global WCHR live location update failed:", error);
        }
      },
      (error) => {
        console.warn("Global WCHR geolocation unavailable:", error?.message || error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 20000,
      }
    );

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [
    agentId,
    shift?.status,
    shift?.availability_status,
    shift?.active_report_id,
    employee?.live_tracking_consent,
    zones,
    onDedicatedWchrPage,
    location.pathname,
  ]);

  return null;
}
