// --- KONFIGURATION ---
// !! WICHTIG: Ersetze dies mit der URL deiner bereitgestellten Google Apps Script Web App !!
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwAuve4n3GLZm4id7GSaDn2AupWonTvKaHL-3bA3bb0JgB90CdVlVfl5Vu0kIVzXfa4/exec';

// !! WICHTIG: Diese Bezeichner MÜSSEN mit den Schlüsseln in SURVEY_CONFIG im Apps Script übereinstimmen !!
const SURVEYS_TO_LOAD = [
    { id: "umfrage1", canvasId: "resultsChart1", containerId: "chartContainer1", titleId: "chartTitle1", titlePrefix: "Umfrage 1: " },
    { id: "umfrage2", canvasId: "resultsChart2", containerId: "chartContainer2", titleId: "chartTitle2", titlePrefix: "Umfrage 2: " }
    // Füge hier weitere Objekte hinzu, wenn du mehr Umfragen in SURVEY_CONFIG definiert hast
    // { id: "feedback_runde_3", canvasId: "resultsChart3", containerId: "chartContainer3", titleId: "chartTitle3", titlePrefix: "Feedback Runde 3: " }
];

const UPDATE_INTERVAL = 60000; // Alle 60 Sekunden
// --- ENDE KONFIGURATION ---

const lastUpdatedSpan = document.getElementById('last-updated');
let chartInstances = {}; // Objekt zum Speichern der Chart.js Instanzen

// Funktion zum Abrufen der Daten und Aktualisieren EINES Diagramms
async function fetchDataAndUpdateChart(surveyConfig) {
    const { id: surveyId, canvasId, containerId, titleId, titlePrefix } = surveyConfig;
    console.log(`Fetching data for survey: ${surveyId}`);

    const containerElement = document.getElementById(containerId);
    const errorElement = document.getElementById(`error${containerId.match(/\d+/)[0]}`); // z.B. error1
    const canvasElement = document.getElementById(canvasId);
    const titleElement = document.getElementById(titleId);

    if (!containerElement || !errorElement || !canvasElement) {
        console.error(`HTML elements not found for survey ${surveyId}. Check IDs.`);
        return; // Abbruch, wenn Elemente fehlen
    }

    // Status: Laden
    containerElement.classList.remove('is-loaded', 'has-error');
    containerElement.classList.add('is-loading');
    errorElement.classList.add('d-none'); // Sicherstellen, dass alter Fehler weg ist

    try {
        // Korrekte URL mit Survey-Parameter erstellen
        const fetchUrl = `${SCRIPT_URL}?survey=${surveyId}`;
        const response = await fetch(fetchUrl);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} for ${surveyId}`);
        }
        const data = await response.json();
        console.log(`Data received for ${surveyId}:`, data);

        if (data.error) {
            throw new Error(`Script error for ${surveyId}: ${data.error}`);
        }
        if (!data.labels || !data.data || data.surveyId !== surveyId) {
            throw new Error(`Received invalid or mismatched data format for ${surveyId}.`);
        }

        // Titel aktualisieren (optional, falls Daten leer sind)
        if (titleElement) {
           titleElement.textContent = titlePrefix + (data.labels.length > 0 ? "Ergebnisse" : "Noch keine Daten");
        }

        // Diagramm aktualisieren oder neu erstellen
        updateChart(surveyId, canvasId, data.labels, data.data);

        // Status: Geladen
        containerElement.classList.remove('is-loading', 'has-error');
        containerElement.classList.add('is-loaded');
        lastUpdatedSpan.textContent = new Date().toLocaleTimeString(); // Zeit global aktualisieren

    } catch (error) {
        console.error(`Error fetching or processing data for ${surveyId}:`, error);
        // Status: Fehler
        containerElement.classList.remove('is-loading', 'is-loaded');
        containerElement.classList.add('has-error');
        errorElement.textContent = `Fehler (${surveyId}): ${error.message}`;
        // errorElement.classList.remove('d-none'); // Wird durch has-error Klasse gesteuert
         if (titleElement) titleElement.textContent = titlePrefix + "Fehler";
         // Optional: Alte Chart-Instanz zerstören bei Fehler?
         // if (chartInstances[surveyId]) {
         //    chartInstances[surveyId].destroy();
         //    delete chartInstances[surveyId];
         // }
    }
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
