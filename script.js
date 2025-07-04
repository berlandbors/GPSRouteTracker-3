let map;
let segments = [];
let currentSegment = [];
let routeLines = [];
let liveMarker = null;
let startMarker = null;
let finishMarker = null;
let tracking = false;
let watchId = null;
let startTime = null;
let timerInterval = null;
let smoothingBuffer = [];
let elevationChart = null;
let chartInitialized = false;

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
    err => alert("⚠ Включите GPS: " + err.message),
    { enableHighAccuracy: true }
  );
}

function smoothCoords(lat, lon) {
  smoothingBuffer.push({ lat, lon });
  if (smoothingBuffer.length > 3) smoothingBuffer.shift();
  const avgLat = smoothingBuffer.reduce((sum, p) => sum + p.lat, 0) / smoothingBuffer.length;
  const avgLon = smoothingBuffer.reduce((sum, p) => sum + p.lon, 0) / smoothingBuffer.length;
  return { lat: avgLat, lon: avgLon };
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
  currentSegment = [];
  segments.push(currentSegment);
  const status = createStatusElement("⏳ Ожидание GPS...");

  watchId = navigator.geolocation.watchPosition(pos => {
    const { latitude, longitude, accuracy, altitude, speed } = pos.coords;
    if (accuracy > 15) {
      status.textContent = `⚠️ Точность плохая (${accuracy.toFixed(1)} м), ждём...`;
      return;
    }
    status.remove();
    const coords = smoothCoords(latitude, longitude);
    const now = new Date();
    const point = {
      lat: coords.lat,
      lon: coords.lon,
      alt: altitude ?? null,
      time: now.toTimeString().split(' ')[0],
      speed: speed ?? null,
      motion: speed == null ? "unknown" : (speed < 2 ? "walk" : "vehicle")
    };
    if (currentSegment.length === 0) {
      map.setView([coords.lat, coords.lon], 16);
      markStart(coords);
    }
    if (shouldAddPoint(coords)) {
      currentSegment.push(point);
      updateMap();
    }
    updateLiveMarker(coords, point);
    map.panTo([coords.lat, coords.lon]);
    updateMotionDisplay(point.motion);
    document.getElementById("currentAlt").textContent = point.alt !== null ? `Высота: ${Math.round(point.alt)} м` : "Высота: —";
  }, err => {
    status.remove();
    alert("Ошибка GPS: " + err.message);
  }, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
  });
}

function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

function updateLiveMarker(coords, point) {
  const latlng = [coords.lat, coords.lon];
  const popupText = `📍 Вы здесь<br>Высота: ${point?.alt !== null ? Math.round(point.alt) + ' м' : '—'}`;
  if (!liveMarker) {
    liveMarker = L.circleMarker(latlng, {
      radius: 8,
      color: "red",
      fillColor: "#f03",
      fillOpacity: 0.8
    }).addTo(map).bindPopup(popupText).openPopup();
  } else {
    liveMarker.setLatLng(latlng).setPopupContent(popupText);
  }
}

function updateMotionDisplay(motion) {
  const icon = motion === "walk" ? "🚶" : motion === "vehicle" ? "🚗" : "❓";
  document.getElementById("motionType").textContent = `Режим: ${icon}`;
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

function shouldAddPoint(coords) {
  if (currentSegment.length === 0) return true;
  const last = currentSegment[currentSegment.length - 1];
  return haversine(last, coords) >= 0.003;
}

function updateMap() {
  routeLines.forEach(line => map.removeLayer(line));
  routeLines = [];
  segments.forEach((segment, i) => {
    const latlngs = segment.map(p => [p.lat, p.lon]);
    const color = `hsl(${i * 60 % 360}, 80%, 50%)`;
    const poly = L.polyline(latlngs, { color }).addTo(map);
    routeLines.push(poly);
  });
  const totalPoints = segments.reduce((sum, s) => sum + s.length, 0);
  document.getElementById("pointsCount").textContent = `Точек: ${totalPoints}`;
  document.getElementById("distance").textContent = `Дистанция: ${totalDistance().toFixed(2)} км`;
}

function markStart(coords) {
  if (startMarker) map.removeLayer(startMarker);
  startMarker = L.marker([coords.lat, coords.lon], {
    title: "Старт",
    icon: L.divIcon({ className: 'start-icon', html: "🟢", iconSize: [20, 20] })
  }).addTo(map).bindPopup("🚩 Старт");
}

function markFinish() {
  if (segments.length === 0) return;
  const lastSeg = segments[segments.length - 1];
  if (lastSeg.length === 0) return;
  const last = lastSeg[lastSeg.length - 1];
  if (finishMarker) map.removeLayer(finishMarker);
  finishMarker = L.marker([last.lat, last.lon], {
    title: "Финиш",
    icon: L.divIcon({ className: 'finish-icon', html: "🔴", iconSize: [20, 20] })
  }).addTo(map).bindPopup("🏁 Финиш");
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
  segments.forEach(segment => {
    for (let i = 0; i < segment.length - 1; i++) {
      dist += haversine(segment[i], segment[i + 1]);
    }
  });
  return dist;
}

function fetchElevations() {
  const allPoints = segments.flat();
  const locations = allPoints.map(p => ({ latitude: p.lat, longitude: p.lon }));

  fetch("https://api.open-elevation.com/api/v1/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locations })
  })
  .then(res => res.json())
  .then(data => {
    data.results.forEach((e, i) => {
      segments.flat()[i].alt = e.elevation;
    });
    alert(`Высота обновлена для ${data.results.length} точек.`);
    drawElevationChart();
  })
  .catch(err => {
    console.error(err);
    alert("Ошибка получения высот.");
  });
}

function drawElevationChart() {
  const allPoints = segments.flat().filter(p => p.alt !== null);
  if (allPoints.length === 0) {
    alert("Нет данных о высоте.");
    return;
  }

  const labels = allPoints.map((_, i) => `Точка ${i + 1}`);
  const altitudes = allPoints.map(p => Math.round(p.alt));

  const data = {
    labels,
    datasets: [{
      label: 'Высота (м)',
      data: altitudes,
      fill: false,
      borderColor: 'green',
      tension: 0.3,
      pointRadius: 2,
    }]
  };

  const config = {
    type: 'line',
    data,
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { title: { display: true, text: 'Маршрут (точки)' } },
        y: { title: { display: true, text: 'Высота, м' } }
      }
    }
  };

  if (chartInitialized && elevationChart) elevationChart.destroy();
  elevationChart = new Chart(document.getElementById('elevationChart'), config);
  chartInitialized = true;
}

function createStatusElement(text) {
  const div = document.createElement("div");
  div.id = "gps-status";
  div.textContent = text;
  document.body.appendChild(div);
  return div;
}