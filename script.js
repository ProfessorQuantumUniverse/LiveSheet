// --- KONFIGURATION ---
// !! WICHTIG: Ersetze dies mit der URL deiner bereitgestellten Google Apps Script Web App !!
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwAuve4n3GLZm4id7GSaDn2AupWonTvKaHL-3bA3bb0JgB90CdVlVfl5Vu0kIVzXfa4/exec';

// !! WICHTIG: Diese Bezeichner MÜSSEN mit den Schlüsseln in SURVEY_CONFIG im Apps Script übereinstimmen !!
const SURVEYS_TO_LOAD = [
    { id: "umfrage1", canvasId: "resultsChart1", containerId: "chartContainer1", titleId: "chartTitle1", titlePrefix: "Umfrage 1: ", statsId: "stats1", maxSubmits: 34 },
    { id: "umfrage2", canvasId: "resultsChart2", containerId: "chartContainer2", titleId: "chartTitle2", titlePrefix: "Umfrage 2: ", statsId: "stats2", maxSubmits: 34  },
    { id: "umfrage3", canvasId: "resultsChart3", containerId: "chartContainer3", titleId: "chartTitle3", titlePrefix: "Umfrage 3: ", statsId: "stats3", maxSubmits: 34 },
    // Füge hier weitere Objekte hinzu, wenn du mehr Umfragen in SURVEY_CONFIG definiert hast
    // { id: "feedback_runde_3", canvasId: "resultsChart3", containerId: "chartContainer3", titleId: "chartTitle3", titlePrefix: "Feedback Runde 3: " }
];

const UPDATE_INTERVAL = 60000; // Alle 60 Sekunden
// --- ENDE KONFIGURATION ---

const lastUpdatedSpan = document.getElementById('last-updated');
let chartInstances = {}; // Objekt zum Speichern der Chart.js Instanzen

