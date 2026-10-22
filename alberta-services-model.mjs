export const ALBERTA_STAGES = Object.freeze(['population', 'schools', 'health', 'housing']);
const UNITS = new Set(['index', 'CAD/student', 'CAD/person', '%', 'hours', 'CAD/month']);
const ROLES = new Set(['demand', 'resources', 'capacity', 'outcomes']);
const CHANGES = new Set(['percent', 'percentage-points', 'absolute']);
const requireValue = (ok, message) => { if (!ok) throw new Error(`Alberta services: ${message}`); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export function normalizeAlbertaStorySelection(raw) {
  return {stage: ALBERTA_STAGES.includes(raw?.stage) ? raw.stage : 'population'};
}

export function validateAlbertaServices(data) {
  requireValue(data?.version === 1, 'unsupported dataset version');
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(data.reviewedAt ?? ''), 'review date required');
  requireValue(text(data.scopeNote) && text(data.updatePolicy), 'scope and update policy required');
  requireValue(Array.isArray(data.sources) && data.sources.length > 0, 'sources required');
  const sourceIds = new Set();
  for (const source of data.sources) {
    requireValue(text(source.id) && !sourceIds.has(source.id), 'duplicate or missing source id');
    requireValue(text(source.title) && /^https:\/\//.test(source.url ?? '') && text(source.note), 'source attribution incomplete');
    sourceIds.add(source.id);
  }
  const metricIds = new Set();
  for (const stage of ALBERTA_STAGES) {
    const chapter = data.chapters?.[stage];
    requireValue(chapter?.id === stage && text(chapter.title) && text(chapter.period) && text(chapter.summary), `missing chapter ${stage}`);
    requireValue(Array.isArray(chapter.notes) && chapter.notes.every(text), `${stage} notes invalid`);
    requireValue(Array.isArray(chapter.metrics) && chapter.metrics.length > 0, `${stage} metrics required`);
    if (chapter.policy) requireValue(sourceIds.has(chapter.policy.sourceId) && text(chapter.policy.period) && text(chapter.policy.text), 'policy attribution incomplete');
    for (const metric of chapter.metrics) {
      requireValue(text(metric.id) && !metricIds.has(metric.id), 'duplicate or missing metric id');
      metricIds.add(metric.id);
      requireValue(text(metric.label) && text(metric.shortLabel) && text(metric.note), `${metric.id} labels and definition required`);
      requireValue(UNITS.has(metric.unit) && ROLES.has(metric.role) && CHANGES.has(metric.changeKind), `${metric.id} invalid semantics`);
      requireValue(sourceIds.has(metric.sourceId), `${metric.id} unresolved source`);
      requireValue(Array.isArray(metric.periods) && [1, 2].includes(metric.periods.length) && metric.periods.every(text) && new Set(metric.periods).size === metric.periods.length, `${metric.id} invalid periods`);
      requireValue(Array.isArray(metric.series) && metric.series.length > 0, `${metric.id} no series`);
      const ids = new Set();
      for (const series of metric.series) {
        requireValue(text(series.id) && !ids.has(series.id) && text(series.label), `${metric.id} invalid series identity`);
        ids.add(series.id);
        requireValue(Array.isArray(series.values) && series.values.length === metric.periods.length, `${metric.id} period/value mismatch`);
        requireValue(series.values.every(value => value === null || (finite(value) && value >= 0 && (metric.unit !== '%' || value <= 100))), `${metric.id} invalid observation`);
        requireValue(Array.isArray(series.forecast) && series.forecast.length === metric.periods.length && series.forecast.every(flag => typeof flag === 'boolean'), `${metric.id} forecast flags required`);
        if (metric.unit === 'index') requireValue(metric.periods.length === 2 && series.values[0] === 100, `${metric.id} index must have a 100 baseline`);
        if ('reportedChangePct' in series) {
          requireValue(finite(series.reportedChangePct) && series.values.length === 2 && series.values.every(finite) && series.values[0] > 0, `${metric.id} invalid reported change`);
          const ratioChange = (series.values[1] / series.values[0] - 1) * 100;
          requireValue(Math.abs(ratioChange - series.reportedChangePct) <= 0.15 && text(series.changeNote), `${metric.id} reported change inconsistent with rounded levels`);
        }
      }
    }
  }
  return true;
}

export function computeAlbertaServices(data) {
  validateAlbertaServices(data);
  // No cross-period causal estimates: every calculation stays inside one metric.
  const chapters = Object.fromEntries(ALBERTA_STAGES.map(stage => {
    const chapter = data.chapters[stage];
    const metrics = chapter.metrics.map(metric => {
      const series = metric.series.map(row => {
        const [first, last] = row.values;
        const paired = row.values.length === 2 && finite(first) && finite(last);
        const change = paired ? last - first : null;
        const calculated = paired && first > 0 ? (last / first - 1) * 100 : null;
        return {...row, change, changePct: paired ? row.reportedChangePct ?? calculated : null, changeBasis: row.reportedChangePct === undefined ? 'calculated-from-published-values' : 'published-percentage-change'};
      });
      const observed = series.flatMap(row => row.values).filter(finite);
      return {...metric, series, max: observed.length ? Math.max(...observed) : null};
    });
    return [stage, {...chapter, metrics}];
  }));
  const growth = chapters.schools.metrics.find(metric => metric.id === 'school-growth');
  const latest = id => growth.series.find(row => row.id === id)?.values[1];
  const ratio = (numerator, denominator) => finite(numerator) && finite(denominator) && denominator > 0 ? (numerator / denominator - 1) * 100 : null;
  const spending = chapters.schools.metrics.find(metric => metric.id === 'school-spending');
  const ab = spending.series.find(row => row.id === 'AB')?.values[0];
  const ca = spending.series.find(row => row.id === 'CA')?.values[0];
  return {...data, chapters, derived: {
    realInstructionalCompensationPerStudentChangePct: ratio(latest('compensation'), latest('students')),
    studentsPerEducatorChangePct: ratio(latest('students'), latest('educators')),
    schoolSpendingDifferencePct: ratio(ab, ca),
    note: 'Ratios use published rounded inputs. They describe average resources, not class size, adequacy or a causal effect.'
  }};
}
