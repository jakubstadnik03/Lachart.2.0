# API Call Monitoring

Systém pro monitoring a analýzu API volání v aplikaci.

## Aktivace

Monitoring je automaticky aktivní v development módu. V production můžete aktivovat pomocí:

```javascript
// V konzoli prohlížeče
window.__apiStats.enable()
```

## Použití

### Zobrazení statistik

```javascript
// Zobrazit statistiky v konzoli
window.__apiStats.printStats()
```

### Získat statistiky jako objekt

```javascript
const stats = window.__apiStats.getStats()
console.log(stats)
```

### Vymazat statistiky

```javascript
window.__apiStats.clearStats()
```

### Deaktivovat monitoring

```javascript
window.__apiStats.disable()
```

## Co se sleduje

- **Počet volání** každého endpointu
- **Průměrná doba odpovědi** pro každý endpoint
- **Celková doba** všech volání
- **Čas posledního volání**
- **Historie posledních 10 volání** pro každý endpoint
- **Rozlišení mezi cached a non-cached** voláními

## Formát výstupu

Statistiky obsahují:
- `totalCalls` - celkový počet API volání
- `uniqueEndpoints` - počet unikátních endpointů
- `uptime` - doba běhu monitoringu
- `endpoints` - objekt s detaily pro každý endpoint:
  - `count` - počet volání
  - `avgTime` - průměrná doba odpovědi (ms)
  - `totalTime` - celková doba (ms)
  - `lastCall` - čas posledního volání
  - `method` - HTTP metoda
  - `url` - URL endpointu
  - `recentCalls` - posledních 10 volání s timestampem a dobou trvání

## Console logging

Všechna API volání jsou automaticky logována do konzole s:
- Barevným kódováním (modrá = normální, šedá = cached)
- HTTP metodou a URL
- Dobou trvání v milisekundách
- Označením "(CACHED)" pro cached volání

## Příklad výstupu

```
📊 API Call Statistics
Total calls: 45
Unique endpoints: 12
Uptime: 120s
Endpoints:
  GET /api/user/profile - Called 5x, Avg: 120ms, Last: 14:30:25
  GET /api/training - Called 8x, Avg: 85ms, Last: 14:30:20
  POST /api/integrations/strava/auto-sync - Called 2x, Avg: 2500ms, Last: 14:29:15
```