// Funktion zum Abrufen der Daten und Aktualisieren EINES Diagramms
async function fetchDataAndUpdateChart(surveyConfig) {
    const { id: surveyId, canvasId, containerId, titleId, statsId, titlePrefix, maxSubmits } = surveyConfig;
    console.log(`Fetching data for survey: ${surveyId}`);

    const containerElement = document.getElementById(containerId);
    // KORREKTUR: Fehler-Element-ID dynamisch und sicher holen
    const errorElementId = `error${containerId.replace(/[^0-9]/g, '')}`; // Extrahiert die Zahl aus containerId (z.B. "1" aus "chartContainer1")
    const errorElement = document.getElementById(errorElementId);
    const canvasElement = document.getElementById(canvasId);
    const titleElement = document.getElementById(titleId);
    const statsElement = document.getElementById(statsId);

    // Prüfen, ob alle Elemente gefunden wurden (wichtig!)
    if (!containerElement || !errorElement || !canvasElement || !titleElement || !statsElement) { // NEU: statsElement hinzugefügt
        console.error(`HTML elements not found for survey ${surveyId}. Check IDs: containerId=${containerId}, errorElementId=${errorElementId}, canvasId=${canvasId}, titleId=${titleId}, statsId=${statsId}`); // NEU: statsId geloggt
        if (containerElement) containerElement.innerHTML = `<div class="alert alert-danger">Setup Error: Missing HTML elements for ${surveyId}.</div>`;
        return; // Abbruch
    }

    // Status: Laden
    containerElement.classList.remove('is-loaded', 'has-error');
    containerElement.classList.add('is-loading');
    errorElement.classList.add('d-none'); // Sicherstellen, dass alter Fehler weg ist
    errorElement.textContent = ''; // Text zurücksetzen
    statsElement.textContent = 'Gesamt: Lade...';

    try {
        // Korrekte URL mit Survey-Parameter erstellen
        const fetchUrl = `${SCRIPT_URL}?survey=${surveyId}`;
        const response = await fetch(fetchUrl);

        if (!response.ok) {
            // Versuchen, mehr Details aus der Antwort zu bekommen, falls vorhanden
            let responseText = await response.text(); // Antwort als Text lesen
            try { responseText = JSON.parse(responseText).error || responseText; } catch (e) { /* bleibt Text */ }
            throw new Error(`HTTP error! Status: ${response.status} for ${surveyId}. Response: ${responseText}`);
        }

        const data = await response.json();
        console.log(`Data received for ${surveyId}:`, data);

        // Fehler vom Script prüfen
        if (data.error) {
            throw new Error(`Script error for ${surveyId}: ${data.error}`);
        }
        // Datenformat prüfen
        if (!data.labels || !Array.isArray(data.labels) || !data.data || !Array.isArray(data.data) || data.surveyId !== surveyId) {
            console.error("Invalid data format received:", data); // Log das fehlerhafte Format
            throw new Error(`Received invalid or mismatched data format for ${surveyId}.`);
        }

        // -------- Korrekte Position der Logik --------
        // 1. Status: Geladen - Klassen aktualisieren!
        containerElement.classList.remove('is-loading', 'has-error');
        containerElement.classList.add('is-loaded');

        // 2. Titel aktualisieren
        titleElement.textContent = titlePrefix + (data.labels.length > 0 ? "Ergebnisse" : "Noch keine Daten");

        // NEU: 3. Gesamtanzahl und Prozent berechnen und anzeigen
        const totalSubmits = data.data.reduce((sum, value) => sum + (Number(value) || 0), 0);
        const percentage = maxSubmits > 0 ? (totalSubmits / maxSubmits * 100) : 0;
        statsElement.innerHTML = `Es haben erst: <strong>${totalSubmits}</strong> von ${maxSubmits} geantwortet! <span class="text-secondary">( Das sind ${percentage.toFixed(1)}%)</span>`; // Zeigt z.B. "Gesamt: 15 / 34 (44.1%)"

        // 3. Diagramm aktualisieren/erstellen
        updateChart(surveyId, canvasId, data.labels, data.data);

        // 4. Globalen Zeitstempel aktualisieren (nur einmal pro Durchlauf nötig, kann optimiert werden)
        lastUpdatedSpan.textContent = new Date().toLocaleTimeString();
        // -------- Ende der Logik im try-Block --------

    } catch (error) { // <<<<<< DER WIEDERHERGESTELLTE CATCH-BLOCK
        console.error(`Error fetching or processing data for ${surveyId}:`, error);
        // Status: Fehler
        containerElement.classList.remove('is-loading', 'is-loaded');
        containerElement.classList.add('has-error');
        // Detaillierte Fehlermeldung anzeigen
        errorElement.textContent = `Fehler (${surveyId}): ${error.message}`;
        errorElement.classList.remove('d-none'); // Fehlermeldung sichtbar machen
        statsElement.textContent = 'Gesamt: Fehler';
        
        if (titleElement) titleElement.textContent = titlePrefix + "Fehler";

        // Optional: Alte Chart-Instanz zerstören bei Fehler, um Grafikfehler zu vermeiden
        if (chartInstances[surveyId]) {
           try {
             chartInstances[surveyId].destroy();
             console.log(`Chart instance for ${surveyId} destroyed due to error.`);
           } catch (destroyError) {
             console.error(`Error destroying chart instance for ${surveyId}:`, destroyError);
           }
           delete chartInstances[surveyId];
        }
    }
    // Die Funktion endet hier korrekt
}
// Funktion zum Erstellen/Aktualisieren des Chart.js-Diagramms
function updateChart(surveyId, canvasId, labels, data) {
    const canvasElement = document.getElementById(canvasId);
    const ctx = canvasElement.getContext('2d');

    const backgroundColors = generateColors(labels.length);
    const borderColors = backgroundColors.map(color => color.replace('0.6', '1'));

    if (chartInstances[surveyId]) {
        // Diagramm existiert -> nur Daten aktualisieren
        chartInstances[surveyId].data.labels = labels;
        chartInstances[surveyId].data.datasets[0].data = data;
        chartInstances[surveyId].data.datasets[0].backgroundColor = backgroundColors;
        chartInstances[surveyId].data.datasets[0].borderColor = borderColors;
        chartInstances[surveyId].update();
        console.log(`Chart updated for ${surveyId}.`);
    } else {
        // Diagramm neu erstellen
         if (!canvasElement.offsetParent) {
             console.warn(`Canvas for ${surveyId} is not visible, delaying chart creation.`);
             // Optional: Versuch es später nochmal oder warte auf Sichtbarkeit
             return;
         }
        chartInstances[surveyId] = new Chart(ctx, {
            type: 'bar', // Oder 'pie', 'doughnut' etc.
            data: {
                labels: labels,
                datasets: [{
                    label: 'Anzahl Antworten',
                    data: data,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1 } }
                },
                plugins: { legend: { display: false } }
            }
        });
        console.log(`Chart created for ${surveyId}.`);
    }
}

// Hilfsfunktion zum Generieren von Farben (unverändert)
function generateColors(count) {
    const colors = [];
    const baseColors = [
        'rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)',
        'rgba(75, 192, 192, 0.6)', 'rgba(255, 206, 86, 0.6)',
        'rgba(153, 102, 255, 0.6)', 'rgba(255, 159, 64, 0.6)'
    ];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }
    return colors;
}

// --- Initiales Laden & Intervall ---

// Funktion, um alle konfigurierten Umfragen zu laden/aktualisieren
function fetchAllSurveys() {
   SURVEYS_TO_LOAD.forEach(surveyConfig => {
       fetchDataAndUpdateChart(surveyConfig);
   });
}

// Initiales Laden aller definierten Umfragen
fetchAllSurveys();

// Automatisches Aktualisieren aller Umfragen alle X Millisekunden
if (UPDATE_INTERVAL > 0) {
   setInterval(fetchAllSurveys, UPDATE_INTERVAL);
}
