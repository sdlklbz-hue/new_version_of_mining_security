import { useEffect } from "react";
import { CircleMarker, Popup, useMap } from "react-leaflet";
import type { EmergencyFacility } from "../api/types";
import { EMERGENCY_FACILITY_COLORS, EMERGENCY_FACILITY_SHORT_LABELS } from "../lib/emergencyFacilities";

const FACILITY_PANE = "emergency-facilities-pane";

interface Props {
  facilities: EmergencyFacility[];
}

export default function EmergencyFacilitiesLayer({ facilities }: Props) {
  const map = useMap();

  useEffect(() => {
    if (!map.getPane(FACILITY_PANE)) {
      const pane = map.createPane(FACILITY_PANE);
      pane.style.zIndex = "650";
    }
  }, [map]);

  return (
    <>
      {facilities.map((facility) => {
        const color = EMERGENCY_FACILITY_COLORS[facility.type] || "#94a3b8";
        return (
          <CircleMarker
            key={facility.id}
            pane={FACILITY_PANE}
            center={[facility.lat, facility.lng]}
            pathOptions={{
              color: "#ffffff",
              fillColor: color,
              fillOpacity: 0.92,
              weight: 3,
            }}
            radius={11}
          >
            <Popup>
              <div className="enterprise-map-popup">
                <strong>
                  {EMERGENCY_FACILITY_SHORT_LABELS[facility.type] || "设"} {facility.name}
                </strong>
                <span>{facility.type_label}</span>
                {facility.address && <span>{facility.address}</span>}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}
