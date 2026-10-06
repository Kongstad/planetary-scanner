import { useEffect, useRef, useState } from 'react'
import './App.css'
import EarthViewer, { type ViewerMode } from './EarthViewer.tsx'
import LunaDashboard from './LunaDashboard.tsx'
import MarsDashboard from './MarsDashboard.tsx'
import Panel from './Panel.tsx'
import ScienceComputer from './ScienceComputer.tsx'
import SolDashboard from './SolDashboard.tsx'
import type { BodyId, ReferenceDataset, ReferenceFact } from './reference.ts'
import { IS_STATIC_DEMO, publicAssetUrl } from './runtime.ts'

type GroundedAnswer = {
  answer: string
  insufficient_evidence: boolean
  needs_clarification: boolean
}

const vitalStatistics: [label: string, field: string][] = [
  ['MEAN RADIUS', 'mean_radius'],
  ['MASS', 'mass'],
  ['EQUAT. GRAVITY', 'equatorial_surface_gravity'],
  ['ROTATION', 'rotation_period'],
  ['GEOM. ALBEDO', 'geometric_albedo'],
  ['SATELLITES', 'natural_satellite_count'],
]

const orbitalElements: [label: string, field: string][] = [
  ['Semi-major axis', 'semi_major_axis'],
  ['Eccentricity', 'orbital_eccentricity'],
  ['Orbital period', 'orbital_period'],
  ['Inclination', 'orbital_inclination'],
  ['Axial tilt', 'axial_tilt'],
  ['Escape velocity', 'equatorial_escape_velocity'],
]

const orbitalEnvironment: [label: string, field: string][] = [
  ['CATALOGUED OBJECTS', 'orbital_catalog_object_count'],
  ['ACTIVE SATELLITES', 'active_satellite_count'],
  ['ROCKET BODIES', 'orbital_rocket_body_count'],
  ['TRACKED DEBRIS', 'orbital_debris_count'],
]

const atmosphere: [
  label: string,
  fallback: string,
  width: number,
  field: string,
][] = [
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
  {
    label: 'CARBON C',
    totalField: 'carbon_reservoir_reference_total',
    reservoirs: [
      {
        name: 'ROCKS + SEDIMENTS',
        field: 'carbon_rocks_and_sediments_fraction',
        tone: 'soil',
      },
      { name: 'OCEAN DIC', field: 'carbon_ocean_fraction', tone: 'ocean' },
      {
        name: 'MOBILE RESERVOIRS',
        field: 'carbon_mobile_reservoirs_fraction',
        tone: 'biosphere',
      },
    ],
  },
  {
    label: 'WATER H₂O',
    totalField: 'water_inventory_total',
    reservoirs: [
      { name: 'OCEANS', field: 'water_ocean_fraction', tone: 'ocean' },
      { name: 'ICE + GLACIERS', field: 'water_ice_fraction', tone: 'ice' },
      {
        name: 'OTHER WATER',
        field: 'water_nonocean_fraction',
        tone: 'atmosphere',
      },
    ],
  },
  {
    label: 'DRY AIR',
    totalField: 'atmospheric_nitrogen_fraction',
    reservoirs: [
      {
        name: 'N₂',
        field: 'atmospheric_nitrogen_fraction',
        tone: 'atmosphere',
      },
      { name: 'O₂', field: 'atmospheric_oxygen_fraction', tone: 'ice' },
      {
        name: 'TRACE GASES',
        field: 'atmospheric_other_gases_fraction',
        tone: 'nitrate',
      },
    ],
  },
]

const bodyTabs = [
  { id: 'sol', label: 'SOL', designation: 'STAR' },
  { id: 'earth', label: 'EARTH', designation: 'SOL III' },
  { id: 'luna', label: 'LUNA', designation: 'EARTH I' },
  { id: 'mars', label: 'MARS', designation: 'SOL IV' },
] as const

