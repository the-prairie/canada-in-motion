export const DESTINATIONS = [
  ...[['explore', 'Explore a question'], ['income', 'Income'], ['outlook', 'Provincial outlook'], ['trade', 'Trade & prices'], ['supply', 'Follow the dollar'], ['futures', 'Energy futures'], ['oil', 'Oil & the economy'], ['services', 'Alberta: public services']].map(([id, label]) => ({id, label, group: 'Economy', view: 'economy', section: id})),
  {id: 'atlas', label: 'Map & comparison', group: 'Well atlas', view: 'atlas'},
  {id: 'wells', label: 'Find a well', group: 'Well atlas', view: 'wells'},
  {id: 'cleanup', label: 'Closure budget', group: 'Well atlas', view: 'lab', labTab: 'cleanup'},
  {id: 'journey', label: 'Carrier quotes', group: 'Transport', view: 'journey'},
  {id: 'transport', label: 'Cost experiment', group: 'Transport', view: 'lab', labTab: 'transport'},
];

export function currentDestination(state) {
  return DESTINATIONS.find(item => item.view === state.view && (!item.section || item.section === state.economy?.section) && (!item.labTab || item.labTab === state.labTab)) || DESTINATIONS[0];
}

export function destinationState(state, id) {
  const item = DESTINATIONS.find(item => item.id === id);
  if (!item) return state;
  const economy = {...state.economy, section: item.section};
  if (item.id === 'explore' && !economy.story?.focus && ['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'].includes(economy.region)) economy.story = {...economy.story, focus: economy.region};
  return {...state, view: item.view, well: null, ...(item.labTab ? {labTab: item.labTab} : {}), ...(item.section ? {economy} : {})};
}
