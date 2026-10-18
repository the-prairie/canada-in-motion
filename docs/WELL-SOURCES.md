# National well source audit

Research completed October 17, 2026, America/Edmonton. Raw probe files use UTC timestamps where present. This audit identifies usable feeds and concrete gaps; it does not certify a complete national inventory.

## Implementation verification supersedes research suggestions

The implemented acquisition has now fetched all eight enabled source layers across six provinces and Yukon locally and in GitHub Actions. Ontario uses `OGF_ID`: full enumeration found duplicate zero values in `WELL_ID`. Alberta contains 238,158 records and its upstream file reports January 30, 2025; Manitoba contains 12,155 records and its HTTP modification date is August 27, 2026. The expanded candidate also includes 76 Yukon records, 125 historical Nova Scotia onshore records and 211 historical offshore directory records. See OPEN-EASTERN-SOURCES.md for the follow-up research. See VERIFIED-SNAPSHOT.json and VERIFICATION.md for the actual release evidence. Research handoff filenames below describe local investigation artifacts; production paths are pipeline/ and config/.

## Immediate implementation handoff

- `adapter-config.json`: exact endpoints, source and stable IDs, mappings, publication status, licence references and limitations for ON, BC, MB, QC, NS and YT.
- `adapters.py`: `normalize(source, feature)` creates the existing app well shape from ArcGIS attributes or GeoJSON properties. The caller must supply WGS84 point geometry. Tested against actual ON, BC and NS records and a Manitoba date/status fixture. It accepts date objects from shapefile readers.
- `national-source-registry.json`: all ten provinces and three territories, source evidence, readiness, limitations and update policy.
- `MB-wells.zip`: unmodified official download, 12,155 records. Use `mb_wells.shp` and its `.prj` (NAD83 / UTM zone 14N, EPSG:26914).
- `NS-open-geo.json`: 131 exported features through February 2016, of which six empty placeholders are explicitly excluded; 125 well records are integrated. This is historical data.
- The `*-metadata.json`, `*-sample.json`, `*-count.json` and licence files preserve machine probes for inspection.

## Data that can expand the app now

| Jurisdiction | Tested source scope/count | Public reuse evidence | Important limitation |
|---|---:|---|---|
| BC | 34,425 surface-location records | BCER Open Data Licence | Authorizations include un-drilled/cancelled records; orphan designation needs separate join. |
| SK | 4,340 orphan records in existing verified extract | Exact orphan-layer metadata names Saskatchewan unrestricted licence v2 | Includes transferred and completed records; not all SK wells. |
| MB | 12,155 downloadable points | OpenMB licence linked by provincial copyright notice | Dated August 26, 2026. The visible ArcGIS layer returned only one record. |
| ON | 27,639 petroleum records | Ontario Open Government Licence in layer metadata and catalogue | Includes not-drilled, potential, unlocated, salt and storage records. |
| YT | 76 historic/current points | Authoritative Yukon ArcGIS item identifies Yukon OGL | Approximate locations; no orphan/reclamation fields. |

AB full-source retrieval and licensing are assigned to the parent implementation. This audit retained the previously verified 238,158 abandoned-layer count, without independently refreshing it.

Ontario's [official catalogue](https://open.canada.ca/data/en/dataset/235fcd04-6632-4cce-a403-556089cc4276) supplies the ArcGIS endpoint and downloadable formats. Implementation uses `OGF_ID`; full acquisition found duplicate zero values in `WELL_ID`, so that earlier candidate key was rejected. Preserve `LOCATION_ACCURACY`; a six-decimal rendering must not imply survey precision.

