import React from "react";
import { Geographies, Geography } from "react-simple-maps";

const GEO_STYLE = {
  default: { outline: "none" as const },
  hover: { outline: "none" as const },
  pressed: { outline: "none" as const },
};

const GEO_FILL = "#e2e8f0";
const GEO_STROKE = "#cbd5e1";

type AtfxMarketMapGeographiesProps = {
  geography: object;
};

/** Static country shapes — isolated so index hover does not redraw land masses. */
export const AtfxMarketMapGeographies = React.memo(function AtfxMarketMapGeographies({
  geography,
}: AtfxMarketMapGeographiesProps) {
  return (
    <Geographies geography={geography}>
      {({ geographies }) =>
        geographies.map((geo) => (
          <Geography
            key={geo.rsmKey}
            geography={geo}
            fill={GEO_FILL}
            stroke={GEO_STROKE}
            strokeWidth={0.4}
            style={GEO_STYLE}
          />
        ))
      }
    </Geographies>
  );
});
