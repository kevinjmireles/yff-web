/**
 * Extract geo_metrics from OCD division IDs
 *
 * Parses OCD IDs to extract state, county_fips, and place information
 * for populating the geo_metrics table.
 *
 * @example
 * metricRowsFromOcdIds([
 *   'ocd-division/country:us/state:oh',
 *   'ocd-division/country:us/state:oh/place:columbus'
 * ])
 * // Returns:
 * // [
 * //   { metric_key: 'state', metric_value: 'oh' },
 * //   { metric_key: 'place', metric_value: 'columbus,oh' }
 * // ]
 */

export type MetricRow = {
  metric_key: 'state' | 'county_fips' | 'place'
  metric_value: string
}

/**
 * Parse OCD IDs and extract geographic metrics
 *
 * Returns an array of metric rows suitable for inserting into geo_metrics table.
 * Ensures only one value per metric_key by taking the most specific match.
 *
 * @param ocd_ids - Array of OCD division IDs from profiles.ocd_ids
 * @returns Array of metric rows with keys: state, county_fips, place
 */
export function metricRowsFromOcdIds(ocd_ids: string[] | null | undefined): MetricRow[] {
  if (!Array.isArray(ocd_ids) || !ocd_ids.length) return []

  let state: string | undefined
  let county_fips: string | undefined
  let place: string | undefined

  for (const id of ocd_ids) {
    const s = id.toLowerCase()

    // Extract state: ocd-division/country:us/state:oh
    const mState = s.match(/\/state:([a-z]{2})(\/|$)/)
    if (mState) state = mState[1]

    // Extract county FIPS: ocd-division/.../county_fips:39049
    const mCountyFips = s.match(/\/county_fips:(\d{5})(\/|$)/)
    if (mCountyFips) county_fips = mCountyFips[1]

    // Extract place: ocd-division/.../place:columbus
    const mPlace = s.match(/\/place:([a-z0-9_\-]+)(\/|$)/)
    if (mPlace) place = mPlace[1]
  }

  const rows: MetricRow[] = []

  if (state) {
    rows.push({ metric_key: 'state', metric_value: state.toUpperCase() })
  }

  if (county_fips) {
    rows.push({ metric_key: 'county_fips', metric_value: county_fips })
  }

  if (place && state) {
    rows.push({ metric_key: 'place', metric_value: `${place},${state}` })
  }

  return rows
}
