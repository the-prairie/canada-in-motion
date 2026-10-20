/**
 * Behavioral specifications, independent of provider wording or parser internals.
 * Families combine minimum-functionality, invariance and directional-expectation
 * tests, following CheckList (Ribeiro et al., ACL 2020).
 * This corpus checks the deployed interpretation contract, not model accuracy.
 */
export const interpretationFamilies = [
  {id:'trade-paraphrases',capability:'paraphrases',expect:{commodity:'electricity',year:2023,linkScope:'between',physicalOnly:false,physicalBilateral:false,includeImpacts:false},questions:[
    'Compare the value of electricity trade between Alberta and British Columbia in 2023.',
    'How much was electricity traded between Alberta and British Columbia worth in 2023?',
    'Map electricity exports in dollars between Alberta and British Columbia in 2023.',
    'Please show the monetary value of electricity transfers between Alberta and British Columbia in 2023.',
    'COMPARE THE VALUE OF ELECTRICITY TRADE BETWEEN ALBERTA AND BRITISH COLUMBIA IN 2023!',
  ]},
  {id:'french-trade',capability:'French',expect:{commodity:'gas',year:2023,linkScope:'between',physicalOnly:false,physicalBilateral:false,includeImpacts:false},questions:[
    'Comparez la valeur des échanges de gaz naturel entre le Québec et l’Ontario en 2023.',
    'Montrez les exportations de gaz naturel en dollars entre le Québec et l’Ontario en 2023.',
    'Quelle est la valeur du commerce de gaz naturel entre le Québec et l’Ontario en 2023 ?',
  ]},
  {id:'price-decrease',capability:'direction',expect:{commodity:'oil',shockPct:-10,includeImpacts:true},questions:[
    'Oil prices fall 10% in Alberta.',
    'Oil prices decrease by 10 percent in Alberta.',
    'How does a 10% reduction in oil prices affect Alberta?',
    'What if oil prices were 10% lower in Alberta?',
    'Apply a −10% oil price change to Alberta.',
    'What if oil prices drop 10 per cent in Alberta?',
  ]},
  {id:'french-decrease',capability:'French',expect:{commodity:'gas',shockPct:-10,includeImpacts:true},questions:[
    'Les prix du gaz naturel baissent de 10 % en Alberta.',
    'Une baisse de 10 pour cent du prix du gaz naturel en Alberta.',
    'Les prix du gaz diminuent de 10 % en Alberta.',
  ]},
  {id:'decimal-percent',capability:'numbers',expect:{commodity:'oil',shockPct:7.5,year:2023,includeImpacts:true},questions:[
    'Oil prices rise 7.5% in Alberta using trade in 2023.',
    'Increase oil prices by 7.5 percent using Alberta trade in 2023.',
    'Les prix du pétrole augmentent de 7,5 % avec les échanges de 2023 en Alberta.',
    'Le prix du pétrole est en hausse de 7,5 pour cent avec les échanges de 2023 en Alberta.',
  ]},
  {id:'leading-decimal-positive',capability:'numbers',expect:{commodity:'oil',shockPct:0.5,includeImpacts:true},questions:[
    'Oil prices rise .5% in Alberta.',
    'Apply a +.5% oil price change in Alberta.',
    'Oil prices rise .5 percent in Alberta.',
  ]},
  {id:'leading-decimal-negative',capability:'numbers',expect:{commodity:'oil',shockPct:-0.5,includeImpacts:true},questions:[
    'Apply a −.5% oil price change in Alberta.',
    'Oil prices fall .5% in Alberta.',
    'Apply a -.5 percent oil price change in Alberta.',
  ]},
  {id:'zero-percent',capability:'numbers',expect:{commodity:'gas',shockPct:0,includeImpacts:true},questions:[
    'Natural gas prices increase 0% in British Columbia.',
    'Apply a 0 percent natural gas price change in British Columbia.',
  ]},
  {id:'commodity-exclusion',capability:'exclusions',expect:{commodity:'oil',defaultCommodity:false,year:2023,unsupportedOutcome:false},questions:[
    'Compare oil trade, not gas, between Alberta and Ontario in 2023.',
    'Compare oil trade, excluding natural gas, between Alberta and Ontario in 2023.',
    'Compare the value of oil trade in 2023, excluding jobs and emissions.',
    'Compare the value of oil trade in 2023, without employment or profits.',
  ]},
  {id:'dated-physical-electricity',capability:'units',expect:{commodity:'electricity',physicalOnly:true,transferSet:'electricity-annual',physicalBilateral:false},questions:[
    'Show physical electricity imports in MWh for Alberta in 2025.',
    'Show electricity imports in megawatt-hours for Alberta in 2025.',
    'Show electricity imports in megawatt hours for Alberta in 2025.',
    'Montrez les importations physiques d’électricité en MWh en Alberta en 2025.',
  ]},
  {id:'monthly-physical-electricity',capability:'periods',expect:{commodity:'electricity',physicalOnly:true,transferSet:'electricity-monthly'},questions:[
    'Show physical electricity imports for Alberta in July 2026.',
    'Show physical electricity imports for Alberta in 2026-07.',
    'Montrez les importations physiques d’électricité en Alberta en juillet 2026.',
    'Show monthly electricity imports for Alberta.',
  ]},
  {id:'physical-vs-money',capability:'scope',expect:{commodity:'electricity',physicalBilateral:true},questions:[
    'Show physical electricity flows between Alberta and British Columbia.',
    'Show the value and physical volume of electricity sent from Alberta to British Columbia.',
    'Compare electricity trade values and physical flows between Alberta and British Columbia.',
    'Montrez les flux physiques d’électricité entre l’Alberta et la Colombie-Britannique.',
  ]},
  {id:'unsupported-compound-outcomes',capability:'coverage',expect:{commodity:'oil',unsupportedOutcome:true},questions:[
    'Compare oil trade between Alberta and Ontario and calculate the jobs it supports.',
    'Compare oil trade between Alberta and Ontario and calculate the emissions it generates.',
    'Compare oil trade between Alberta and Ontario and predict household bills.',
    'Les prix du pétrole baissent de 10 % : effets sur le PIB et les emplois en Alberta.',
  ]},
  {id:'separate-observed-gdp',capability:'scope',expect:{commodity:'oil',shockPct:10,unsupportedOutcome:false,explicitYears:[]},questions:[
    'Compare observed energy GDP in Alberta in 2022, and calculate a 10% oil price increase.',
    'Calculate a 10% oil price increase. Show observed GDP in Alberta in 2022.',
  ]},
];

