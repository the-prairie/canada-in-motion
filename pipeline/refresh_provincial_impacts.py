#!/usr/bin/env python3
"""Verify reviewed provincial budget calibrations and publish their factual inputs.

This deliberately does not infer new coefficients from revised budget documents.
A changed publisher file stops the refresh until its assumptions are reviewed.
Trade price exposure uses the independently refreshed energy-flows.json dataset.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import tempfile
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SOURCES = [
    {
        'id': 'ab-budget-2026-price-sensitivity',
        'title': 'Alberta Budget 2026: revenue tables',
        'publisher': 'Alberta Treasury Board and Finance',
        'url': 'https://open.alberta.ca/dataset/8055ff9a-6109-45ac-b4dc-b90084c0d28d/resource/d662ba40-28ff-48cd-96ea-0dfaebe48474/download/budget-2026-fiscal-plan-revenue-tables-2026-29.xlsx',
        'filename': 'ab-2026-revenue.xlsx',
        'sha256': 'ca296a40dc20056912dacf290d25eb8f590ccfd0577201482ed500214cd04f5c',
        'publishedAt': '2026-02-26',
        'locator': 'Worksheets Tb 3 Oil & Natural Gas Assumpt. and Tb 9 Sensitivities; Fiscal Plan printed p. 65',
        'license': 'Open Government Licence – Alberta',
        'licenseUrl': 'https://open.alberta.ca/licence',
    },
    {
        'id': 'bc-budget-2026-price-sensitivity',
        'title': 'British Columbia Budget and Fiscal Plan 2026/27–2028/29',
        'publisher': 'British Columbia Ministry of Finance',
        'url': 'https://www.bcbudget.gov.bc.ca/2026/pdf/2026_Budget_and_Fiscal_Plan.pdf',
        'filename': 'bc-2026-fiscal-plan.pdf',
        'sha256': '5b5194bf1e292dcb6d440796e4808c00a5726318692597e6db0285b9d248407d',
        'publishedAt': '2026-02-17',
        'locator': 'Printed p. 44: plant-inlet gas price; p. 74: Table 1.12 Key Fiscal Sensitivities; p. 155: Table A5 scope and embedded responses',
        'license': 'Published factual inputs with attribution; source document remains with the publisher',
        'licenseUrl': 'https://www2.gov.bc.ca/gov/content/home/copyright',
    },
    {
        'id': 'sk-budget-2026-price-sensitivity',
        'title': 'Saskatchewan 2026–27 Budget',
        'publisher': 'Saskatchewan Ministry of Finance',
        'url': 'https://pubsaskdev.blob.core.windows.net/pubsask-prod/153853/2026-27-Budget-Document.pdf',
        'filename': 'sk-2026-fiscal-plan.pdf',
        'sha256': '914d16562d2994a70bae1fc81a0f034492648eefd4c2191889002fcd7b3a9882',
        'publishedAt': '2026-03-18',
        'locator': 'Printed pp. 18–19: Resource forecast assumptions and sensitivities',
        'license': 'Published factual inputs with attribution; source document remains with the publisher',
        'licenseUrl': 'https://www.saskatchewan.ca/government/online-services/copyright',
    },
]

CALIBRATIONS = [
    {'id': 'ab-wti-2026', 'region': 'AB', 'commodity': 'oil', 'benchmark': 'WTI',
     'baselinePrice': 60.50, 'priceUnit': 'US$/barrel', 'priceChangeUnit': -1,
     'publishedImpactLow': -680, 'publishedImpactHigh': -680,
     'outcomeLabel': 'Provincial fiscal impact', 'fiscalYear': '2026-27', 'horizonMonths': 12,
     'sourceId': 'ab-budget-2026-price-sensitivity',
     'limitations': ['Holds all other Budget 2026 assumptions fixed, including the light-heavy differential and exchange rate.',
                     'Excludes potential effects on revenue from land lease sales.']},
    {'id': 'ab-gas-2026', 'region': 'AB', 'commodity': 'gas', 'benchmark': 'Alberta Reference Price',
     'baselinePrice': 3, 'priceUnit': 'CAD/GJ', 'priceChangeUnit': -0.10,
     'publishedImpactLow': -15, 'publishedImpactHigh': -15,
     'outcomeLabel': 'Provincial fiscal impact', 'fiscalYear': '2026-27', 'horizonMonths': 12,
     'sourceId': 'ab-budget-2026-price-sensitivity',
     'limitations': ['Alberta Reference Price is not Henry Hub, a residential gas tariff or the wholesale electricity price.',
                     'Excludes potential effects on revenue from land lease sales.']},
    {'id': 'bc-gas-2026', 'region': 'BC', 'commodity': 'gas', 'benchmark': 'BC plant-inlet natural gas',
     'baselinePrice': 2.18, 'priceUnit': 'CAD/GJ', 'priceChangeUnit': 0.25,
     'publishedImpactLow': 150, 'publishedImpactHigh': 250,
     'outcomeLabel': 'Annual provincial fiscal impact', 'fiscalYear': '2026-27', 'horizonMonths': 12,
     'sourceId': 'bc-budget-2026-price-sensitivity',
     'assumptions': 'The selected percentage changes BC plant-inlet natural gas prices. The published coefficient includes production-volume and royalty-credit responses; it excludes changes in natural gas liquids revenue.',
     'limitations': ['The published range is a fiscal sensitivity range, not a confidence interval.',
                     'The published sensitivity includes production-volume and royalty program credit effects, and excludes changes in natural gas liquids revenue.',
                     'Sensitivity can vary materially at different gas prices. This fiscal coefficient is not a fixed-quantity calculation.']},
    {'id': 'sk-wti-2026', 'region': 'SK', 'commodity': 'oil', 'benchmark': 'WTI',
     'baselinePrice': 59.75, 'priceUnit': 'US$/barrel', 'priceChangeUnit': 1,
     'publishedImpactLow': 16, 'publishedImpactHigh': 16,
     'outcomeLabel': 'Provincial oil revenue', 'fiscalYear': '2026-27', 'horizonMonths': 12,
     'sourceId': 'sk-budget-2026-price-sensitivity',
     'limitations': ['Keeps production, the light-heavy differential and exchange rate at the published budget assumptions.',
                     'This coefficient applies to oil revenue, not total provincial GDP.']},
]
LIMITATIONS = [
    'Trade repricing holds historical quantities and product mix fixed. Its gross receipt and purchase changes are not GDP, profit, wages or household bill forecasts.',
    'A commodity-wide percentage scenario assumes the same percentage change in every selected trade price and applicable local budget benchmark. It does not estimate how WTI, Henry Hub or wholesale electricity passes through to other prices.',
    'Fiscal sensitivities are separate local linear illustrations on the named 2026–27 budget baselines. They do not update automatically to the trade year or a CER forecast year.',
    'Fiscal and trade results overlap economically and use different periods and scopes. Do not add them.',
    'No provincial electricity fiscal sensitivity or province-level GDP, employment, household-income or investment response is calibrated here.',
    'An unavailable calibration is not a zero effect. Revised budgets require a new review before replacing these dated sensitivities.',
]


def verified_timestamp(record, expected_hashes):
    """Accept only a dated verification of these exact reviewed source bytes."""
    if not isinstance(record, dict) or record.get('sourceHashes') != expected_hashes:
        return None
    timestamp = record.get('retrievedAt')
    try:
        if not isinstance(timestamp, str) or datetime.fromisoformat(timestamp.replace('Z', '+00:00')).tzinfo is None:
            return None
    except ValueError:
        return None
    return timestamp


def build(cache, offline=False, generated_at=None, previous=None):
    cache.mkdir(parents=True, exist_ok=True)
    sources = []
    for source in SOURCES:
        path = cache / source['filename']
        if not offline:
            request = Request(source['url'], headers={'User-Agent': 'Canada-in-Motion/1.0 public data refresh'})
            with urlopen(request, timeout=120) as response:
                raw = response.read()
            if hashlib.sha256(raw).hexdigest() != source['sha256']:
                raise ValueError(f"Review required: {source['id']} publisher file changed")
            path.write_bytes(raw)
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != source['sha256']:
            raise ValueError(f"Source integrity failed: {source['id']}")
        sources.append({k: v for k, v in source.items() if k != 'filename'})
    identity = {'schemaVersion': 1, 'method': 'fixed-quantity-repricing-and-published-fiscal-sensitivity',
                'maxAbsShockPct': 20, 'fiscalUnit': 'million CAD', 'calibrations': CALIBRATIONS,
                'sources': sources, 'limitations': LIMITATIONS}
    identity['dataVersion'] = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':')).encode()).hexdigest()[:20]
    now = generated_at or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')
    identity['generatedAt'] = previous['generatedAt'] if previous and previous.get('dataVersion') == identity['dataVersion'] else now
    expected_hashes = {source['id']: source['sha256'] for source in sources}
    verification_path = cache / 'network-verification.json'
    if offline:
        try:
            verification = json.loads(verification_path.read_text())
        except (OSError, ValueError):
            verification = None
        previous_verification = {'retrievedAt': previous.get('retrievedAt'),
                                 'sourceHashes': {source['id']: source['sha256'] for source in previous.get('sources', [])}} if previous else None
        identity['retrievedAt'] = verified_timestamp(verification, expected_hashes) or verified_timestamp(previous_verification, expected_hashes)
        if not identity['retrievedAt']:
            raise ValueError('Offline source verification date unavailable; run an online refresh once')
    else:
        # Every network response has passed its reviewed hash above. Content
        # generation and successful publisher verification are separate clocks.
        identity['retrievedAt'] = now
        verification_path.write_text(json.dumps({'retrievedAt': now, 'sourceHashes': expected_hashes}, sort_keys=True) + '\n')
    return identity


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=ROOT / '.data-cache/provincial-impacts')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/provincial-impacts.json')
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    previous = json.loads(args.output.read_text()) if args.output.exists() else None
    result = build(args.cache, args.offline, previous=previous)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=args.output.parent, delete=False) as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        temporary = Path(stream.name)
    temporary.replace(args.output)
    print(json.dumps({'calibrations': len(result['calibrations']), 'regions': sorted(set(row['region'] for row in result['calibrations'])), 'dataVersion': result['dataVersion']}))


if __name__ == '__main__':
    main()
