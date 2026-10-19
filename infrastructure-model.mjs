const FACILITY_REGIONS=Object.freeze({'burnaby-refinery':'BC','imperial-strathcona':'AB','regina-refinery':'SK','sarnia-imperial':'ON','montreal-suncor':'QC','lng-canada':'BC'});
export function selectInfrastructure(network,regions){
  const all=!regions.length||regions.includes('CA');
  return {
    routeIds:network.routes.filter(route=>all||route.provinces.some(code=>regions.includes(code))).map(route=>route.id),
    facilityIds:network.facilities.filter(facility=>all||regions.includes(FACILITY_REGIONS[facility.id])).map(facility=>facility.id),
  };
}
