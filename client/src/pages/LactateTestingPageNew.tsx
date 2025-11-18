// src/pages/LactateTestingPageNew.tsx
import React, { useState } from "react";
import { useTrainerSession } from "../hooks/useTrainerSession";
import { TrainerSample } from "../bluetoothTrainer";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { API_BASE_URL } from "../config/api.config";

function LiveCharts({ samples }: { samples: TrainerSample[] }) {
  return (
    <div style={{ display: "grid", gap: 24, marginTop: 24 }}>
      <div>
        <h3>Výkon (W)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={samples}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="t" 
              label={{ value: 'Čas (s)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis label={{ value: 'W', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="power" 
              stroke="#8884d8" 
              dot={false} 
              connectNulls={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3>Kadence (rpm)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={samples}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="t" 
              label={{ value: 'Čas (s)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis label={{ value: 'rpm', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="cadence" 
              stroke="#82ca9d" 
              dot={false}
              connectNulls={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3>Rychlost (km/h)</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={samples}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="t" 
              label={{ value: 'Čas (s)', position: 'insideBottom', offset: -5 }}
            />
            <YAxis label={{ value: 'km/h', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Line 
              type="monotone" 
              dataKey="speed" 
              stroke="#ffc658" 
              dot={false}
              connectNulls={true}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function LactateTestingPageNew() {
  const {
    isRunning,
    isConnected,
    samples,
    targetPower,
    startSession,
    stopSession,
    changeTargetPower,
  } = useTrainerSession();

  const [localTargetPower, setLocalTargetPower] = useState(200);
  const [saving, setSaving] = useState(false);

  const handleStart = async () => {
    try {
      await startSession();
    } catch (error: any) {
      alert(`Chyba při startu: ${error.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await stopSession();
      // Uložení na backend
      if (samples.length > 0) {
        await saveTest(samples);
      }
    } catch (error: any) {
      alert(`Chyba při zastavení: ${error.message}`);
    }
  };

  const handleApplyTargetPower = async () => {
    try {
      await changeTargetPower(localTargetPower);
    } catch (error: any) {
      alert(`Chyba při nastavení výkonu: ${error.message}`);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1>Lactate Test – Tacx Neo</h1>

      <div style={{ 
        display: "flex", 
        flexWrap: "wrap",
        gap: 16, 
        alignItems: "center",
        marginBottom: 24,
        padding: 16,
        backgroundColor: "#f5f5f5",
        borderRadius: 8
      }}>
        <button 
          onClick={handleStart} 
          disabled={isRunning}
          style={{
            padding: "8px 16px",
            fontSize: 16,
            backgroundColor: isRunning ? "#ccc" : "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: isRunning ? "not-allowed" : "pointer"
          }}
        >
          Start testu
        </button>
        <button 
          onClick={handleStop} 
          disabled={!isRunning}
          style={{
            padding: "8px 16px",
            fontSize: 16,
            backgroundColor: !isRunning ? "#ccc" : "#f44336",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: !isRunning ? "not-allowed" : "pointer"
          }}
        >
          Stop testu
        </button>

        <div style={{ 
          display: "flex", 
          gap: 8, 
          alignItems: "center",
          marginLeft: "auto"
        }}>
          <label>
            Cílový výkon (ERG):
            <input
              type="number"
              value={localTargetPower}
              onChange={(e) => setLocalTargetPower(Number(e.target.value))}
              min={50}
              max={800}
              step={5}
              style={{ marginLeft: 8, width: 80, padding: 4 }}
            />
          </label>
          <button 
            onClick={handleApplyTargetPower} 
            disabled={!isRunning || !isConnected}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              backgroundColor: (!isRunning || !isConnected) ? "#ccc" : "#2196F3",
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: (!isRunning || !isConnected) ? "not-allowed" : "pointer"
            }}
          >
            Nastavit ERG
          </button>
        </div>
      </div>

      <div style={{ 
        padding: 16, 
        backgroundColor: "#e3f2fd", 
        borderRadius: 8,
        marginBottom: 24
      }}>
        <div>Status: {isRunning ? "🟢 Běží" : "⚪ Zastaveno"}</div>
        <div>Připojeno: {isConnected ? "✅ Ano" : "❌ Ne"}</div>
        <div>Aktuální target: {targetPower ?? "-"} W</div>
        <div>Počet vzorků: {samples.length}</div>
        {samples.length > 0 && (
          <div>
            Poslední hodnoty: Power: {samples[samples.length - 1].power ?? "-"}W, 
            Cadence: {samples[samples.length - 1].cadence?.toFixed(0) ?? "-"}rpm, 
            Speed: {samples[samples.length - 1].speed?.toFixed(1) ?? "-"}km/h
          </div>
        )}
      </div>

      <hr style={{ margin: "24px 0" }} />

      {samples.length > 0 ? (
        <LiveCharts samples={samples} />
      ) : (
        <div style={{ textAlign: "center", padding: 48, color: "#999" }}>
          Žádná data. Spusť test pro zobrazení grafů.
        </div>
      )}
    </div>
  );
}

async function saveTest(samples: TrainerSample[]) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/tests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startedAt: new Date().toISOString(),
        samples,
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    console.log("Test uložen, id:", data.id);
    alert(`Test uložen s ID: ${data.id}`);
  } catch (e: any) {
    console.error("Chyba při ukládání testu:", e);
    alert(`Chyba při ukládání testu: ${e.message}`);
  }
}

