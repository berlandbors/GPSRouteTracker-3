let map;
let route = [];
let routeLine = null;
let liveMarker = null;
let startMarker = null;
let finishMarker = null;
let tracking = false;
let watchId = null;

let startTime = null;
let timerInterval = null;

window.onload = () => {
  map = L.map('map').setView([31.7683, 35.2137], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  checkGPSAccess();
  loadSavedRoute();
};

function checkGPSAccess() {
  if (!navigator.geolocation) {
    alert("Геолокация не поддерживается.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    () => console.log("✅ Геолокация доступна"),
    err => {
      alert("⚠ Включите GPS: " + err.message);
    },
    { enableHighAccuracy: true }
  );
}

function toggleTracking() {
  tracking = !tracking;
  document.getElementById("startBtn").textContent = tracking ? "⏸ Стоп" : "▶️ Старт";

  if (tracking) {
    startTime = new Date();
    startTimer();
    startTracking();
  } else {
    stopTracking();
    stopTimer();
    markFinish();
  }
}

function startTracking() {
  const status = createStatusElement("⏳ Ожидание GPS...");

  watchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude, longitude, accuracy } = pos.coords;
      if (accuracy > 25) {
        status.textContent = `🔄 Точность: ${accuracy.toFixed(1)} м...`;
        return;
      }

      status.remove();

      const coords = { lat: latitude, lon: longitude };

      if (route.length === 0) {
        map.setView([coords.lat, coords.lon], 16);
        markStart(coords);
      }

      if (shouldAddPoint(coords)) {
        route.push(coords);
        updateMap();
      }

      updateLiveMarker(coords);
      map.panTo([coords.lat, coords.lon]);
    },
    err => {
      status.remove();
      alert("Ошибка GPS: " + err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 10000
    }
  );
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function startTimer() {
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
}

function updateTimer() {
  const now = new Date();
  const elapsed = new Date(now - startTime);
  const hours = String(elapsed.getUTCHours()).padStart(2, '0');
  const mins = String(elapsed.getUTCMinutes()).padStart(2, '0');
  const secs = String(elapsed.getUTCSeconds()).padStart(2, '0');
  document.getElementById("timer").textContent = `Время движения: ${hours}:${mins}:${secs}`;
}

function updateLiveMarker(coords) {
  const latlng = [coords.lat, coords.lon];
  if (!liveMarker) {
    liveMarker = L.circleMarker(latlng, {
      radius: 8,
      color: "red",
      fillColor: "#f03",
      fillOpacity: 0.8
    }).addTo(map).bindPopup("📍 Вы здесь").openPopup();
  } else {
    liveMarker.setLatLng(latlng);
  }
}

function markStart(coords) {
  if (startMarker) map.removeLayer(startMarker);
  startMarker = L.marker([coords.lat, coords.lon], {
    title: "Старт",
    icon: L.divIcon({ className: 'start-icon', html: "🟢", iconSize: [20, 20] })
  }).addTo(map).bindPopup("🚩 Старт");
}

function markFinish() {
  if (route.length === 0) return;
  const last = route[route.length - 1];

  if (finishMarker) map.removeLayer(finishMarker);
  finishMarker = L.marker([last.lat, last.lon], {
    title: "Финиш",
    icon: L.divIcon({ className: 'finish-icon', html: "🔴", iconSize: [20, 20] })
  }).addTo(map).bindPopup("🏁 Финиш");
}

function shouldAddPoint(coords) {
  if (route.length === 0) return true;
  const last = route[route.length - 1];
  return haversine(last, coords) >= 0.01;
}

function updateMap() {
  const latlngs = route.map(p => [p.lat, p.lon]);

  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(latlngs, { color: 'blue' }).addTo(map);

  document.getElementById("pointsCount").textContent = `Точек: ${route.length}`;
  document.getElementById("distance").textContent = `Дистанция: ${totalDistance().toFixed(2)} км`;
}

function haversine(p1, p2) {
  const R = 6371;
  const dLat = toRad(p2.lat - p1.lat);
  const dLon = toRad(p2.lon - p1.lon);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(p1.lat)) * Math.cos(toRad(p2.lat)) *
            Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

function totalDistance() {
  let dist = 0;
  for (let i = 0; i < route.length - 1; i++) {
    dist += haversine(route[i], route[i + 1]);
  }
  return dist;
}

function saveRoute() {
  const now = new Date();
  const duration = startTime ? {
    hours: new Date(now - startTime).getUTCHours(),
    minutes: new Date(now - startTime).getUTCMinutes(),
    seconds: new Date(now - startTime).getUTCSeconds(),
    formatted: `${String(new Date(now - startTime).getUTCHours()).padStart(2, '0')}:${String(new Date(now - startTime).getUTCMinutes()).padStart(2, '0')}:${String(new Date(now - startTime).getUTCSeconds()).padStart(2, '0')}`
  } : null;

  const data = {
    name: `Маршрут от ${now.toLocaleString()}`,
    distance: totalDistance(),
    points: route,
    duration: duration
  };
  localStorage.setItem("lastRoute", JSON.stringify(data));
  alert("Маршрут сохранён!");
}

function loadSavedRoute() {
  const data = localStorage.getItem("lastRoute");
  if (!data) return;

  try {
    const parsed = JSON.parse(data);
    route = parsed.points;
    updateMap();
    if (route.length > 0) {
      markStart(route[0]);
      markFinish(route[route.length - 1]);
    }

    if (parsed.duration?.formatted) {
      document.getElementById("timer").textContent = `Время движения: ${parsed.duration.formatted}`;
    }
  } catch (e) {
    console.warn("Ошибка загрузки маршрута.");
  }
}

function exportRoute() {
  if (route.length === 0) return alert("Маршрут пуст.");

  const now = new Date();
  const duration = startTime ? {
    hours: new Date(now - startTime).getUTCHours(),
    minutes: new Date(now - startTime).getUTCMinutes(),
    seconds: new Date(now - startTime).getUTCSeconds(),
    formatted: `${String(new Date(now - startTime).getUTCHours()).padStart(2, '0')}:${String(new Date(now - startTime).getUTCMinutes()).padStart(2, '0')}:${String(new Date(now - startTime).getUTCSeconds()).padStart(2, '0')}`
  } : null;

  const data = {
    name: `Маршрут от ${now.toLocaleString()}`,
    distance: totalDistance(),
    points: route,
    duration: duration
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "route.json";
  a.click();
}

function importRoute() {
  const file = document.getElementById("importFile").files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      route = data.points || [];
      updateMap();
      if (route.length > 0) {
        markStart(route[0]);
        markFinish(route[route.length - 1]);
      }

      if (data.duration?.formatted) {
        document.getElementById("timer").textContent = `Время движения: ${data.duration.formatted}`;
      }
    } catch (err) {
      alert("Ошибка чтения JSON.");
    }
  };
  reader.readAsText(file);
}

function clearRoute() {
  stopTracking();
  stopTimer();
  route = [];

  if (routeLine) map.removeLayer(routeLine);
  if (liveMarker) map.removeLayer(liveMarker);
  if (startMarker) map.removeLayer(startMarker);
  if (finishMarker) map.removeLayer(finishMarker);

  routeLine = null;
  liveMarker = null;
  startMarker = null;
  finishMarker = null;

  document.getElementById("distance").textContent = "Дистанция: —";
  document.getElementById("pointsCount").textContent = "Точек: 0";
  document.getElementById("timer").textContent = "Время движения: 00:00:00";
}

function createStatusElement(text) {
  const div = document.createElement("div");
  div.id = "gps-status";
  div.textContent = text;
  document.body.appendChild(div);
  return div;
}