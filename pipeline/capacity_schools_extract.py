#!/usr/bin/env python3
"""Rebuild reviewed CBE school/funding evidence and deterministic diagnostic calculations.

Numbers are manual transcriptions of primary-source tables, visually checked 2026-10-21.
No projection is fit to later actuals. No grant dollars or province-wide capacity is inferred.
Optional --fetch downloads source PDFs with hashes and extracts text for independent review.
"""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, pathlib, statistics, urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCES=[
 {'id':'ab-funding-model','title':'Alberta K to 12 funding model','url':'https://www.alberta.ca/k-to-12-education-funding-model','publicationDate':None,'locator':'Average enrolment methodology','type':'provincial_policy'},
 {'id':'cbe-budget-2023','title':'CBE Budget Report 2023-24','url':'https://cbe.ab.ca/about-us/budget-and-finance/Documents/Budget-2023-24.pdf','publicationDate':'2023-05-30','locator':'PDF pp26,34; enrolment chart p10','type':'district_budget'},
 {'id':'cbe-budget-2024','title':'CBE Budget Report 2024-25','url':'https://cbe.ab.ca/about-us/budget-and-finance/Documents/cbe-budget-report-2024-2025.pdf','publicationDate':'2024-05-28','dateBasis':'Board approval date on PDF p26','locator':'Printed p34 / PDF p34; enrolment chart p9','type':'district_budget'},
 {'id':'cbe-budget-2025','title':'CBE Budget Report 2025-26','url':'https://www.cbe.ab.ca/about-us/budget-and-finance/Documents/Budget-Report-2025-2026.pdf','publicationDate':'2025-05-27','locator':'Printed p31 / PDF p32; headcount chart printed p8 / PDF p9','type':'district_budget'},
 {'id':'cbe-financial-2024','title':'CBE Financial Results 2024-25','url':'https://cbe.ab.ca/about-us/budget-and-finance/Documents/Financial-Results-2024-25.pdf','publicationDate':'2025-11-26','dateBasis':'Date of auditor report within PDF; exact web publication date not established','locator':'PDF p131 student statistics; MD&A p19 funding discussion','type':'district_financial_report','note':'Student statistics explicitly information only, not part of audited financial statements.'},
 {'id':'cbe-capital-2022','title':'CBE Three-Year School Capital Plan 2023-2026','url':'https://www.cbe.ab.ca/FormsManuals/Three-Year-School-Capital-Plan-2023-2026.pdf','publicationDate':'2022-03-29','locator':'PDF p1 approval date; p4 enrolment projection chart; p6 approved-project table','type':'district_capital_plan'},
 {'id':'cbe-opening-2023','title':'CBE June 13 2023 public board agenda, Construction Projects Status Report','url':'https://cbe.ab.ca/about-us/board-of-trustees/BoardofTrusteeDocuments/20230613-public-agenda-regular-meeting.pdf','publicationDate':'2023-06-13','locator':'PDF p114; Attachment I p1 of3, exact opening-date table','type':'district_project_status'},
 {'id':'cbe-opening-northtrail','title':'Prairie Sky School and North Trail High School Celebrate Official Openings','url':'https://www.cbe.ab.ca/news/prairie-sky-school-north-trail-high-school-celebrate-official-openings-1773688984626','publicationDate':'2024-04-30','locator':'Opening dates paragraph; distinguish opening for students from later ceremony','type':'district_news'},
 {'id':'cbe-enrol-2023','title':'CBE School Enrolment Report 2023-2024','url':'https://cbe.ab.ca/FormsManuals/School-Enrolment-Report-2023-2024.pdf','publicationDate':'2023-12-12','locator':'Attachment IX capacity/utilization','type':'district_enrolment_report'},
 {'id':'cbe-enrol-2024','title':'CBE School Enrolment Report 2024-2025','url':'https://cbe.ab.ca/FormsManuals/School-Enrolment-Report-2024-2025.pdf','publicationDate':'2024-12-17','locator':'Attachment IX capacity/utilization; total enrolment table','type':'district_enrolment_report'},
 {'id':'cbe-enrol-2025','title':'CBE School Enrolment Report 2025-2026','url':'https://cbe.ab.ca/FormsManuals/School-Enrolment-Report-2025-2026.pdf','publicationDate':'2025-12-16','locator':'pp7,11 total enrolment; Attachment II','type':'district_enrolment_report'},
 {'id':'cbe-construction-guidance','title':'CBE School Capital Construction Projects','url':'https://www.cbe.ab.ca/school-capital-construction-projects','publicationDate':None,'locator':'Introductory delivery timelines','type':'district_guidance'},
 {'id':'ab-northtrail','title':'North Trail High School - Alberta Major Projects','url':'https://majorprojects.alberta.ca/details/North-Trail-High-School/4318','publicationDate':None,'locator':'Completed; estimated cost and capacity','type':'provincial_project_register'},
]
ACTUAL=[
 {'schoolYear':'2021/22','year':2021,'eligibleGrade1to12Fte':115102,'grades1to9':84505,'grades10to12':30597,'sourceId':'cbe-budget-2023'},
 {'schoolYear':'2022/23','year':2022,'eligibleGrade1to12Fte':120654,'grades1to9':88559,'grades10to12':32095,'sourceId':'cbe-budget-2023'},
 {'schoolYear':'2023/24','year':2023,'eligibleGrade1to12Fte':127806,'grades1to9':93182,'grades10to12':34624,'sourceId':'cbe-budget-2024'},
 {'schoolYear':'2024/25','year':2024,'eligibleGrade1to12Fte':131902,'grades1to9':95905,'grades10to12':35997,'sourceId':'cbe-budget-2025'},
 {'schoolYear':'2025/26','year':2025,'eligibleGrade1to12Fte':132853,'grades1to9':96409,'grades10to12':36444,'sourceId':'cbe-financial-2024'},
]
VINTAGES=[
 {'targetYear':2023,'schoolYear':'2023/24','vintageDate':'2023-05-30','sourceId':'cbe-budget-2023','previousActual':115102,'currentActualAtBudget':120654,'forecast':127706,'forecastGrades1to9':93478,'forecastGrades10to12':34228,'realized':127806,'actualRule':'20/30/50'},
 {'targetYear':2024,'schoolYear':'2024/25','vintageDate':'2024-05-28','sourceId':'cbe-budget-2024','previousActual':120654,'currentActualAtBudget':127806,'forecast':136461,'forecastGrades1to9':99554,'forecastGrades10to12':36907,'realized':131902,'actualRule':'20/30/50'},
 {'targetYear':2025,'schoolYear':'2025/26','vintageDate':'2025-05-27','sourceId':'cbe-budget-2025','previousActual':127806,'currentActualAtBudget':131902,'forecast':137195,'forecastGrades1to9':99422,'forecastGrades10to12':37773,'realized':132853,'actualRule':'30/70'},
]
PROJECTS=[
 {'id':'mahogany','name':'Mahogany School','type':'elementary','constructionApprovalDate':'2018-03-22','designApprovalDate':None,'approvedCapacity':600,'plannedOpening':'2022-09','actualOpening':'2022-09-01','openingDatePrecision':'day','actualSourceId':'cbe-opening-2023','provincialCapacity2023':551,'provincialCapacity2024':591},
 {'id':'bayside','name':'Bayside School (Auburn Bay Elementary 2)','type':'elementary','constructionApprovalDate':'2019-11-01','designApprovalDate':None,'approvedCapacity':600,'plannedOpening':'2022-09','actualOpening':'2022-09-01','openingDatePrecision':'day','actualSourceId':'cbe-opening-2023','provincialCapacity2023':545,'provincialCapacity2024':567},
 {'id':'lakeshore','name':'Lakeshore School (Auburn Bay Middle)','type':'middle','constructionApprovalDate':'2019-11-01','designApprovalDate':'2018-03-22','approvedCapacity':900,'plannedOpening':'2022-09','actualOpening':'2022-10-11','openingDatePrecision':'day','actualSourceId':'cbe-opening-2023','provincialCapacity2023':971,'provincialCapacity2024':971},
 {'id':'prairie-sky','name':'Prairie Sky School (Skyview Ranch)','type':'K-9','constructionApprovalDate':'2018-03-22','designApprovalDate':None,'approvedCapacity':900,'plannedOpening':'2022-09','actualOpening':'2023-04-03','openingDatePrecision':'day','actualSourceId':'cbe-opening-2023','provincialCapacity2023':813,'provincialCapacity2024':916},
 {'id':'north-trail','name':'North Trail High School (North Calgary High School)','type':'high','constructionApprovalDate':'2019-11-01','designApprovalDate':'2018-03-22','approvedCapacity':1800,'plannedOpening':'2024-09','actualOpening':'2023-09','openingDatePrecision':'month','actualSourceId':'cbe-opening-northtrail','provincialCapacity2023':1891,'provincialCapacity2024':1891},
]
def month_index(date):
 y,m=map(int,date[:7].split('-'));return 12*y+m

