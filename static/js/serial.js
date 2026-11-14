// Web Serial bridge for a live pulse sensor (e.g. ESP32 + MAX30102), Chrome/Edge over HTTPS.
// Accepts newline-delimited JSON {"hr":72,"spo2":98} or "HR:72,SPO2:98".
export async function connectSerial(onData) {
  if (!("serial" in navigator)) throw new Error("Web Serial needs Chrome or Edge on desktop.");
  const port = await navigator.serial.requestPort();
  await port.open({ baudRate: 115200 });
  const dec = new TextDecoderStream();
  port.readable.pipeTo(dec.writable);
  const reader = dec.readable.getReader();
  let buf = "";
  (async () => {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let v = null;
        try { const j = JSON.parse(line); v = { hr: +j.hr || +j.HR, spo2: +j.spo2 || +j.SPO2 }; }
        catch { const hr = /HR[:=]\s*([\d.]+)/i.exec(line), sp = /SPO2[:=]\s*([\d.]+)/i.exec(line); v = { hr: hr ? +hr[1] : undefined, spo2: sp ? +sp[1] : undefined }; }
        if (v && (v.hr || v.spo2)) onData(v);
      }
    }
  })();
  return port;
}