export const rejectionCases = [
  ['negation','What if oil prices do not increase by 10%?','ambiguous_price_change'],
  ['negation','What if gas prices never fall 10%?','ambiguous_price_change'],
  ['negation','Les prix du gaz ne baissent pas de 10 %.','ambiguous_price_change'],
  ['negation','What if oil prices fall +10%?','ambiguous_price_change'],
  ['negation','What if oil prices rise −10%?','ambiguous_price_change'],
  ['ambiguity','Raise oil and natural gas prices by 10%.','ambiguous_price_change'],
  ['ambiguity','Oil prices rise 10% and then fall 5%.','ambiguous_price_change'],
  ['ambiguity','Oil prices rise at least 10%.','ambiguous_price_change'],
  ['bounds','Oil prices increase by 20.1%.','unsupported_price_change'],
  ['bounds','Natural gas prices fall 21%.','unsupported_price_change'],
  ['numbers','Oil prices rise 1e1% in Alberta.','unsupported_price_change'],
  ['numbers','Oil prices rise 1e-1% in Alberta.','unsupported_price_change'],
  ['numbers','Oil prices rise 1 e + 1 percent in Alberta.','unsupported_price_change'],
  ['numbers','Oil prices rise 1/2% in Alberta.','unsupported_price_change'],
  ['numbers','Oil prices rise 1 / 2 percent in Alberta.','unsupported_price_change'],
  ['numbers','Oil prices rise 1½% in Alberta.','unsupported_price_change'],
  ['numbers','Oil prices rise 1.2.5% in Alberta.','unsupported_price_change'],
  ['numbers','Oil prices rise 1e1% and then fall 5% in Alberta.','unsupported_price_change'],
  ['numbers','Natural gas prices increase 1,000%.','unsupported_price_change'],
  ['numbers','Electricity prices increase 1,000.0%.','unsupported_price_change'],
  ['units','Oil prices increase 10 percentage points.','unsupported_price_change'],
  ['bounds','Electricity prices double.','unsupported_price_change'],
  ['quantity-shock','Oil prices fall 10% while demand rises.','unsupported_price_change'],
  ['quantity-shock','Gas prices rise 10% and production falls.','unsupported_price_change'],
  ['quantity-shock','Les prix du gaz augmentent de 10 % et la demande diminue.','unsupported_price_change'],
  ['periods','Compare oil trade between Alberta and Ontario in 2035.','unsupported_trade_period'],
  ['periods','Compare gas trade from 2022 to 2024.','unsupported_trade_period'],
  ['periods','Show electricity trade value for Alberta in July 2024.','unsupported_trade_period'],
  ['periods','Show quarterly oil trade values for Alberta in 2024.','unsupported_trade_period'],
  ['periods','Show quarterly physical electricity imports for Alberta in 2025.','unsupported_transfer_period'],
  ['periods','Montrez la valeur des échanges d’électricité en juillet 2024.','unsupported_trade_period'],
  ['periods','Show physical electricity imports for Alberta in June 2026.','unsupported_transfer_period'],
  ['periods','Montrez les importations physiques d’électricité en juin 2026.','unsupported_transfer_period'],
  ['units','Show physical oil flows in MWh between Alberta and Ontario in 2024.','unsupported_transfer_unit'],
  ['units','Show electricity imports in gigawatt-hours for Alberta in 2025.','unsupported_transfer_unit'],
  ['units','Show natural gas transfers in cubic metres for Alberta in 2024.','unsupported_transfer_unit'],
  ['units','Show physical oil flows in m³ in Alberta in 2024.','unsupported_transfer_unit'],
];

export const regionalCases = [
  {question:'Compare oil trade between Alberta and Ontario in 2024.',regions:['AB','ON']},
  {question:'Compare oil trade between Ontario and Alberta in 2024.',regions:['AB','ON']},
  {question:'Compare electricity trade between Québec and Colombie-Britannique in 2024.',regions:['BC','QC']},
  {question:'Compare oil trade across Canada, excluding Alberta and Ontario.',exclude:['AB','ON'],count:11},
  {question:'Comparez les échanges de gaz dans toutes les provinces sauf le Québec.',exclude:['QC'],count:12},
  {question:'Compare oil trade, not jobs, in Alberta.',regions:['AB']},
  {question:'Compare oil trade, not jobs in Alberta.',regions:['AB']},
  {question:'Comparez les échanges de gaz, pas les emplois en Alberta.',regions:['AB']},
  {question:'COMPARE OIL TRADE ACROSS CANADA, EXCLUDING ALBERTA AND ONTARIO.',exclude:['AB','ON'],count:11},
];