def build():
 for row in ACTUAL:
  assert row['eligibleGrade1to12Fte']==row['grades1to9']+row['grades10to12']
  row['measurementDate']=str(row['year'])+'-09-30'
  row['status']='reported_actual'
 for row in VINTAGES:
  assert row['forecast']==row['forecastGrades1to9']+row['forecastGrades10to12']
  row['wma2050']=round(.2*row['previousActual']+.3*row['currentActualAtBudget']+.5*row['forecast'],1)
  row['aem3070']=round(.3*row['currentActualAtBudget']+.7*row['forecast'],1)
  row['contemporaneousForecastRule']=row['forecast']
  row['twoYearMinusThreeYear']=round(row['aem3070']-row['wma2050'],1)
  row['forecastError']=row['forecast']-row['realized']
  row['forecastAbsoluteError']=abs(row['forecastError'])
  row['noGrowthAbsoluteError']=abs(row['currentActualAtBudget']-row['realized'])
  row['vintageInputsStatus']='All three inputs published in this pre-September budget; current column explicitly labelled Actual.'
 for p in PROJECTS:
  p.update({'status':'opened','approvalSourceId':'cbe-capital-2022','plannedSourceId':'cbe-capital-2022','planVintageDate':'2022-03-29','capacitySourceId':'cbe-capital-2022','observedCapacity2023SourceId':'cbe-enrol-2023','observedCapacitySourceId':'cbe-enrol-2024','observedCapacityDate':'2024-09-30'})
  p['approvalToOpeningMonths']=month_index(p['actualOpening'])-month_index(p['constructionApprovalDate'])
  p['actualMinusPlannedMonths']=month_index(p['actualOpening'])-month_index(p['plannedOpening'])
 return {
 'schemaVersion':1,'retrievedAt':'2026-10-21','scope':'Calgary Board of Education only; provincial funding weights applied to this explicitly bounded case study.',
 'sources':SOURCES,
 'funding':{'scope':'CBE Grades 1–12 students eligible for base instruction funding, reported in FTE student-statistics schedules. ECS, home education and other ineligible students excluded.',
 'unit':'eligible Grade 1–12 student FTE','actuals':ACTUAL,'vintages':VINTAGES,
 'rules':[{'id':'20/30/50','from':'2020/21','through':'2024/25','weights':[.2,.3,.5]},{'id':'30/70','from':'2025/26','weights':[0,.3,.7]}],
 'indexing':'For target year t: previousActual is t−2; currentActualAtBudget is t−1; forecast is published projection for t. Provincial documents label the budget year current and target year next.',
 'formulaOutputLabel':'Calculated funding-weighted eligible FTE (rule-only comparison)',
 'historicalValidation':{'kind':'Published district forecast versus later reported eligible enrolment; no fitted parameters','n':len(VINTAGES),'forecastMAE':sum(r['forecastAbsoluteError'] for r in VINTAGES)/len(VINTAGES),'noGrowthMAE':sum(r['noGrowthAbsoluteError'] for r in VINTAGES)/len(VINTAGES),'forecastErrorSign':'prediction minus actual','verdict':'Three observations only; compares forecasting accuracy, not causal effects of funding rule.'},
 'limitations':['Weighted outputs are reconstructed rule arithmetic, not observed final funded counts or audited payments.','The 2025/26 rule change also removed Supplemental Enrolment Growth Grant; no net dollar effect can be inferred.','Funding rates differ by grade, student characteristics, grant and year; no dollar conversion is supplied.','Financial-results student schedule is explicitly outside the financial statements.','Current-year actual September count is published at each budget vintage; it is not an updated year-end count.','No claim that extra funding mechanically produces staff or rooms.'],
 'modelProposal':{'controls':['target school year','20/30/50 versus30/70 versus100% published target projection','scenario growth applied to prospective eligible enrolment'], 'allowedOutcome':'Funded-count arithmetic gap to eligible enrolment; show forecast uncertainty and scope.', 'disallowedOutcome':'Net grant dollars, predicted achievement or employment caused by the rule.'}},
 'construction':{'scope':'Five named CBE new-school projects with verified approval, historical planned opening and actual opening. Convenience cohort, not all Alberta or CBE construction.',
 'capacityUnit':'approved design student places','projects':PROJECTS,'totalApprovedCapacityInOpenedProjects':sum(p['approvedCapacity'] for p in PROJECTS),
 'datePrecision':'Month-level timing calculations; North Trail opening only month precision.',
 'historicalValidation':{'kind':'Historical plan-versus-opening check','planVintageDate':'2022-03-29','n':len(PROJECTS),'meanAbsoluteTimingErrorMonths':statistics.mean(abs(p['actualMinusPlannedMonths']) for p in PROJECTS),'medianApprovalToOpeningMonths':statistics.median(p['approvalToOpeningMonths'] for p in PROJECTS),'timingErrorsMonths':[p['actualMinusPlannedMonths'] for p in PROJECTS],'verdict':'Observed schedule errors of a known project cohort; not an out-of-sample fitted delivery model.'},
 'guidance':{'elementaryMiddleYears':[3,4],'highYears':[4,5],'sourceId':'cbe-construction-guidance','kind':'CBE indicative approval-to-opening durations, not a guarantee'},
 'limitations':['Approved design capacity is not measured staffed capacity, student headcount, current official provincial capacity or net system capacity.','No construction project is counted as opened until its verified actual opening date.','Provincial capacity depends on instructional area, leased space and modulars; it differs from approval design capacity.','2018 approval date is March22 in capital plan, March23 in later narrative; retain table date and use month precision.','Five-project cohort excludes cancelled or still-unfinished projects and cannot establish representative delay distribution.','Moving a historical opening date is a scenario assumption, not evidence that budget or policy caused acceleration.','North Trail provincial project register gives $65.1M estimated cost; not verified final outturn and not used as a marginal cost per place.'],
 'modelProposal':{'controls':['shift opening dates by months','preserve observed project capacity','compare actual timing to published2022 plan'],'allowedOutcome':'Cumulative approved design places in projects that have opened by month; incremental design place-months from shifting dates.','disallowedOutcome':'province-wide delivered seats, staffed seats, net capacity or construction cost forecast'}},
 'headcountContext':{'scope':'Total CBE end-September enrolment; not used in eligible-FTE formula','unit':'students','sourceId':'cbe-budget-2025','values':[{'year':y,'value':v} for y,v in [(2018,123419),(2019,125809),(2020,122641),(2021,125329),(2022,131215),(2023,138244),(2024,142402)]]},
 'forecastContext':{'sourceId':'cbe-capital-2022','vintageDate':'2022-03-29','scope':'CBE total student headcount, capital-planning forecast; distinct from eligible-FTE budget forecasts','values':[{'year':y,'prediction':v} for y,v in [(2022,126863),(2023,127651),(2024,128104),(2025,127613),(2026,126822)]], 'note':'Historical forecast vintage only; never present as current forecast.'},
 }

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--fetch',action='store_true');args=ap.parse_args();data=build()
 if args.fetch:
  from pypdf import PdfReader
  folder=ROOT/'tmp/capacity-schools-primary';folder.mkdir(parents=True,exist_ok=True)
  for s in SOURCES:
   if not s['url'].endswith('.pdf'):continue
   try:
    content=urllib.request.urlopen(s['url'],timeout=30).read();p=folder/(s['id']+'.pdf');p.write_bytes(content);s['sha256']=hashlib.sha256(content).hexdigest()
    r=PdfReader(p);p.with_suffix('.txt').write_text('\n'.join(f'PDF page {i+1}\n'+page.extract_text() for i,page in enumerate(r.pages)))
   except Exception as e:s['fetchError']=str(e)
 out=ROOT/'capacity-schools-research.json';out.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'file':str(out),'fundingValidation':data['funding']['historicalValidation'],'constructionValidation':data['construction']['historicalValidation']},indent=2))
if __name__=='__main__':main()
