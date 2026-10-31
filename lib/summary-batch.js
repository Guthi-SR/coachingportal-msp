/**
 * Sammelauswertung: wiederverwendbare, sequentielle Auftragssteuerung.
 * Noch nicht an die Oberfläche oder KI angebunden. Keine Daten werden verändert.
 */
export async function runSummaryBatch({referees, from, to, process, onProgress = () => {}, signal}) {
  if (!Array.isArray(referees) || typeof process !== "function") throw new TypeError("Ungültiger Sammelauftrag");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to)
    throw new RangeError("Ungültiger Zeitraum");
  const unique = [...new Map(referees.filter(r => r?.id).map(r => [String(r.id), r])).values()];
  const results = [];
  for (const referee of unique) {
    if (signal?.aborted) { results.push({id: referee.id, status: "abgebrochen"}); break; }
    onProgress({completed: results.length, total: unique.length, current: referee.id});
    try {
      const result = await process({referee, from, to, signal});
      results.push({id: referee.id, status: result?.status || "fertig", result});
    } catch (error) {
      results.push({id: referee.id, status: "fehler", message: error?.message || String(error)});
    }
    onProgress({completed: results.length, total: unique.length, current: null});
  }
  return results;
}
