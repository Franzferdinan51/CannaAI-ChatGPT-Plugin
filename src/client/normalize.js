function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export function unwrapPayloadData(payload) {
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload.data;
  }
  return payload;
}

export function normalizePlant(raw) {
  if (!raw || typeof raw !== "object") return null;
  const roomId = raw.roomId ?? raw.locationId ?? null;
  const strain = raw.strain?.name ?? (typeof raw.strain === "string" ? raw.strain : null) ?? raw.strainName ?? "Unknown";
  const healthStatus = raw.healthStatus ?? raw.health?.status ?? null;

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? "Unnamed plant"),
    strain: String(strain),
    stage: String(raw.stage ?? "unknown"),
    day: asNumber(raw.age ?? raw.day),
    roomId: roomId == null ? null : String(roomId),
    location: String(raw.location ?? raw.room?.name ?? roomId ?? "Unassigned"),
    medium: raw.medium == null ? null : String(raw.medium),
    plantedAt: asIso(raw.plantedAt ?? raw.plantedDate),
    expectedHarvestAt: asIso(raw.expectedHarvestAt ?? raw.expectedHarvestDate),
    cameraId: raw.cameraId == null ? null : String(raw.cameraId),
    healthStatus: healthStatus == null ? null : String(healthStatus),
    isActive: typeof raw.isActive === "boolean" ? raw.isActive : null,
    notes: raw.notes == null ? "" : String(raw.notes),
  };
}

export function normalizePlantsResponse(payload) {
  const data = unwrapPayloadData(payload) ?? {};
  const rawPlants = Array.isArray(data) ? data : Array.isArray(data.plants) ? data.plants : [];
  return {
    plants: rawPlants.map(normalizePlant).filter((plant) => plant?.id),
    pagination: !Array.isArray(data) && data.pagination && typeof data.pagination === "object" ? data.pagination : null,
  };
}

function readingIdentity(reading) {
  const data = reading?.data && typeof reading.data === "object" ? reading.data : {};
  return [
    data.metric,
    data.type,
    data.sensorType,
    data.name,
    data.label,
    data.key,
    reading?.metric,
    reading?.type,
    reading?.sensorType,
    reading?.name,
    reading?.sensorId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function metricForIdentity(identity) {
  if (/\b(vpd|vapor pressure deficit)\b/.test(identity)) return "vpdKpa";
  if (/\b(co2|carbon dioxide)\b/.test(identity)) return "co2Ppm";
  if (/(soil|substrate|media).*moist|moist.*(soil|substrate|media)/.test(identity)) return "soilMoisturePct";
  if (/\b(ppfd|par)\b/.test(identity)) return "ppfd";
  if (/\b(electrical conductivity|ec)\b/.test(identity)) return "ec";
  if (/\bph\b/.test(identity)) return "ph";
  if (/\b(humidity|relative humidity|rh)\b/.test(identity)) return "humidityPct";
  if (/\b(temperature|temp)\b/.test(identity)) return "temperatureF";
  if (/\b(dew point|dewpoint)\b/.test(identity)) return "dewPointF";
  return null;
}

function explicitUnit(reading) {
  const data = reading?.data && typeof reading.data === "object" ? reading.data : {};
  return String(data.unit ?? data.units ?? reading?.unit ?? "").trim().toLowerCase();
}

function normalizeMetricValue(metric, value, reading) {
  const number = asNumber(value);
  if (number === null) return null;
  if (metric === "temperatureF" || metric === "dewPointF") {
    const unit = explicitUnit(reading);
    if (unit === "c" || unit === "°c" || unit.includes("celsius")) return number * 9 / 5 + 32;
  }
  return number;
}

function readingPlantId(reading) {
  const data = reading?.data && typeof reading.data === "object" ? reading.data : {};
  return reading?.plantId ?? data.plantId ?? data.plant_id ?? null;
}

function latestTimestamp(readings, fallback) {
  let latest = null;
  for (const reading of readings) {
    const raw = reading?.timestamp ?? reading?.updatedAt ?? reading?.createdAt;
    if (!raw) continue;
    const time = new Date(raw).getTime();
    if (Number.isNaN(time)) continue;
    if (!latest || time > latest.time) latest = { time, iso: new Date(time).toISOString() };
  }
  return latest?.iso ?? asIso(fallback);
}

function directEnvironment(env) {
  if (!env || typeof env !== "object") return null;
  const mapped = {
    temperatureF: asNumber(env.temperatureF),
    humidityPct: asNumber(env.humidityPct ?? env.humidity),
    vpdKpa: asNumber(env.vpdKpa ?? env.vpd),
    co2Ppm: asNumber(env.co2Ppm ?? env.co2),
    soilMoisturePct: asNumber(env.soilMoisturePct ?? env.soilMoisture),
    ec: asNumber(env.ec),
    ph: asNumber(env.ph),
    ppfd: asNumber(env.ppfd),
    dewPointF: asNumber(env.dewPointF),
    updatedAt: asIso(env.updatedAt ?? env.timestamp),
  };
  return Object.values(mapped).some((value) => value !== null) ? mapped : null;
}

export function normalizeEnvironmentResponse(payload, { plantId } = {}) {
  const data = unwrapPayloadData(payload) ?? {};
  const allReadings = Array.isArray(data.readings) ? data.readings : Array.isArray(data) ? data : [];
  const declaredPlantId = data.environment?.plantId ?? data.plantId ?? null;

  let readings = allReadings;
  if (plantId) {
    const associated = allReadings.filter((reading) => String(readingPlantId(reading) ?? "") === String(plantId));
    if (associated.length > 0) {
      readings = associated;
    } else if (declaredPlantId && String(declaredPlantId) === String(plantId)) {
      readings = allReadings;
    } else {
      return null;
    }
  }

  const result = {
    temperatureF: null,
    humidityPct: null,
    vpdKpa: null,
    co2Ppm: null,
    soilMoisturePct: null,
    ec: null,
    ph: null,
    ppfd: null,
    dewPointF: null,
    updatedAt: latestTimestamp(readings, data.environment?.timestamp ?? data.updatedAt),
  };

  for (const reading of readings) {
    const metric = metricForIdentity(readingIdentity(reading));
    if (!metric || result[metric] !== null) continue;
    const value = normalizeMetricValue(metric, reading?.value ?? reading?.data?.value, reading);
    if (value !== null) result[metric] = value;
  }

  const direct = directEnvironment(data.environment);
  if (direct) {
    for (const key of Object.keys(result)) {
      if (result[key] === null && direct[key] !== null) result[key] = direct[key];
    }
  }

  const hasMetric = Object.entries(result).some(([key, value]) => key !== "updatedAt" && value !== null);
  return hasMetric || result.updatedAt ? result : null;
}