The [Manitoba download page](https://www.gov.mb.ca/iem/petroleum/gis/index.html) gives the snapshot date. Its [copyright notice](https://www.gov.mb.ca/legal/copyright.html) points to the [OpenMB licence](https://www.gov.mb.ca/asset_library/en/legal/OpenMB-Information-Data-Use-Licence.pdf), allowing reuse with attribution and exclusions. Do not substitute the single-record MapServer result for the downloadable inventory.

The exact [Saskatchewan orphan layer metadata](https://gis.saskatchewan.ca/egis/rest/services/economy/Petroleum/MapServer/18/iteminfo) identifies the [unrestricted geospatial licence](https://gisappl.saskatchewan.ca/Html5Ext/Resources/GOS_Standard_Unrestricted_Use_Data_Licence_v2.0.pdf). This resolves the earlier app's missing licence evidence. The full vertical and nonvertical layers returned 119,569 and 67,923 features. Their layer-specific licence fields were blank, and they contain wellbore/completion attributes. Do not add their counts as unique wells or assume the orphan-layer licence applies to them. The [general provincial copyright notice](https://www.saskatchewan.ca/Copyright) permits accurate non-commercial reproduction with attribution, but a separate identity and scope review remains necessary.

## Actual public-launch blockers

**Québec:** 907 records are queryable from the official SIGPEG service, but its [linked end-user licence](https://sigpeg.mrn.gouv.qc.ca/gpg/hydrocarbures/Licence_utilisation.pdf) restricts use to internal/intranet/extranet contexts and requires written authorization for other uses. This restriction also matters for non-commercial public distribution. Do not bundle these records publicly. The [official explanatory page](https://www.quebec.ca/agriculture-environnement-et-ressources-naturelles/energie/production-approvisionnement-distribution/puits-hydrocarbures/securisation) distinguishes inactive wells from those without a responsible owner. Its 907 total includes stratigraphic boreholes; neither `TYPE_PUITS` nor `SYMBOLOGIE` was validated as an orphan-status field.

**Newfoundland and Labrador:** the [onshore data page](https://www.gov.nl.ca/em/energy/petroleum/onshore/onshore-maps/) expressly prohibits providing a digital copy to third parties. Permission or a separately licensed source is required. The [offshore regulator](https://www.cnlopb.ca/news/nr10052021/) has a distinct well shapefile/inventory hub; the follow-up inspected its actual downloadable items but found no explicit redistribution grant resolving the regulator's general copyright restriction. See OPEN-EASTERN-SOURCES.md. Onshore and offshore are separate coverage requirements.

**Nova Scotia:** the current official viewer's onshore layer has 143 records and an October 13, 2026 update statement. Its ArcGIS item supplies an as-is disclaimer rather than an explicit open redistribution licence. The [general copyright policy](https://www.novascotia.ca/copyright) permits unmodified non-commercial reproduction with attribution; do not silently treat this as an open licence for transformed bulk data. The [historical open dataset](https://open.canada.ca/data/en/dataset/542f8d90-56ad-e0c4-d602-e6495d74553b) explicitly carries Nova Scotia OGL, and the follow-up integrated 125 valid historical records after auditing six empty placeholders. A separately open offshore directory contributes 211 historical records including re-entries. Current onshore/offshore completeness remains unresolved.

**New Brunswick:** the [official oil/gas viewer](https://www.gnb.ca/en/campaign/geonb/applications/oil-gas.html) resolves to a 49-record point layer. This cannot stand for the province's historic inventory. The [borehole database](https://www1.gnb.ca/0078/GeoscienceDatabase/Borehole/Search.asp) includes oil/gas and other prospects; indexed results have coordinates and spud dates, but no verified current closure/orphan status. A broad direct request returned HTTP403; no bypass was attempted. Dataset-specific redistribution rights remain unresolved.

**Prince Edward Island:** the [official 2007 PDF](https://www.princeedwardisland.ca/sites/default/files/publications/07gasoilwells.pdf) contains 20 entries, including a re-entry and offshore wells. It is not 20 unique onshore sites, and some status cells are blank. Its publication page is dated 2015; this does not update the underlying 2007 observations. A current machine-readable inventory and publication licence remain unverified.

**Northwest Territories:** [OROGO's registry](https://www.orogo.gov.nt.ca/en/well-data) displays 685 records, with 683 abandoned and two suspended. Its jurisdiction excludes federal areas and the Inuvialuit Settlement Region. A national atlas must combine the relevant CER and territorial sources and resolve duplicates; the OROGO list alone is not all NT.

**Nunavut:** [CER's frontier records](https://www.cer-rec.gc.ca/en/about/north-offshore/access-information.html) establish the relevant federal source. Its formation-top spreadsheet is geological evidence, not a complete current lifecycle/orphan inventory. No verified complete current point feed was established. Missing data must remain unknown, never zero.

## Normalization rules that prevent misleading totals

1. Count **source records** until authorization, well, wellbore, completion, site and event grain have been reconciled. Stable regulator IDs should survive ArcGIS rebuilds.
2. Keep orphan designation, whole-well closure and reclamation separate. Non-membership in an orphan list means unknown, not a verified non-orphan.
3. BC `ABAN` is whole-well abandoned; `ABNZ` is zone abandonment and remains unknown for whole-well closure. `CERT_OF_RESTORATION_FLAG` is independent.
4. ON `Abandoned Well`, `Active Well` and `Suspended Well` map directly. Capped, lost/junked, not-drilled, potential, unlocated and whipstocked modes retain their source meaning; no inferred safe/closed state. A historical plugging date does not override current active mode.
5. Manitoba directional surface symbols hide closure information. Use its explicit `STATUS`, preserving `MAP_STATUS`. All observed `ABD ...` and `SUSP ...` codes are listed in config; other operational codes remain unknown until a codebook establishes meaning.
6. Do not infer present ownership, financial solvency, liability or cleanup cost from recorded company names. Preserve unknowns and source dates.
7. Reject malformed geometry and dates with auditable counts; never silently delete records from a supposedly complete source.

## Refresh design

Poll source metadata/schema/counts weekly as an operational default, with bounded retries, checksums and retained raw snapshots. None of these probes establishes a uniform official publication schedule. Display both retrieval time and source-as-of time. Gate promotion on source identity completeness, geometry validation, schema compatibility and licence status. A failed refresh retains the prior validated snapshot and visibly marks its age. It must not publish an empty replacement or a new retrieval timestamp that makes historical records appear current.

The Model the Domain principle changed the adapter structure: mappings and publication eligibility live in a source registry, while normalized orphan, closure, reclamation and historical events remain separate fields. This prevents source availability from being mistaken for either completeness or public reuse permission.
