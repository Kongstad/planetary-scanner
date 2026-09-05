import { useEffect, useState } from 'react'
import './App.css'

type PanelProps = {
  title: string
  qualifier: string
  children: React.ReactNode
}

function Panel({ title, qualifier, children }: PanelProps) {
  return (
    <section className="panel">
      <header className="panel__header">
        <span>{title}</span>
        <span>{qualifier}</span>
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}

type ReferenceFact = {
  field: string
  value: number | string
  unit: string | null
}

type ReferenceDataset = {
  facts: ReferenceFact[]
}

type RetrievedReferenceRecord = {
  document: {
    document_id: string
    content: string
    metadata: {
      field: string
      value: number | string
      unit?: string
      scope: string
      source_id: string
      source_url: string
    }
  }
  score: number
}

type GroundedAnswer = {
  answer: string
  insufficient_evidence: boolean
  citations: RetrievedReferenceRecord[]
}

const vitalStatistics: [label: string, value: string, field?: string][] = [
  ['MEAN RADIUS', 'LOADING', 'mean_radius'],
  ['MASS', 'LOADING', 'mass'],
  ['EQUAT. GRAVITY', 'LOADING', 'equatorial_surface_gravity'],
  ['ROTATION', 'LOADING', 'rotation_period'],
  ['GEOM. ALBEDO', 'LOADING', 'geometric_albedo'],
  ['SATELLITES', 'LOADING', 'natural_satellite_count'],
]

const orbitalElements: [label: string, value: string, field?: string][] = [
  ['Semi-major axis', 'LOADING', 'semi_major_axis'],
  ['Eccentricity', 'LOADING', 'orbital_eccentricity'],
  ['Orbital period', 'LOADING', 'orbital_period'],
  ['Inclination', 'LOADING', 'orbital_inclination'],
  ['Axial tilt', 'LOADING', 'axial_tilt'],
  ['Escape velocity', 'LOADING', 'equatorial_escape_velocity'],
]

const orbitalEnvironment: [label: string, field: string][] = [
  ['CATALOGUED OBJECTS', 'orbital_catalog_object_count'],
  ['ACTIVE SATELLITES', 'active_satellite_count'],
  ['ROCKET BODIES', 'orbital_rocket_body_count'],
  ['TRACKED DEBRIS', 'orbital_debris_count'],
]

const atmosphere: [label: string, fallback: string, width: number, field: string][] = [
  ['NITROGEN N₂', 'LOADING', 78, 'atmospheric_nitrogen_fraction'],
  ['OXYGEN O₂', 'LOADING', 21, 'atmospheric_oxygen_fraction'],
  ['OTHER GASES', 'LOADING', 1, 'atmospheric_other_gases_fraction'],
  ['GLOBAL CO₂', 'LOADING', 0.043, 'global_marine_surface_carbon_dioxide'],
]

const geochemistry: [label: string, field: string][] = [
  ['IRON Fe', 'bulk_earth_iron_mass_fraction'],
  ['OXYGEN O', 'bulk_earth_oxygen_mass_fraction'],
  ['SILICON Si', 'bulk_earth_silicon_mass_fraction'],
  ['MAGNESIUM Mg', 'bulk_earth_magnesium_mass_fraction'],
  ['SULFUR S', 'bulk_earth_sulfur_mass_fraction'],
  ['OTHER ELEMENTS', 'bulk_earth_other_elements_mass_fraction'],
]

const planetaryInterior: [label: string, field: string][] = [
  ['CORE STATE', 'core_state'],
  ['INNER CORE R.', 'inner_core_radius'],
  ['CORE–MANTLE BOUNDARY', 'core_mantle_boundary_depth'],
  ['GLOBAL HEAT FLOW', 'global_heat_flow'],
  ['RADIOGENIC HEAT', 'radiogenic_heat'],
  ['GEODYNAMO', 'geodynamo_status'],
  ['QUAKES / DAY · M2.5–5.4', 'earthquake_rate_m25_to_m54'],
  ['TECTONIC REGIME', 'tectonic_regime'],
]

const biosphereObservations: [label: string, field: string][] = [
  ['FOREST AREA · 2020', 'global_forest_area'],
  ['PRIMARY FOREST · 2020', 'global_primary_forest_area'],
  ['DEFORESTATION · 2015–20', 'global_deforestation_rate'],
  ['GLOBAL CH₄ · APR 2026', 'global_marine_surface_methane'],
  ['GLOBAL N₂O · APR 2026', 'global_marine_surface_nitrous_oxide'],
  ['OCEAN NPP', 'ocean_net_primary_production'],
]

const civilisationReference: [label: string, field: string][] = [
  ['GLOBAL POPULATION · 2025', 'global_human_population'],
  ['CATALOGUED EUK. · 2026', 'catalogued_eukaryotic_species'],
  ['EST. EUK. SPECIES · 2011', 'estimated_eukaryotic_species'],
  ['LIFEFORM TYPE · 2026', 'lifeform_type'],
  ['DOMINANT TECH. SPECIES · 2026', 'technological_species'],
  ['CIVILISATION SCALE · 1973', 'kardashev_scale_estimate'],
]

const volatileInventory = [
  { label: 'CARBON C', totalField: 'carbon_reservoir_reference_total', reservoirs: [{ name: 'ROCKS + SEDIMENTS', field: 'carbon_rocks_and_sediments_fraction', tone: 'soil' }, { name: 'OCEAN DIC', field: 'carbon_ocean_fraction', tone: 'ocean' }, { name: 'MOBILE RESERVOIRS', field: 'carbon_mobile_reservoirs_fraction', tone: 'biosphere' }] },
  { label: 'WATER H₂O', totalField: 'water_inventory_total', reservoirs: [{ name: 'OCEANS', field: 'water_ocean_fraction', tone: 'ocean' }, { name: 'ICE + GLACIERS', field: 'water_ice_fraction', tone: 'ice' }, { name: 'OTHER WATER', field: 'water_nonocean_fraction', tone: 'atmosphere' }] },
  { label: 'DRY AIR', totalField: 'atmospheric_nitrogen_fraction', reservoirs: [{ name: 'N₂', field: 'atmospheric_nitrogen_fraction', tone: 'atmosphere' }, { name: 'O₂', field: 'atmospheric_oxygen_fraction', tone: 'ice' }, { name: 'TRACE GASES', field: 'atmospheric_other_gases_fraction', tone: 'nitrate' }] },
]

function App() {
  const [referenceFacts, setReferenceFacts] = useState<ReferenceFact[]>([])
  const [isReferenceApiOnline, setIsReferenceApiOnline] = useState(false)
  const [query, setQuery] = useState('')
  const [retrievalResults, setRetrievalResults] = useState<RetrievedReferenceRecord[]>([])
  const [retrievalStatus, setRetrievalStatus] = useState('Enter a question to generate a grounded answer from cited reference records.')
  const [groundedAnswer, setGroundedAnswer] = useState<string | null>(null)
  const [isRetrieving, setIsRetrieving] = useState(false)

  useEffect(() => {
    void fetch('/reference/bodies/earth')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Reference API returned ${response.status}`)
        }
        return response.json() as Promise<ReferenceDataset>
      })
      .then((dataset) => {
        setReferenceFacts(dataset.facts)
        setIsReferenceApiOnline(true)
      })
      .catch(() => {
        setReferenceFacts([])
        setIsReferenceApiOnline(false)
      })
  }, [])

  function getReferenceValue(field: string | undefined, fallback: string, fractionDigits?: number): string {
    const fact = referenceFacts.find((candidate) => candidate.field === field)
    if (!fact) {
      return fallback
    }
    const value = typeof fact.value === 'number' && fractionDigits !== undefined
      ? fact.value.toFixed(fractionDigits)
      : String(fact.value)
    if (!fact.unit || fact.unit === '1' || fact.unit === 'count') {
      return value
    }
    return `${value} ${fact.unit}`
  }

  function getPercentageReferenceValue(field: string, fallback: string): string {
    const fact = referenceFacts.find((candidate) => candidate.field === field)
    return fact && typeof fact.value === 'number' ? `${(fact.value * 100).toFixed(1)}%` : fallback
  }

  function getCo2ScalePosition(): string {
    const fact = referenceFacts.find((candidate) => candidate.field === 'global_marine_surface_carbon_dioxide')
    if (!fact || typeof fact.value !== 'number') {
      return '0%'
    }
    return `${Math.min(100, Math.max(0, ((fact.value - 280) / 220) * 100))}%`
  }

  function submitQuery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const question = query.trim()
    if (!question) {
      setRetrievalStatus('Enter a question before querying the Science Computer.')
      return
    }
    setIsRetrieving(true)
    setGroundedAnswer(null)
    setRetrievalStatus('Retrieving cited records and generating a grounded answer...')
    void fetch(`/answers/reference?${new URLSearchParams({ question, limit: '3' })}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Answer API returned ${response.status}`)
        }
        return response.json() as Promise<GroundedAnswer>
      })
      .then((response) => {
        setGroundedAnswer(response.answer)
        setRetrievalResults(response.citations)
        setRetrievalStatus(response.insufficient_evidence
          ? 'The local model found insufficient evidence in the retrieved records.'
          : `${response.citations.length} cited reference record${response.citations.length === 1 ? '' : 's'} supplied to the local model.`)
      })
      .catch(() => {
        setRetrievalResults([])
        setGroundedAnswer(null)
        setRetrievalStatus('Grounded answering is unavailable. Start the local API and Ollama, then try again.')
      })
      .finally(() => setIsRetrieving(false))
  }

  return (
    <main className="console">
      <header className="console__header">
        <div className="wordmark">
          <strong>PLANETARY SCANNER</strong>
          <span>REMOTE SENSING SUITE · v0.1</span>
        </div>
        <div className="navigation-status">
          <button className="body-tab body-tab--active" type="button">
            <span className="body-disc" />
            <span>EARTH<small>SOL III</small></span>
          </button>
          <button className="body-tab" type="button" disabled><span className="body-disc body-disc--mars" /><span>MARS<small>SOL IV</small></span></button>
          <button className="body-tab" type="button" disabled><span className="body-disc body-disc--luna" /><span>LUNA<small>SOL III-a</small></span></button>
          <div className="mission-status">
            <div><span>SENSOR ARRAY</span><strong className={isReferenceApiOnline ? 'status-online' : 'status-offline'}><i />{isReferenceApiOnline ? 'ONLINE' : 'OFFLINE'}</strong></div>
            <div><span>MISSION CLOCK</span><strong>00:22:00 UTC</strong></div>
          </div>
        </div>
        <button type="button">RE-SCAN</button>
      </header>
      <div className="console__main">
        <aside className="rail">
          <div className="rail-block">PLANETARY PROFILE<i /></div>
          <Panel title="01 · CLASSIFICATION" qualifier="CATALOG">
            <h1>EARTH</h1>
            <p className="designation">SOL III · TERRESTRIAL / SILICATE</p>
            <div className="data-grid">
              {vitalStatistics.map(([label, value, field]) => <div key={label}><span>{label}</span><strong>{getReferenceValue(field, value)}</strong></div>)}
            </div>
          </Panel>
          <Panel title="02 · ORBITAL ELEMENTS" qualifier="J2000">
            <dl className="data-list">
              {orbitalElements.map(([label, value, field]) => <div key={label}><dt>{label}</dt><dd>{getReferenceValue(field, value)}</dd></div>)}
            </dl>
          </Panel>
          <div className="rail-block">ENVIRONMENT<i /></div>
          <Panel title="03 · ORBITAL ENVIRONMENT" qualifier="SATCAT · 2026-09-04">
            <div className="data-grid compact-grid">{orbitalEnvironment.map(([label, field]) => <div key={field}><span>{label}</span><strong>{getReferenceValue(field, 'LOADING')}</strong></div>)}</div>
          </Panel>
          <Panel title="04 · MAGNETIC SHIELD" qualifier="GEOMAGNETIC">
            <div className="data-grid compact-grid magnetic-shield-grid"><div><span>FIELD ORIGIN</span><strong>{getReferenceValue('magnetic_field_origin', 'LOADING')}</strong></div><div><span>SOLAR WIND</span><strong>{getReferenceValue('solar_wind_deflection', 'LOADING')}</strong></div><div><span>ATMOSPHERE</span><strong>{getReferenceValue('atmospheric_retention_role', 'LOADING')}</strong></div><div><span>AURORAL RESPONSE</span><strong>{getReferenceValue('auroral_response', 'LOADING')}</strong></div></div>
          </Panel>
          <Panel title="05 · ATMOSPHERE" qualifier="NEAR SURFACE">
            <div className="bar-list">
              {atmosphere.map(([label, fallback, weight, field]) => <div key={label}><span>{label}</span><strong>{field === 'global_marine_surface_carbon_dioxide' ? getReferenceValue(field, fallback) : getPercentageReferenceValue(field, fallback)}</strong><i><b style={{ width: `${weight}%` }} /></i></div>)}
            </div>
            <div className="co2-reference">
              <div className="co2-reference__heading"><span>CO₂ CLIMATE REFERENCE</span><strong>{getReferenceValue('global_marine_surface_carbon_dioxide', 'LOADING')}</strong></div>
              <div className="co2-scale" aria-label="Atmospheric carbon dioxide climate reference scale from 280 to 500 parts per million">
                <div className="co2-scale__band co2-scale__band--preindustrial">PRE-IND.<small>280–350</small></div>
                <div className="co2-scale__band co2-scale__band--elevated">ELEVATED<small>350–400</small></div>
                <div className="co2-scale__band co2-scale__band--forcing">HIGH FORCING<small>400–450</small></div>
                <div className="co2-scale__band co2-scale__band--extreme">EXTREME<small>450+</small></div>
                <i className="co2-scale__marker" style={{ left: getCo2ScalePosition() }} aria-hidden="true" />
              </div>
              <p>GLOBAL MARINE SURFACE · MAY 2026 · NOAA GML</p>
            </div>
          </Panel>
          <div className="rail-block">LIFE<i /></div>
          <Panel title="06 · BIOSPHERE" qualifier="GLOBAL OBSERVABLES">
            <div className="biosphere-status"><strong>CONFIRMED</strong><span>FOREST + OCEAN + ATMOSPHERE</span></div>
            <div className="data-grid compact-grid biosphere-observations">{biosphereObservations.map(([label, field]) => <div key={field}><span>{label}</span><strong>{field === 'ocean_net_primary_production' ? 'UNKNOWN' : getReferenceValue(field, 'LOADING')}</strong></div>)}</div>
          </Panel>
          <Panel title="07 · CIVILISATION" qualifier="REFERENCE + SCENARIO">
            <h2 className="group-title">REFERENCE</h2>
            <div className="data-grid compact-grid civilisation-reference">{civilisationReference.map(([label, field]) => <div key={field}><span>{label}</span><strong>{getReferenceValue(field, 'LOADING', field === 'catalogued_eukaryotic_species' ? 1 : undefined)}</strong></div>)}</div>
            <h2 className="group-title">FICTIONAL SCENARIO</h2>
            <div className="data-grid civilisation-scenario"><div><span>SUSTAINABILITY</span><strong className="status-chip status-chip--undetermined">UNDETERMINED</strong></div><div><span>CONTACT POSTURE</span><strong className="status-chip status-chip--defensive">DEFENSIVE</strong></div><div><span>PRIME DIRECTIVE</span><strong>ACTIVE · AVOID CONTACT</strong></div></div>
          </Panel>
        </aside>
        <section className="center-column">
          <section className="viewer-shell">
            <header className="viewer-shell__header">
              <span>PRIMARY VIEWER</span>
              <div className="layer-chips"><button type="button">IMAGERY</button><button type="button">TERRAIN</button><button type="button" disabled>THERMAL</button><button type="button" disabled>SPECTRAL</button><button type="button">GRID</button></div>
              <span>PROJ · GEODETIC WGS-84</span>
            </header>
            <div className="viewer-placeholder">
              <img className="viewer-image" src="/earth-placeholder.jpg" alt="Earth viewed from space" />
              <div className="graticule" />
              <div className="target-reticle" aria-hidden="true" />
              <div className="viewer-directive"><strong>PRIME DIRECTIVE IN EFFECT</strong><span>PRE-WARP CIVILISATION DETECTED</span><span>ALL CONTACT PROHIBITED</span></div>
              <div className="hud hud--left">CURSOR 34.0500° N 118.2400° W<br /><span>ALT 412.0 km · GSD 10.0 m</span></div>
              <div className="hud hud--right">1 000 km<div /></div>
            </div>
            <footer className="telemetry">
              <span>PHASE ANGLE<strong>38.00°</strong></span><span>SUB-SPACECRAFT<strong>17.02° / −59.12°</strong></span><span>DOWNLINK<strong>UNAVAILABLE</strong></span><span>SOLAR ILLUM.<strong>72%</strong></span><span>SCAN COVERAGE<strong>NOT INITIALIZED</strong></span>
            </footer>
          </section>
          <Panel title="SCIENCE COMPUTER" qualifier="LOCAL RETRIEVAL · 74 RECORDS">
            <div className="science-computer">
              <div className="message"><span>RETRIEVAL</span><p>{retrievalStatus}</p></div>
              {groundedAnswer && <div className="grounded-answer"><span>ANSWER</span><p>{groundedAnswer}</p></div>}
              {retrievalResults.length > 0 && <ol className="retrieval-results">
                {retrievalResults.map(({ document, score }) => <li key={document.document_id}>
                  <strong>{document.metadata.field.replaceAll('_', ' ')}</strong>
                  <span>{String(document.metadata.value)}{document.metadata.unit && document.metadata.unit !== '1' && document.metadata.unit !== 'count' ? ` ${document.metadata.unit}` : ''} · {document.metadata.scope}</span>
                  <a href={document.metadata.source_url} target="_blank" rel="noreferrer">{document.metadata.source_id}</a>
                  <em>{score.toFixed(3)}</em>
                </li>)}
              </ol>}
            </div>
            <form className="query-form" onSubmit={submitQuery}><label htmlFor="query">&gt;</label><input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Query the science computer about Earth..." /><button type="submit" disabled={isRetrieving}>{isRetrieving ? 'SEARCHING' : 'QUERY'}</button></form>
          </Panel>
        </section>
        <aside className="rail">
          <div className="rail-block">SURFACE &amp; WATER<i /></div>
          <Panel title="08 · SURFACE TEMPERATURE" qualifier="GLOBAL REFERENCE"><div className="temperature"><strong>{getReferenceValue('global_mean_surface_temperature', 'LOADING')}</strong><small>MEAN · GLOBAL SURFACE</small></div><div className="temperature-ramp"><i /></div><div className="data-grid compact-grid"><div><span>SEA SURFACE · CLIMATOLOGY</span><strong>{getReferenceValue('global_mean_sea_surface_temperature', 'LOADING')}</strong></div><div><span>ANOMALY · JUL 2026</span><strong>+{getReferenceValue('global_temperature_anomaly', 'LOADING')}</strong></div><div><span>MIN. AIR · 1983</span><strong>{getReferenceValue('minimum_near_surface_air_temperature', 'LOADING')}</strong></div><div><span>MAX. AIR · 1913</span><strong>{getReferenceValue('maximum_near_surface_air_temperature', 'LOADING')}</strong></div></div></Panel>
          <Panel title="09 · HYDROLOGY & ICE" qualifier="GLOBAL REFERENCE"><div className="data-grid"><div><span>SURFACE WATER</span><strong>{getPercentageReferenceValue('surface_water_fraction', 'LOADING')}</strong></div><div><span>ARCTIC SEA ICE · AUG 2026</span><strong>{getReferenceValue('arctic_sea_ice_extent', 'LOADING')}</strong></div><div><span>POLAR ICE LOSS · 2002–25</span><strong>{getReferenceValue('polar_ice_sheet_mass_loss_rate', 'LOADING')}</strong></div><div><span>ATMOSPHERIC WATER</span><strong>{getReferenceValue('atmospheric_water_volume', 'LOADING')}</strong></div></div></Panel>
          <Panel title="10 · TOPOGRAPHY &amp; BATHYMETRY" qualifier="GLOBAL REFERENCE"><div className="hypsometry-chart"><div className="hypsometry-y-axis" aria-hidden="true"><span>RELATIVE AREA</span><i /><i /><i /></div><div className="hypsometry-plot"><div className="profile" aria-label="Global relief distribution profile"><span className="sea-level">SEA LEVEL</span>{[18, 29, 43, 61, 76, 88, 94, 86, 69, 51, 35, 24, 20, 25, 37, 54, 66, 58, 42, 28, 17].map((height, index) => <i className={index < 12 ? 'profile-bar profile-bar--ocean' : 'profile-bar profile-bar--land'} key={index} style={{ height: `${height}%` }} />)}</div><div className="hypsometry-labels"><span>OCEAN BASINS</span><span>CONTINENTAL LAND</span></div><div className="hypsometry-axis"><span>−10 km</span><span>−5 km</span><span>0 km</span><span>+5 km</span><span>+9 km</span></div></div></div><div className="data-grid compact-grid"><div><span>OCEAN COVER</span><strong>{getPercentageReferenceValue('surface_water_fraction', 'LOADING')}</strong></div><div><span>LAND COVER</span><strong>{getPercentageReferenceValue('surface_land_fraction', 'LOADING')}</strong></div><div><span>MEAN OCEAN DEPTH</span><strong>{getReferenceValue('mean_ocean_depth', 'LOADING')}</strong></div><div><span>HIGHEST ELEVATION</span><strong>{getReferenceValue('highest_surface_elevation', 'LOADING')}</strong></div><div><span>DEEPEST OCEAN DEPTH</span><strong>{getReferenceValue('deepest_ocean_depth', 'LOADING')}</strong></div><div><span>TOTAL RELIEF</span><strong>{getReferenceValue('total_surface_relief', 'LOADING')}</strong></div></div></Panel>
          <div className="rail-block">GEOLOGY &amp; INTERIOR<i /></div>
          <Panel title="11 · BULK GEOCHEMISTRY" qualifier="MODEL ESTIMATE"><div className="bar-list geochemistry">{geochemistry.map(([label, field]) => <div key={field}><span>{label}</span><i><b style={{ width: getPercentageReferenceValue(field, '0%') }} /></i><strong>{getPercentageReferenceValue(field, 'LOADING')}</strong></div>)}</div></Panel>
          <Panel title="12 · VOLATILE INVENTORY" qualifier="REFERENCE ESTIMATES"><div className="volatile-list">{volatileInventory.map(({ label, totalField, reservoirs }) => <div key={label}><strong>{label}</strong><b>{totalField === 'atmospheric_nitrogen_fraction' ? getPercentageReferenceValue(totalField, 'LOADING') : getReferenceValue(totalField, 'LOADING')}</b><div className="reservoir-bar" aria-label={`${label} reservoir partition`}>{reservoirs.map(({ name, field, tone }) => <i className={`reservoir-segment reservoir-segment--${tone}`} key={name} style={{ width: getPercentageReferenceValue(field, '0%') }} />)}</div><div className="reservoir-legend">{reservoirs.map(({ name, field, tone }) => <span className={`reservoir-legend__item reservoir-legend__item--${tone}`} key={name}>{name} <b>{getPercentageReferenceValue(field, 'LOADING')}</b></span>)}</div></div>)}</div></Panel>
          <Panel title="13 · PLANETARY INTERIOR" qualifier="SEISMOLOGY · GEODYNAMICS"><div className="data-grid compact-grid planetary-interior">{planetaryInterior.map(([label, field]) => <div key={field}><span>{label}</span><strong>{getReferenceValue(field, 'LOADING')}</strong></div>)}</div></Panel>
          <div className="rail-block">ANOMALOUS DETECTION<i /></div>
          <Panel title="14 · DILITHIUM DETECTOR" qualifier="FICTIONAL ANALYSIS"><div className="state-line"><span>DEPOSIT STATUS</span><b className="status-chip">HIGH GRADE</b></div><div className="data-grid compact-grid"><div><span>LOCATION</span><strong>GREENLAND ICE SHEET</strong></div><div><span>HOST MATERIAL</span><strong>SUBGLACIAL BEDROCK</strong></div><div><span>SUBSURFACE DEPTH</span><strong>3.17 km</strong></div><div><span>EST. RESOURCE</span><strong>12.4 Mt</strong></div></div></Panel>
        </aside>
      </div>
    </main>
  )
}

export default App
