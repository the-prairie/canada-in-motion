const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export class AtlasMap {
  constructor(network, geography, callbacks) {
    this.network = network;
    this.callbacks = callbacks;
    this.state = null;
    this.wells = [];
    this.filtered = [];
    this.map = L.map("map", {
      zoomControl: false,
      scrollWheelZoom: false,
      preferCanvas: true,
      minZoom: 2,
      maxZoom: 15,
      zoomSnap: 0.25,
      zoomDelta: 0.75,
      maxBounds: [
        [15, -175],
        [82, -45],
      ],
      maxBoundsViscosity: 0.8,
      attributionControl: true,
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
    }).setView([53, -109], 4);
    L.control.zoom({ position: "bottomright" }).addTo(this.map);
    L.control
      .scale({ position: "bottomleft", imperial: false, maxWidth: 90 })
      .addTo(this.map);
    this.map.attributionControl.addAttribution(
      '<a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a>',
    );
    this.land = L.geoJSON(geography.countries, {
      style: {
        color: "#bac8c4",
        weight: 0.8,
        fillColor: "#f3f2e8",
        fillOpacity: 1,
      },
      interactive: false,
    }).addTo(this.map);
    this.provinces = L.geoJSON(geography.provinces, {
      style: (f) => ({
        color: "#afc1bb",
        weight: 0.75,
        fillColor: f.properties.admin === "Canada" ? "#f3f2e8" : "#e9ede6",
        fillOpacity: 1,
      }),
      onEachFeature: (f, layer) => {
        layer.on("click", () => this.callbacks.onProvince(f.properties));
      },
    }).addTo(this.map);
    this.historicalLayer = L.geoJSON(null, {
      style: {color: "#80639a", weight: 1.5, opacity: 0.8},
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {radius: 4, color: "#80639a", fillColor: "#e9ede6", fillOpacity: 1, weight: 2}),
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        layer.bindTooltip(`${esc(p.name)} · historical ${esc(p.kind)}<br>Source dates ${esc(p.sourceDateMin)} to ${esc(p.sourceDateMax)}<br>Current operating status unknown`, {sticky: true});
      },
    });
    this.bcLayer = L.geoJSON(null, {
      style: {color: "#8e732b", weight: 1.5, opacity: 0.8},
      pointToLayer: (feature, latlng) => L.circleMarker(latlng, {radius: 3, color: "#8e732b", fillColor: "#8e732b", fillOpacity: 0.65, weight: 1}),
      onEachFeature: (feature, layer) => {
        layer.bindTooltip(`${esc(feature.id)}<br>Permit status: ${esc(feature.properties.sourceStatus)}<br>Operating status unknown`, {sticky:true});
        layer.on("click", () => this.callbacks.onBCFeature(feature));
      },
    });
    this.cityLayer = L.layerGroup().addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.facilityLayer = L.layerGroup().addTo(this.map);
    this.wellLayer = L.layerGroup().addTo(this.map);
    this.selectionLayer = L.layerGroup().addTo(this.map);
    this.renderer = L.canvas({ padding: 0.5 });
    this.map.on("moveend", () => {
      this.drawWells();
      this.drawLabels();
      callbacks.onCamera({
        center: [this.map.getCenter().lat, this.map.getCenter().lng],
        zoom: this.map.getZoom(),
      });
    });
    this.map.on("zoomend", () => this.drawLabels());
    new ResizeObserver(() => {
      const container=document.getElementById('map');
      if(!container.clientWidth||!container.clientHeight)return;
      this.map.invalidateSize({pan:false});
      if(this.state?.view==='journey')this.focus();
    }).observe(
      document.getElementById("map"),
    );
  }
  setBCPermits(layer) {
    this.bcLayer.clearLayers();
    this.bcLayer.addData(layer);
  }
  setHistorical(layer) {
    this.historicalLayer.clearLayers();
    this.historicalLayer.addData(layer);
  }
  setRecords(wells) {
    this.wells = wells;
    this.wellById = new Map(wells.map((w) => [w.id, w]));
  }
  update(state, filtered) {
    this.state = state;
    this.filtered = filtered;
    if (state.view!=="journey" && state.layers.bcPermits && !this.map.hasLayer(this.bcLayer)) {
      this.bcLayer.addTo(this.map);
      this.map.attributionControl.addAttribution("BC Energy Regulator · Open Data Licence");
    } else if ((state.view==="journey" || !state.layers.bcPermits) && this.map.hasLayer(this.bcLayer)) {
      this.map.removeLayer(this.bcLayer);
      this.map.attributionControl.removeAttribution("BC Energy Regulator · Open Data Licence");
    }
    if (state.view!=="journey" && state.layers.historical && !this.map.hasLayer(this.historicalLayer)) {
      this.historicalLayer.addTo(this.map);
      this.map.attributionControl.addAttribution('NRCan CanVec · OGL Canada · historical');
    } else if ((state.view==="journey" || !state.layers.historical) && this.map.hasLayer(this.historicalLayer)) {
      this.map.removeLayer(this.historicalLayer);
      this.map.attributionControl.removeAttribution('NRCan CanVec · OGL Canada · historical');
    }
    this.routeLayer.clearLayers();
    this.facilityLayer.clearLayers();
    this.selectionLayer.clearLayers();
    const selected = this.network.routes.find((r) => r.id === state.route);
    const wellMode =
      state.view === "wells" ||
      (state.view === "lab" && state.labTab === "cleanup");
    this.network.routes
      .filter(
        (r) =>
          (!wellMode || state.layers.context) &&
          (state.view==="journey" ? r.id===state.route : state.layers[r.commodity]) &&
          (r.id === state.route ||
            !r.id.startsWith("trans-mountain-") ||
            r.id === "trans-mountain-burnaby"),
      )
      .sort(
        (a, b) =>
          (a.id === state.route ? 1 : 0) - (b.id === state.route ? 1 : 0),
      )
      .forEach((r) => {
        const active =
          r.id === state.route &&
          state.view !== "wells" &&
          !(state.view === "lab" && state.labTab === "cleanup");
        const closed = active && state.view === "lab" && state.scenario.closed;
        const ll = r.coordinates.map((c) => [c[1], c[0]]);
        L.polyline(ll, {
          color: closed
            ? "#a33d3d"
            : active
              ? "#147c78"
              : r.commodity === "oil"
                ? "#8d5b35"
                : "#3179a5",
          weight: active ? 3.5 : 1.5,
          opacity: active ? 1 : 0.55,
          dashArray: closed ? "3 8" : active ? "10 5" : "5 5",
          lineCap: "round",
        })
          .bindTooltip(esc(r.name) + " · schematic route", {
            className: "route-tooltip",
            sticky: true,
          })
          .on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            this.callbacks.onRoute(r.id);
          })
          .addTo(this.routeLayer);
        if (active) {
          [ll[0], ll.at(-1)].forEach((c, i) =>
            L.marker(c, {
              icon: L.divIcon({
                className: "",
                html: `<div class="endpoint ${state.step===(i?2:0)?'endpoint-current':''}"></div>`,
                iconSize: [44, 44],
                iconAnchor: [22, 22],
              }),
              zIndexOffset: 1000,
              title: i ? r.destination : r.origin,
            })
              .bindTooltip(esc((i ? r.destination : r.origin).split(",")[0]), {
                permanent: true,
                direction:
                  this.map.getSize().y < 360 ? "top" : i ? "right" : "top",
                offset:
                  this.map.getSize().y < 360
                    ? [0, -10]
                    : i
                      ? [12, 0]
                      : [0, -10],
                className: "endpoint-label",
              })
              .on("click", () => this.callbacks.onStep(i ? 2 : 0))
              .addTo(this.routeLayer),
          );
        }
      });
    if (state.view!=="journey" && state.layers.facilities && (!wellMode || state.layers.context))
      this.network.facilities.forEach((f) =>
        L.marker([f.coordinates[1], f.coordinates[0]], {
          icon: L.divIcon({
            className: "",
            html: `<div class="facility-icon ${f.type === "lng" ? "lng" : ""}"></div>`,
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          title: f.name,
        })
          .on("click", () => this.callbacks.onFacility(f))
          .bindTooltip(esc(f.name), { className: "route-tooltip" })
          .addTo(this.facilityLayer),
      );
    const recordKey = filtered.map((w) => w.id).join("|");
    if (recordKey !== this.recordKey) {
      this.recordKey = recordKey;
      this.index = new Supercluster({
        radius: 110,
        maxZoom: 12,
        minPoints: 3,
        map: (p) => ({ orphan: p.orphan ? 1 : 0 }),
        reduce: (acc, p) => {
          acc.orphan += p.orphan;
        },
      }).load(
        filtered.map((w) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [w.lon, w.lat] },
          properties: { id: w.id, orphan: w.orphanStatus === "designated" },
        })),
      );
    }
    this.drawWells();
    this.drawLabels();
    if (state.well && state.view === "wells") {
      const w = this.wellById.get(state.well);
      if (w)
        L.marker([w.lat, w.lon], {
          icon: L.divIcon({
            className: "",
            html: '<div class="selected-well"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
          interactive: false,
          keyboard: false,
        }).addTo(this.selectionLayer);
    }
  }
  drawLabels() {
    this.cityLayer.clearLayers();
    if (!this.state) return;
    const zoom = this.map.getZoom();
    const labels = [
      ["BRITISH COLUMBIA", 56.7, -126.8],
      ["ALBERTA", 56.7, -114.7],
      ["SASKATCHEWAN", 55.7, -106],
      ["MANITOBA", 57, -98.8],
      ["ONTARIO", 51, -86],
      ["QUÉBEC", 54, -72],
      ["UNITED STATES", 37.8, -102],
    ];
    if (zoom < 7)
      labels.forEach(([name, lat, lon]) =>
        L.marker([lat, lon], {
          icon: L.divIcon({
            className: "province-label",
            html: esc(
              zoom < 4.7
                ? {
                    "BRITISH COLUMBIA": "BC",
                    ALBERTA: "AB",
                    SASKATCHEWAN: "SK",
                    MANITOBA: "MB",
                    ONTARIO: "ON",
                    QUÉBEC: "QC",
                  }[name] || name
                : name,
            ),
            iconSize: [130, 16],
            iconAnchor: [65, 8],
          }),
          interactive: false,
          keyboard: false,
        }).addTo(this.cityLayer),
      );
    const r = this.network.routes.find(
      (route) => route.id === this.state.route,
    );
    const selectedPoints =
      this.state.view !== "wells" &&
      !(this.state.view === "lab" && this.state.labTab === "cleanup") &&
      (this.state.view==="journey" || this.state.layers[r?.commodity])
        ? [r.coordinates[0], r.coordinates.at(-1)]
        : [];
    if (zoom >= 3.5)
      this.network.cities
        .filter(
          (c) =>
            !selectedPoints.some(
              (point) =>
                Math.hypot(
                  c.coordinates[0] - point[0],
                  c.coordinates[1] - point[1],
                ) < 1,
            ),
        )
        .forEach((c) =>
          L.marker([c.coordinates[1], c.coordinates[0]], {
            icon: L.divIcon({
              className: "place-label major",
              html: esc(c.name),
              iconSize: [80, 14],
              iconAnchor: [-9, 6],
            }),
            interactive: false,
            keyboard: false,
          }).addTo(this.cityLayer),
        );
  }
  drawWells() {
    this.wellLayer.clearLayers();
    if (
      this.state?.view==="journey" || !this.index ||
      !this.state ||
      (this.state.view !== "wells" &&
        !(this.state.view === "lab" && this.state.labTab === "cleanup") &&
        !this.state.layers.wells)
    )
      return;
    const b = this.map.getBounds(),
      bbox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const clusters = this.index.getClusters(
      bbox,
      Math.floor(this.map.getZoom()),
    );
    clusters.forEach((f) => {
      const [lon, lat] = f.geometry.coordinates,
        p = f.properties;
      if (p.cluster) {
        const size = Math.min(46, 34 + Math.log10(p.point_count) * 4),
          kind =
            p.orphan === 0
              ? "neutral"
              : p.orphan === p.point_count
                ? ""
                : "mixed";
        L.marker([lat, lon], {
          icon: L.divIcon({
            className: `cluster-icon ${kind}`,
            html: esc(p.point_count_abbreviated),
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
          title: `${p.point_count} loaded well records. Zoom to inspect.`,
        })
          .on("click", () =>
            this.map.setView(
              [lat, lon],
              this.index.getClusterExpansionZoom(p.cluster_id),
            ),
          )
          .addTo(this.wellLayer);
      } else {
        const w = this.wellById.get(p.id);
        L.circleMarker([lat, lon], {
          renderer: this.renderer,
          radius: 7,
          weight: p.orphan ? 2 : 1,
          color: p.orphan ? "#a34c32" : "#58777c",
          fillColor: p.orphan ? "#a34c32" : "#719598",
          fillOpacity: 1,
        })
          .on("click", () => this.callbacks.onWell(p.id))
          .bindTooltip(esc(w.name) + " · " + esc(w.province) + (w.observationsThrough ? " · Historical record" : ""), {
            className: "route-tooltip",
          })
          .addTo(this.wellLayer);
      }
    });
  }
  focus() {
    if (!this.state || !document.getElementById("map").clientWidth) return;
    this.map.invalidateSize({pan:false});
    const compact = this.map.getSize().y < 400;
    if (
      this.state.view === "wells" ||
      (this.state.view === "lab" && this.state.labTab === "cleanup")
    ) {
      const w = this.wellById.get(this.state.well);
      if (w) {
        this.map.setView([w.lat, w.lon], 8);
        return;
      }
      if (this.filtered.length) {
        this.map.fitBounds(
          L.latLngBounds(this.filtered.map((w) => [w.lat, w.lon])),
          {
            paddingTopLeft: compact ? [25, 75] : [45, 130],
            paddingBottomRight: compact ? [65, 45] : [45, 120],
            maxZoom: 7,
          },
        );
        return;
      }
      const province = this.provinces.getLayers().find(layer => layer.feature.properties.admin === "Canada" && layer.feature.properties.postal === this.state.province);
      if (province) this.map.fitBounds(province.getBounds(), {padding: [50,80],maxZoom:7});
      else this.continent();
      return;
    }
    const r = this.network.routes.find((r) => r.id === this.state.route);
    if (r)
      this.map.fitBounds(
        r.coordinates.map((c) => [c[1], c[0]]),
        {
          animate: false,
          paddingTopLeft: compact ? [40, 80] : [65, 130],
          paddingBottomRight: compact ? [85, 55] : [90, 120],
          maxZoom: 7,
        },
      );
  }
  step(n) {
    const r = this.network.routes.find((r) => r.id === this.state.route);
    if (!r) return;
    if (n === 1) {
      this.focus();
      return;
    }
    this.focus();
  }
  continent() {
    if (!document.getElementById("map").clientWidth) return;
    this.map.fitBounds(
      [
        [25, -132],
        [61, -60],
      ],
      { padding: [30, 30] },
    );
  }
  setCamera(camera) {
    if(!document.getElementById("map").clientWidth)return;
    this.map.invalidateSize({pan:false});
    if(this.state?.view==="journey"){this.focus();return;}
    if (camera) this.map.setView(camera.center, camera.zoom);
    else this.continent();
  }
}
