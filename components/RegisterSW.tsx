"use client";
import { useEffect } from "react";

/** Registers the minimal service worker so the app can be installed to a phone's home screen. Skipped on localhost. */
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.hostname !== "localhost") navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
