// Sprachaufnahmen: Aufnehmen über MediaRecorder, Messaufnahmen dauerhaft in IndexedDB.
// Aufnahmen bleiben auf dem Gerät und sind nicht Teil der JSON-Sicherung (zu groß, und Audio gehört nicht in Exporte).
const DB = 'klartext-aufnahmen';
const STORE = 'aufnahmen';

export const recordingSupported = () =>
  typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia && 'indexedDB' in window;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req?.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  } finally { db.close(); }
}

const key = week => `woche-${week}`;
export const saveRecording = (week, rec) => tx('readwrite', s => s.put(rec, key(week)));
export const loadRecording = week => tx('readonly', s => s.get(key(week)));
export const deleteRecording = week => tx('readwrite', s => s.delete(key(week)));
export const recordedWeeks = () => tx('readonly', s => s.getAllKeys()).then(keys => (keys || []).map(k => Number(String(k).replace('woche-', ''))).filter(Number.isInteger));

// Startet eine Aufnahme. Rückgabe: { stop(): Promise<{ blob, type, seconds }> , cancel() }
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const chunks = [];
  const started = Date.now();
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  mr.start();
  const release = () => stream.getTracks().forEach(t => t.stop());
  return {
    startedAt: started,
    stop: () => new Promise(resolve => {
      mr.onstop = () => {
        release();
        const blob = new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' });
        resolve({ blob, type: blob.type, seconds: Math.round((Date.now() - started) / 1000) });
      };
      mr.stop();
    }),
    cancel: () => { try { mr.stop(); } catch {} release(); },
  };
}