function App() {
  const [referenceFacts, setReferenceFacts] = useState<ReferenceFact[]>([])
  const [referenceBodyId, setReferenceBodyId] = useState<BodyId | null>(null)
  const [isReferenceApiOnline, setIsReferenceApiOnline] = useState(false)
  const [isScienceComputerOnline, setIsScienceComputerOnline] = useState(false)
  const [totalReferenceRecords, setTotalReferenceRecords] = useState<
    number | null
  >(null)
  const [query, setQuery] = useState('')
  const [clarificationQuestion, setClarificationQuestion] = useState<
    string | null
  >(null)
  const [retrievalStatus, setRetrievalStatus] = useState(
    'Enter a question to generate a grounded answer from cited reference records.',
  )
  const [groundedAnswer, setGroundedAnswer] = useState<string | null>(null)
  const [isRetrieving, setIsRetrieving] = useState(false)
  const answerRequest = useRef<AbortController | null>(null)
  const [queryElapsedSeconds, setQueryElapsedSeconds] = useState(0)
  const [lastQueryElapsedSeconds, setLastQueryElapsedSeconds] = useState<
    number | null
  >(null)
  const [viewerMode, setViewerMode] = useState<ViewerMode>('imagery')
  const [depositFocusRequest, setDepositFocusRequest] = useState(0)
  const [scanCoverage, setScanCoverage] = useState('GLOBAL BASELINE')
  const [activeBody, setActiveBody] = useState<BodyId>('earth')
  const [missionClock, setMissionClock] = useState(() => new Date())
  const isActiveReferenceDatasetLoaded =
    isReferenceApiOnline && referenceBodyId === activeBody
  const activeReferenceRecordCount = isActiveReferenceDatasetLoaded
    ? referenceFacts.length
    : 0
  const scienceComputerQualifier = IS_STATIC_DEMO
    ? `LLM OFFLINE · ${totalReferenceRecords === null ? 'LOADING' : `${totalReferenceRecords.toLocaleString()} RECORDS`}`
    : isActiveReferenceDatasetLoaded &&
        isScienceComputerOnline &&
        typeof totalReferenceRecords === 'number'
      ? `OLLAMA · QWEN2.5:3B · MINILM-L6-V2 · ${totalReferenceRecords.toLocaleString()} RECORDS`
      : `OLLAMA · QWEN2.5:3B · MINILM-L6-V2 · ${activeReferenceRecordCount === 0 ? 'LOADING' : 'UNAVAILABLE'}`

  useEffect(() => {
    const clockIntervalId = window.setInterval(() => {
      setMissionClock(new Date())
    }, 1_000)
    return () => window.clearInterval(clockIntervalId)
  }, [])

  useEffect(() => {
    let isDisposed = false
    async function loadReferenceFacts() {
      try {
        const response = await fetch(
          IS_STATIC_DEMO
            ? publicAssetUrl(`demo/reference/${activeBody}.json`)
            : `/reference/bodies/${activeBody}`,
        )
        if (!response.ok) {
          throw new Error(`Reference API returned ${response.status}`)
        }
        const dataset = (await response.json()) as ReferenceDataset
        if (dataset.body_id !== activeBody) {
          throw new Error(
            `Reference API returned ${dataset.body_id} data for ${activeBody}`,
          )
        }
        if (!isDisposed) {
          setReferenceFacts(dataset.facts)
          setReferenceBodyId(dataset.body_id)
          setIsReferenceApiOnline(true)
        }
      } catch {
        if (!isDisposed) {
          setReferenceFacts([])
          setReferenceBodyId(null)
          setIsReferenceApiOnline(false)
        }
      }
    }

    void loadReferenceFacts()
    if (IS_STATIC_DEMO)
      return () => {
        isDisposed = true
      }
    const retryIntervalId = window.setInterval(() => {
      void loadReferenceFacts()
    }, 10_000)
    return () => {
      isDisposed = true
      window.clearInterval(retryIntervalId)
    }
  }, [activeBody])

  useEffect(() => {
    let isDisposed = false
    async function loadScienceComputerStatus() {
      try {
        const response = await fetch(
          IS_STATIC_DEMO
            ? publicAssetUrl('demo/status.json')
            : '/health/science-computer',
          {
            cache: 'no-store',
          },
        )
        if (!response.ok) {
          throw new Error(
            `Science Computer health check returned ${response.status}`,
          )
        }
        const status = (await response.json()) as {
          online: boolean
          reference_records: number
        }
        if (!isDisposed) {
          setIsScienceComputerOnline(status.online)
          setTotalReferenceRecords(status.reference_records ?? null)
        }
      } catch {
        if (!isDisposed) {
          setIsScienceComputerOnline(false)
        }
      }
    }

    void loadScienceComputerStatus()
    if (IS_STATIC_DEMO)
      return () => {
        isDisposed = true
      }
    const retryIntervalId = window.setInterval(() => {
      void loadScienceComputerStatus()
    }, 10_000)
    window.addEventListener('focus', loadScienceComputerStatus)
    return () => {
      isDisposed = true
      window.clearInterval(retryIntervalId)
      window.removeEventListener('focus', loadScienceComputerStatus)
    }
  }, [])

  useEffect(() => {
    if (!isRetrieving) {
      return
    }
    const startedAt = Date.now()
    const intervalId = window.setInterval(() => {
      setQueryElapsedSeconds((Date.now() - startedAt) / 1000)
    }, 100)
    return () => window.clearInterval(intervalId)
  }, [isRetrieving])

  function getReferenceValue(
    field: string,
    fallback: string,
    fractionDigits?: number,
  ): string {
    const fact = referenceFacts.find((candidate) => candidate.field === field)
    if (!fact) {
      return isReferenceApiOnline ? fallback : 'SYSTEMS OFFLINE'
    }
    const value =
      typeof fact.value === 'number' && fractionDigits !== undefined
        ? fact.value.toFixed(fractionDigits)
        : String(fact.value)
    if (!fact.unit || fact.unit === '1' || fact.unit === 'count') {
      return value
    }
    return `${value} ${fact.unit}`
  }

  function getPercentageReferenceValue(
    field: string,
    fallback: string,
  ): string {
    const fact = referenceFacts.find((candidate) => candidate.field === field)
    if (fact && typeof fact.value === 'number') {
      return `${(fact.value * 100).toFixed(1)}%`
    }
    return isReferenceApiOnline ? fallback : 'SYSTEMS OFFLINE'
  }

  function getCo2ScalePosition(): string {
    const fact = referenceFacts.find(
      (candidate) => candidate.field === 'global_marine_surface_carbon_dioxide',
    )
    if (!fact || typeof fact.value !== 'number') {
      return '0%'
    }
    return `${Math.min(100, Math.max(0, ((fact.value - 280) / 220) * 100))}%`
  }

  function selectBody(bodyId: BodyId) {
    if (bodyId === activeBody) {
      return
    }
    setActiveBody(bodyId)
    setDepositFocusRequest(0)
    answerRequest.current?.abort()
    answerRequest.current = null
    setIsRetrieving(false)
    setReferenceFacts([])
    setReferenceBodyId(null)
    setIsReferenceApiOnline(false)
    setQuery('')
    setClarificationQuestion(null)
    setGroundedAnswer(null)
    setRetrievalStatus(
      'Ask about Earth, Mars, the Moon, or the Sun, or compare all four bodies.',
    )
    setLastQueryElapsedSeconds(null)
  }

  function submitQuery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (IS_STATIC_DEMO || isRetrieving) return
    const question = query.trim()
    if (!question) {
      setRetrievalStatus(
        'Enter a question before querying the Science Computer.',
      )
      return
    }
    const startedAt = Date.now()
    const controller = new AbortController()
    answerRequest.current = controller
    setIsRetrieving(true)
    setQueryElapsedSeconds(0)
    setLastQueryElapsedSeconds(null)
    setGroundedAnswer(null)
    setRetrievalStatus(
      'Retrieving cited records and generating a grounded answer...',
    )
    const parameters = new URLSearchParams({
      question,
      body_id: activeBody,
      limit: '3',
    })
    if (clarificationQuestion)
      parameters.set('previous_question', clarificationQuestion)
    void fetch(`/answers/reference?${parameters}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Answer API returned ${response.status}`)
        }
        return response.json() as Promise<GroundedAnswer>
      })
      .then((response) => {
        if (answerRequest.current !== controller) return
        setGroundedAnswer(response.answer)
        setClarificationQuestion(response.needs_clarification ? question : null)
        setRetrievalStatus(
          response.insufficient_evidence
            ? 'The reference records do not support an answer to this question.'
            : '',
        )
      })
      .catch(() => {
        if (answerRequest.current !== controller) return
        setGroundedAnswer(null)
        setRetrievalStatus(
          'Grounded answering is unavailable. Start the local API and Ollama, then try again.',
        )
      })
      .finally(() => {
        if (answerRequest.current !== controller) return
        answerRequest.current = null
        const elapsedSeconds = (Date.now() - startedAt) / 1000
        setQueryElapsedSeconds(elapsedSeconds)
        setLastQueryElapsedSeconds(elapsedSeconds)
        setIsRetrieving(false)
      })
  }

  const scienceComputerProps = {
    scienceComputerQualifier,
    query,
    retrievalStatus,
    groundedAnswer,
    isRetrieving,
    queryElapsedSeconds,
    lastQueryElapsedSeconds,
    onQueryChange: setQuery,
    onSubmit: submitQuery,
  }

  return (
    <main className="console">
      <header className="console__header">
        <div className="wordmark">
          <strong>PLANETARY SCANNER</strong>
          <span>REMOTE SENSING SUITE · v0.1</span>
          <small className="wordmark__credit">
            Created by{' '}
            <a
              href="https://www.linkedin.com/in/p-kongstad/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Peter Kongstad
            </a>
          </small>
        </div>
        <div className="navigation-status">
          {bodyTabs.map(({ id, label, designation }) => (
            <button
              key={id}
              className={`body-tab ${activeBody === id ? 'body-tab--active' : ''}`}
              type="button"
              onClick={() => selectBody(id)}
            >
              <span
                className={`body-disc${id === 'earth' ? '' : ` body-disc--${id}`}`}
              />
              <span>
                {label}
                <small>{designation}</small>
              </span>
            </button>
          ))}
          <div className="mission-status">
            <div>
              <span>{IS_STATIC_DEMO ? 'REFERENCE DATA' : 'REFERENCE API'}</span>
              <strong
                className={
                  isReferenceApiOnline ? 'status-online' : 'status-offline'
                }
              >
                <i />
                {isReferenceApiOnline
                  ? IS_STATIC_DEMO
                    ? 'BUNDLED'
                    : 'ONLINE'
                  : IS_STATIC_DEMO
                    ? 'LOADING'
                    : 'OFFLINE'}
              </strong>
            </div>
            <div>
              <span>SCIENCE COMPUTER</span>
              <strong
                className={
                  IS_STATIC_DEMO
                    ? 'status-offline'
                    : isScienceComputerOnline
                      ? 'status-online'
                      : 'status-offline'
                }
              >
                {IS_STATIC_DEMO
                  ? totalReferenceRecords === null
                    ? 'LOADING'
                    : `${totalReferenceRecords.toLocaleString()} RECORDS · LLM OFFLINE`
                  : isScienceComputerOnline
                    ? totalReferenceRecords === null
                      ? 'LOADING'
                      : `${totalReferenceRecords.toLocaleString()} RECORDS`
                    : 'OFFLINE'}
              </strong>
            </div>
            <div>
              <span>MISSION CLOCK</span>
              <strong>{`${missionClock.toISOString().slice(11, 19)} UTC`}</strong>
            </div>
          </div>
        </div>
      </header>
      {activeBody === 'mars' ? (
        <MarsDashboard
          referenceFacts={isActiveReferenceDatasetLoaded ? referenceFacts : []}
          isReferenceApiOnline={isActiveReferenceDatasetLoaded}
          {...scienceComputerProps}
        />
      ) : activeBody === 'sol' ? (
        <SolDashboard
          referenceFacts={isActiveReferenceDatasetLoaded ? referenceFacts : []}
          isReferenceApiOnline={isActiveReferenceDatasetLoaded}
          {...scienceComputerProps}
        />
      ) : activeBody === 'luna' ? (
        <LunaDashboard
          referenceFacts={isActiveReferenceDatasetLoaded ? referenceFacts : []}
          isReferenceApiOnline={isActiveReferenceDatasetLoaded}
          {...scienceComputerProps}
        />
      ) : (
        <div className="console__main">
          <aside className="rail">
            <div className="rail-block">
              PLANETARY PROFILE
              <i />
            </div>
            <Panel title="01 · CLASSIFICATION" qualifier="CATALOG">
              <h1>EARTH</h1>
              <p className="designation">SOL III · TERRESTRIAL / SILICATE</p>
              <div className="data-grid">
                {vitalStatistics.map(([label, field]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{getReferenceValue(field, 'LOADING')}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="02 · ORBITAL ELEMENTS" qualifier="ORBIT & ROTATION">
              <dl className="data-list">
                {orbitalElements.map(([label, field]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{getReferenceValue(field, 'LOADING')}</dd>
                  </div>
                ))}
              </dl>
            </Panel>
            <div className="rail-block">
              ENVIRONMENT
              <i />
            </div>
            <Panel
              title="03 · ORBITAL ENVIRONMENT"
              qualifier="SATCAT · 2026-09-04"
            >
              <div className="data-grid compact-grid">
                {orbitalEnvironment.map(([label, field]) => (
                  <div key={field}>
                    <span>{label}</span>
                    <strong>{getReferenceValue(field, 'LOADING')}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="04 · MAGNETIC SHIELD" qualifier="GEOMAGNETIC">
              <div className="data-grid compact-grid magnetic-shield-grid">
                <div>
                  <span>FIELD ORIGIN</span>
                  <strong>
                    {getReferenceValue('magnetic_field_origin', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>SOLAR WIND</span>
                  <strong>
                    {getReferenceValue('solar_wind_deflection', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>ATMOSPHERE</span>
                  <strong>
                    {getReferenceValue('atmospheric_retention_role', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>AURORAL RESPONSE</span>
                  <strong>
                    {getReferenceValue('auroral_response', 'LOADING')}
                  </strong>
                </div>
              </div>
            </Panel>
            <Panel title="05 · ATMOSPHERE" qualifier="NEAR SURFACE">
              <div className="bar-list">
                {atmosphere.map(([label, fallback, weight, field]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>
                      {field === 'global_marine_surface_carbon_dioxide'
                        ? getReferenceValue(field, fallback)
                        : getPercentageReferenceValue(field, fallback)}
                    </strong>
                    <i>
                      <b style={{ width: `${weight}%` }} />
                    </i>
                  </div>
                ))}
              </div>
              <div className="co2-reference">
                <div className="co2-reference__heading">
                  <span>CO₂ CLIMATE REFERENCE</span>
                  <strong>
                    {getReferenceValue(
                      'global_marine_surface_carbon_dioxide',
                      'LOADING',
                    )}
                  </strong>
                </div>
                <div
                  className="co2-scale"
                  aria-label="Atmospheric carbon dioxide climate reference scale from 280 to 500 parts per million"
                >
                  <div className="co2-scale__band co2-scale__band--preindustrial">
                    PRE-IND.<small>280–350</small>
                  </div>
                  <div className="co2-scale__band co2-scale__band--elevated">
                    ELEVATED<small>350–400</small>
                  </div>
                  <div className="co2-scale__band co2-scale__band--forcing">
                    HIGH FORCING<small>400–450</small>
                  </div>
                  <div className="co2-scale__band co2-scale__band--extreme">
                    EXTREME<small>450+</small>
                  </div>
                  <i
                    className="co2-scale__marker"
                    style={{ left: getCo2ScalePosition() }}
                    aria-hidden="true"
                  />
                </div>
                <p>GLOBAL MARINE SURFACE · MAY 2026 · NOAA GML</p>
              </div>
            </Panel>
            <div className="rail-block">
              LIFE
              <i />
            </div>
            <Panel title="06 · BIOSPHERE" qualifier="GLOBAL OBSERVABLES">
              <div className="biosphere-status">
                <strong>CONFIRMED</strong>
                <span>FOREST + OCEAN + ATMOSPHERE</span>
              </div>
              <div className="data-grid compact-grid biosphere-observations">
                {biosphereObservations.map(([label, field]) => (
                  <div key={field}>
                    <span>{label}</span>
                    <strong>{getReferenceValue(field, 'LOADING')}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="07 · CIVILISATION" qualifier="REFERENCE + SCENARIO">
              <h2 className="group-title">REFERENCE</h2>
              <div className="data-grid compact-grid civilisation-reference">
                {civilisationReference.map(([label, field]) => (
                  <div key={field}>
                    <span>{label}</span>
                    <strong>
                      {getReferenceValue(
                        field,
                        'LOADING',
                        field === 'catalogued_eukaryotic_species'
                          ? 1
                          : undefined,
                      )}
                    </strong>
                  </div>
                ))}
              </div>
              <h2 className="group-title">FICTIONAL SCENARIO</h2>
              <div className="data-grid civilisation-scenario">
                <div>
                  <span>SUSTAINABILITY</span>
                  <strong className="status-chip status-chip--undetermined">
                    UNDETERMINED
                  </strong>
                </div>
                <div>
                  <span>CONTACT POSTURE</span>
                  <strong className="status-chip status-chip--defensive">
                    DEFENSIVE
                  </strong>
                </div>
                <div>
                  <span>PRIME DIRECTIVE</span>
                  <strong>ACTIVE · AVOID CONTACT</strong>
                </div>
              </div>
            </Panel>
          </aside>
          <section className="center-column">
            <section className="viewer-shell">
              <header className="viewer-shell__header">
                <span>PRIMARY VIEWER</span>
                <div className="layer-chips">
                  <button
                    className={
                      viewerMode === 'imagery' ? 'layer-chip--active' : ''
                    }
                    type="button"
                    onClick={() => setViewerMode('imagery')}
                  >
                    IMAGERY
                  </button>
                  {!IS_STATIC_DEMO && (
                    <button
                      className={
                        viewerMode === 'terrain' ? 'layer-chip--active' : ''
                      }
                      type="button"
                      onClick={() => setViewerMode('terrain')}
                    >
                      TERRAIN
                    </button>
                  )}
                  <button
                    className={
                      viewerMode === 'relief' ? 'layer-chip--active' : ''
                    }
                    type="button"
                    onClick={() => setViewerMode('relief')}
                  >
                    RELIEF
                  </button>
                  <button
                    className={
                      viewerMode === 'biosphere' ? 'layer-chip--active' : ''
                    }
                    type="button"
                    onClick={() => setViewerMode('biosphere')}
                  >
                    BIOSPHERE
                  </button>
                  <button
                    className={
                      viewerMode === 'thermal' ? 'layer-chip--active' : ''
                    }
                    type="button"
                    onClick={() => setViewerMode('thermal')}
                  >
                    THERMAL
                  </button>
                </div>
                <span>PROJ · GEODETIC WGS-84</span>
              </header>
              <EarthViewer
                mode={viewerMode}
                depositFocusRequest={depositFocusRequest}
                onCoverageChange={setScanCoverage}
              />
              <footer className="telemetry">
                <span>
                  PHASE ANGLE<strong>38.00°</strong>
                </span>
                <span>
                  SUB-SPACECRAFT<strong>17.02° / −59.12°</strong>
                </span>
                <span>
                  DOWNLINK<strong>UNAVAILABLE</strong>
                </span>
                <span>
                  SOLAR ILLUM.<strong>72%</strong>
                </span>
                <span>
                  SCAN COVERAGE<strong>{scanCoverage}</strong>
                </span>
              </footer>
            </section>
            <ScienceComputer bodyId="earth" {...scienceComputerProps} />
          </section>
          <aside className="rail">
            <div className="rail-block">
              SURFACE &amp; WATER
              <i />
            </div>
            <Panel
              title="08 · SURFACE TEMPERATURE"
              qualifier="GLOBAL REFERENCE"
            >
              <div className="temperature">
                <strong>
                  {getReferenceValue(
                    'global_mean_surface_temperature',
                    'LOADING',
                  )}
                </strong>
                <small>MEAN · GLOBAL SURFACE</small>
              </div>
              <div className="temperature-ramp">
                <i />
              </div>
              <div className="data-grid compact-grid">
                <div>
                  <span>SEA SURFACE · CLIMATOLOGY</span>
                  <strong>
                    {getReferenceValue(
                      'global_mean_sea_surface_temperature',
                      'LOADING',
                    )}
                  </strong>
                </div>
                <div>
                  <span>ANOMALY · JUL 2026</span>
                  <strong>
                    +
                    {getReferenceValue('global_temperature_anomaly', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>MIN. AIR · 1983</span>
                  <strong>
                    {getReferenceValue(
                      'minimum_near_surface_air_temperature',
                      'LOADING',
                    )}
                  </strong>
                </div>
                <div>
                  <span>MAX. AIR · 1913</span>
                  <strong>
                    {getReferenceValue(
                      'maximum_near_surface_air_temperature',
                      'LOADING',
                    )}
                  </strong>
                </div>
              </div>
            </Panel>
            <Panel title="09 · HYDROLOGY & ICE" qualifier="GLOBAL REFERENCE">
              <div className="data-grid">
                <div>
                  <span>SURFACE WATER</span>
                  <strong>
                    {getPercentageReferenceValue(
                      'surface_water_fraction',
                      'LOADING',
                    )}
                  </strong>
                </div>
                <div>
                  <span>ARCTIC SEA ICE · AUG 2026</span>
                  <strong>
                    {getReferenceValue('arctic_sea_ice_extent', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>POLAR ICE LOSS · 2002–25</span>
                  <strong>
                    {getReferenceValue(
                      'polar_ice_sheet_mass_loss_rate',
                      'LOADING',
                    )}
                  </strong>
                </div>
                <div>
                  <span>ATMOSPHERIC WATER</span>
                  <strong>
                    {getReferenceValue('atmospheric_water_volume', 'LOADING')}
                  </strong>
                </div>
              </div>
            </Panel>
            <Panel
              title="10 · TOPOGRAPHY &amp; BATHYMETRY"
              qualifier="GLOBAL REFERENCE"
            >
              <div className="hypsometry-chart">
                <div className="hypsometry-y-axis" aria-hidden="true">
                  <span>RELATIVE AREA</span>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="hypsometry-plot">
                  <div
                    className="profile"
                    aria-label="Global relief distribution profile"
                  >
                    <span className="sea-level">SEA LEVEL</span>
                    {[
                      18, 29, 43, 61, 76, 88, 94, 86, 69, 51, 35, 24, 20, 25,
                      37, 54, 66, 58, 42, 28, 17,
                    ].map((height, index) => (
                      <i
                        className={
                          index < 12
                            ? 'profile-bar profile-bar--ocean'
                            : 'profile-bar profile-bar--land'
                        }
                        key={index}
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                  <div className="hypsometry-labels">
                    <span>OCEAN BASINS</span>
                    <span>CONTINENTAL LAND</span>
                  </div>
                  <div className="hypsometry-axis">
                    <span>−10 km</span>
                    <span>−5 km</span>
                    <span>0 km</span>
                    <span>+5 km</span>
                    <span>+9 km</span>
                  </div>
                </div>
              </div>
              <div className="data-grid compact-grid">
                <div>
                  <span>OCEAN COVER</span>
                  <strong>
                    {getPercentageReferenceValue(
                      'surface_water_fraction',
                      'LOADING',
                    )}
                  </strong>
                </div>
                <div>
                  <span>LAND COVER</span>
                  <strong>
                    {getPercentageReferenceValue(
                      'surface_land_fraction',
                      'LOADING',
                    )}
                  </strong>
                </div>
                <div>
                  <span>MEAN OCEAN DEPTH</span>
                  <strong>
                    {getReferenceValue('mean_ocean_depth', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>HIGHEST ELEVATION</span>
                  <strong>
                    {getReferenceValue('highest_surface_elevation', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>DEEPEST OCEAN DEPTH</span>
                  <strong>
                    {getReferenceValue('deepest_ocean_depth', 'LOADING')}
                  </strong>
                </div>
                <div>
                  <span>TOTAL RELIEF</span>
                  <strong>
                    {getReferenceValue('total_surface_relief', 'LOADING')}
                  </strong>
                </div>
              </div>
            </Panel>
            <div className="rail-block">
              GEOLOGY &amp; INTERIOR
              <i />
            </div>
            <Panel
              title="11 · BULK GEOCHEMISTRY"
              qualifier="WHOLE-PLANET MODEL · WT%"
            >
              <div className="bar-list geochemistry">
                {geochemistry.map(([label, field]) => (
                  <div key={field}>
                    <span>{label}</span>
                    <i>
                      <b
                        style={{
                          width: getPercentageReferenceValue(field, '0%'),
                        }}
                      />
                    </i>
                    <strong>
                      {getPercentageReferenceValue(field, 'LOADING')}
                    </strong>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              title="12 · VOLATILE INVENTORY"
              qualifier="REFERENCE ESTIMATES"
            >
              <div className="volatile-list">
                {volatileInventory.map(({ label, totalField, reservoirs }) => (
                  <div key={label}>
                    <strong>{label}</strong>
                    <b>
                      {totalField === 'atmospheric_nitrogen_fraction'
                        ? getPercentageReferenceValue(totalField, 'LOADING')
                        : getReferenceValue(totalField, 'LOADING')}
                    </b>
                    <div
                      className="reservoir-bar"
                      aria-label={`${label} reservoir partition`}
                    >
                      {reservoirs.map(({ name, field, tone }) => (
                        <i
                          className={`reservoir-segment reservoir-segment--${tone}`}
                          key={name}
                          style={{
                            width: getPercentageReferenceValue(field, '0%'),
                          }}
                        />
                      ))}
                    </div>
                    <div className="reservoir-legend">
                      {reservoirs.map(({ name, field, tone }) => (
                        <span
                          className={`reservoir-legend__item reservoir-legend__item--${tone}`}
                          key={name}
                        >
                          {name}{' '}
                          <b>{getPercentageReferenceValue(field, 'LOADING')}</b>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel
              title="13 · PLANETARY INTERIOR"
              qualifier="SEISMOLOGY · GEODYNAMICS"
            >
              <div className="data-grid compact-grid planetary-interior">
                {planetaryInterior.map(([label, field]) => (
                  <div key={field}>
                    <span>{label}</span>
                    <strong>{getReferenceValue(field, 'LOADING')}</strong>
                  </div>
                ))}
              </div>
            </Panel>
            <div className="rail-block">
              ANOMALOUS DETECTION
              <i />
            </div>
            <Panel
              title="14 · DILITHIUM DETECTOR"
              qualifier="FICTIONAL ANALYSIS"
            >
              <div className="state-line">
                <span>DEPOSIT STATUS</span>
                <b className="status-chip">HIGH GRADE</b>
              </div>
              <div className="data-grid compact-grid">
                <div>
                  <span>LOCATION</span>
                  <strong>GREENLAND ICE SHEET</strong>
                </div>
                <div>
                  <span>HOST MATERIAL</span>
                  <strong>SUBGLACIAL BEDROCK</strong>
                </div>
                <div>
                  <span>SUBSURFACE DEPTH</span>
                  <strong>3.17 km</strong>
                </div>
                <div>
                  <span>EST. RESOURCE</span>
                  <strong>12.4 Mt</strong>
                </div>
                <div>
                  <span>EST. DEPOSIT AREA</span>
                  <strong>12,000 km²</strong>
                </div>
                <div>
                  <span>DENSITY MODEL</span>
                  <strong>HIGH · CENTRALIZED</strong>
                </div>
              </div>
              <button
                className="deposit-focus-button"
                type="button"
                onClick={() => setDepositFocusRequest((request) => request + 1)}
              >
                VIEW DILITHIUM DEPOSIT
              </button>
            </Panel>
          </aside>
        </div>
      )}
    </main>
  )
}

export default App
