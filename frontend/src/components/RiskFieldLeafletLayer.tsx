import { useEffect, useRef } from "react";
import L, { type ImageOverlay } from "leaflet";
import { useMap, useMapEvents } from "react-leaflet";
import type { EnterpriseMapMarker } from "../api/types";
import { createRiskFieldDataUrl, normalizeMapBounds, type RiskFieldBounds } from "../lib/riskField";

interface Props {
  markers: EnterpriseMapMarker[];
  visible: boolean;
  opacity: number;
  radiusKm: number;
}

function leafletBoundsToRiskBounds(bounds: L.LatLngBounds): RiskFieldBounds {
  return {
    north: bounds.getNorth(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    west: bounds.getWest(),
  };
}

export default function RiskFieldLeafletLayer({ markers, visible, opacity, radiusKm }: Props) {
  const map = useMap();
  const overlayRef = useRef<ImageOverlay | null>(null);
  const debounceRef = useRef<number | null>(null);

  function clearOverlay() {
    if (overlayRef.current) {
      overlayRef.current.remove();
      overlayRef.current = null;
    }
  }

  function redraw() {
    if (!visible) {
      clearOverlay();
      return;
    }

    const leafletBounds = map.getBounds();
    const riskBounds = normalizeMapBounds(leafletBoundsToRiskBounds(leafletBounds));
    if (!riskBounds) return;

    const dataUrl = createRiskFieldDataUrl(markers, riskBounds, {
      opacity,
      radiusKm,
    });

    clearOverlay();
    if (!dataUrl) return;

    overlayRef.current = L.imageOverlay(dataUrl, leafletBounds, {
      opacity: 1,
      interactive: false,
      zIndex: 250,
    }).addTo(map);
  }

  function scheduleRedraw() {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(redraw, 180);
  }

  useMapEvents({
    moveend: scheduleRedraw,
    zoomend: scheduleRedraw,
  });

  useEffect(() => {
    scheduleRedraw();
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      clearOverlay();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, visible, opacity, radiusKm]);

  return null;
}
