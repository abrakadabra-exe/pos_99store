import { useEffect, useState } from "react";

const STORE = { receipt: null, label: null };
const listeners = new Set();
const KEY = (kind) => "printer:" + kind;

function emit() {
  listeners.forEach((fn) => fn());
}

export function getConnection(kind) {
  return STORE[kind];
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePrinter(kind) {
  const [conn, setConn] = useState(getConnection(kind));
  useEffect(() => subscribe(() => setConn(getConnection(kind))), [kind]);
  return conn;
}

async function openDevice(device) {
  await device.open();
  await device.selectConfiguration(device.configuration.configurationValue);
  const iface =
    device.configuration.interfaces.find((i) => i.endpoints.some((e) => e.direction === "out")) ||
    device.configuration.interfaces[0];
  await device.claimInterface(iface.interfaceNumber);
  const out = iface.endpoints.find((e) => e.direction === "out");
  if (!out) throw new Error("This device has no output endpoint");
  return { device, out: out.endpointNumber, name: device.productName || "USB printer" };
}

export async function connectPrinter(kind) {
  if (typeof navigator === "undefined" || !navigator.usb) {
    throw new Error("WebUSB is not supported in this browser — use Chrome or Edge on the shop computer");
  }
  const device = await navigator.usb.requestDevice({ filters: [] });
  const conn = await openDevice(device);
  STORE[kind] = conn;
  try {
    localStorage.setItem(KEY(kind), String(device.productId));
  } catch {
    /* private mode */
  }
  emit();
  return conn;
}

export async function disconnectPrinter(kind) {
  const conn = STORE[kind];
  if (conn) {
    try {
      await conn.device.close();
    } catch {
      /* already closed */
    }
  }
  STORE[kind] = null;
  try {
    localStorage.removeItem(KEY(kind));
  } catch {
    /* ignore */
  }
  emit();
}

export async function sendToPrinter(kind, base64) {
  const conn = STORE[kind];
  if (!conn) throw new Error("Printer is not connected");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  await conn.device.transferOut(conn.out, bytes);
}

export async function initPrinters() {
  if (typeof navigator === "undefined" || !navigator.usb) return;
  try {
    const devices = await navigator.usb.getDevices();
    for (const kind of ["receipt", "label"]) {
      let serial;
      try {
        serial = localStorage.getItem(KEY(kind));
      } catch {
        serial = null;
      }
      if (!serial) continue;
      const device = devices.find((d) => String(d.productId) === serial);
      if (!device || STORE[kind]) continue;
      try {
        STORE[kind] = await openDevice(device);
      } catch {
        /* device busy or gone — leave disconnected */
      }
    }
    emit();
  } catch {
    /* no permission yet — fine */
  }
}