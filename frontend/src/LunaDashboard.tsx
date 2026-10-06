import { useState } from 'react'
import ElevationProfile from './ElevationProfile.tsx'
import LunaViewer, { type LunaViewerMode } from './LunaViewer.tsx'
import Panel from './Panel.tsx'
import type { ReferenceFact } from './reference.ts'
import ScienceComputer, {
  type ScienceComputerProps,
} from './ScienceComputer.tsx'

type LunarPanel = {
  title: string
  qualifier: string
  entries: [label: string, field: string][]
  group?: string
}

const leftPanels: LunarPanel[] = [
  {
    title: '01 · CLASSIFICATION',
    qualifier: 'CATALOG',
    entries: [
      ['MEAN RADIUS', 'mean_radius'],
      ['MASS', 'mass'],
      ['SURFACE GRAVITY', 'surface_gravity'],
      ['ROTATION', 'rotation_period'],
      ['GEOM. ALBEDO', 'geometric_albedo'],
      ['MEAN DENSITY', 'mean_density'],
    ],
  },
  {
    title: '02 · ORBITAL ELEMENTS',
    qualifier: 'EARTH-CENTRED',
    entries: [
      ['SEMI-MAJOR AXIS', 'semi_major_axis'],
      ['ECCENTRICITY', 'orbital_eccentricity'],
      ['ORBITAL PERIOD', 'orbital_period'],
      ['INCLINATION', 'orbital_inclination'],
      ['PHASE CYCLE', 'synodic_period'],
      ['ESCAPE VELOCITY', 'escape_velocity'],
    ],
  },
  {
    title: '03 · ORBITAL ENVIRONMENT',
    qualifier: 'LRO · MISSION RECORD',
    group: 'ENVIRONMENT',
    entries: [
      ['LRO LAUNCH', 'lro_launch_date'],
      ['LUNAR ORBIT ENTRY', 'lro_orbit_insertion'],
      ['IMAGING', 'lro_imaging_instrument'],
      ['TOPOGRAPHY', 'lro_topography_instrument'],
    ],
  },
  {
    title: '04 · MAGNETIC SHIELD',
    qualifier: 'REMANENT CRUSTAL FIELD',
    entries: [
      ['GLOBAL FIELD', 'global_magnetic_field'],
      ['CRUSTAL FIELDS', 'crustal_magnetic_fields'],
      ['SOLAR WIND', 'solar_wind_exposure'],
      ['RADIATION SOURCES', 'radiation_environment'],
    ],
  },
  {
    title: '05 · EXOSPHERE',
    qualifier: 'THIN & VARIABLE',
    entries: [
      ['ATMOSPHERE TYPE', 'exosphere_type'],
      ['MAJOR SPECIES', 'exosphere_major_species'],
      ['TRACE SPECIES', 'exosphere_trace_species'],
      ['NIGHT PRESSURE · EST.', 'night_surface_pressure'],
    ],
  },
  {
    title: '06 · BIOSPHERE',
    qualifier: 'CURRENT ASSESSMENT',
    group: 'LIFE',
    entries: [
      ['SURFACE COVER', 'surface_cover'],
      ['BENEATH REGOLITH', 'subsurface_material'],
      ['SURFACE MIXING', 'surface_renewal'],
      ['NATIVE LIFE', 'current_life_status'],
    ],
  },
  {
    title: '07 · HUMAN EXPLORATION',
    qualifier: 'APOLLO RECORD',
    entries: [
      ['APOLLO SURFACE VISITS', 'apollo_landing_count'],
      ['RETURNED MATERIAL', 'apollo_sample_mass'],
      ['COLLECTED SAMPLES', 'apollo_sample_count'],
      ['SURFACE ARTIFACTS', 'surface_artifacts'],
    ],
  },
]

const rightPanels: LunarPanel[] = [
  {
    title: '08 · SURFACE TEMPERATURE',
    qualifier: 'LOCAL CONDITIONS',
    entries: [
      ['FULL SUN · APPROX.', 'sunlit_temperature'],
      ['DARKNESS · APPROX.', 'dark_temperature'],
    ],
  },
  {
    title: '09 · HYDROLOGY & ICE',
    qualifier: 'LOCAL DETECTIONS',
    entries: [
      ['POLAR ICE', 'polar_water'],
      ['LCROSS · CABEUS', 'lcross_water_detection'],
      ['SUNLIT WATER SITE', 'sunlit_water_site'],
      ['CLAVIUS · LOCAL', 'sunlit_water_abundance'],
    ],
  },
  {
    title: '10 · TOPOGRAPHY & RELIEF',
    qualifier: 'LUNAR TERRAIN',
    entries: [
      ['BRIGHT TERRAIN', 'highlands'],
      ['DARK TERRAIN', 'maria'],
      ['SPA DIAMETER', 'spa_diameter'],
      ['SPA DEPTH · APPROX.', 'spa_depth'],
    ],
  },
  {
    title: '11 · BULK GEOCHEMISTRY',
    qualifier: 'SILICATE MODEL · WT%',
    group: 'GEOLOGY & INTERIOR',
    entries: [
      ['SILICA SiO₂', 'bulk_silicate_silica_fraction'],
      ['MAGNESIA MgO', 'bulk_silicate_magnesia_fraction'],
      ['IRON OX. FeO', 'bulk_silicate_iron_oxide_fraction'],
      ['ALUMINA Al₂O₃', 'bulk_silicate_alumina_fraction'],
      ['LIME CaO', 'bulk_silicate_lime_fraction'],
      ['TITANIA TiO₂', 'bulk_silicate_titania_fraction'],
    ],
  },
  {
    title: '12 · VOLATILE INVENTORY',
    qualifier: 'RESERVOIRS & SUPPLY',
    entries: [
      ['HYDROGEN SUPPLY', 'solar_wind_hydrogen'],
      ['OXYGEN RESERVOIR', 'oxygen_reservoir'],
      ['HYDROXYL FORMATION', 'hydroxyl_formation'],
      ['CABEUS CLOUD SPECIES', 'lcross_other_volatiles'],
    ],
  },
  {
    title: '13 · LUNAR INTERIOR',
    qualifier: 'INFERRED STRUCTURE',
    entries: [
      ['SOLID INNER CORE · R.', 'inner_core_radius'],
      ['LIQUID IRON SHELL · THICKNESS', 'liquid_core_shell_thickness'],
      ['CORE SURROUNDINGS', 'lower_mantle_state'],
      ['MEAN CRUST · GRAIL MODEL', 'grail_mean_crust_thickness'],
    ],
  },
  {
    title: '14 · LUNAR SWIRLS',
    qualifier: 'OBSERVED FEATURES',
    group: 'SURFACE FEATURES',
    entries: [
      ['EXAMPLE', 'lunar_swirl_example'],
      ['MAGNETIC ASSOCIATION', 'swirl_association'],
    ],
  },
]

function formatFact(fact: ReferenceFact): string {
  if (typeof fact.value === 'string') return fact.value
  if (fact.unit === '1') return String(fact.value)
  const value =
    Math.abs(fact.value) >= 1e9 ||
    (fact.value !== 0 && Math.abs(fact.value) < 0.0001)
      ? fact.value
          .toExponential()
          .replace('e+', ' × 10^')
          .replace('e-', ' × 10^−')
      : fact.value.toLocaleString('en-US', { maximumFractionDigits: 5 })
  return `${value}${fact.unit && fact.unit !== 'count' ? ` ${fact.unit === 'deg' ? '°' : fact.unit}` : ''}`
}

function FactPanel({
  panel,
  facts,
  online,
}: {
  panel: LunarPanel
  facts: ReferenceFact[]
  online: boolean
}) {
  const panelNumber = panel.title.slice(0, 2)
  const referenceValue = (field: string) => {
    const fact = facts.find((candidate) => candidate.field === field)
    return fact
      ? formatFact(fact)
      : online
        ? 'REFERENCE PENDING'
        : 'SYSTEMS OFFLINE'
  }
  return (
    <>
      {panel.group && (
        <div className="rail-block">
          {panel.group}
          <i />
        </div>
      )}
      <Panel
        title={panel.title}
        qualifier={panel.qualifier}
        className={`luna-panel luna-panel--${panelNumber}`}
      >
        {panelNumber === '01' && (
          <>
            <h1>LUNA</h1>
            <p className="designation">EARTH I · ROCKY NATURAL SATELLITE</p>
          </>
        )}
        {panelNumber === '06' && (
          <div className="biosphere-status biosphere-status--unconfirmed">
            <strong>NOT DETECTED</strong>
            <span>NO KNOWN NATIVE LIFE</span>
          </div>
        )}
        {panelNumber === '08' && (
          <>
            <div className="temperature">
              <strong>
                {referenceValue('dark_temperature')} to{' '}
                {referenceValue('sunlit_temperature')}
              </strong>
              <small>DARK / SUNLIT</small>
            </div>
            <div
              className="temperature-ramp mars-temperature-ramp"
              role="img"
              aria-label="Surface temperature scale: blue for cold, red for warm"
            />
          </>
        )}
        {panelNumber === '10' && (
          <ElevationProfile
            className="luna-elevation-profile"
            heading="BASINS TO HIGHLANDS"
            qualifier="SCHEMATIC"
            description="Illustrative lunar terrain profile from impact basins through maria to highlands; not measured elevation data"
            heights={[
              20, 26, 33, 31, 25, 34, 39, 43, 42, 45, 51, 60, 72, 82, 92, 85,
              76,
            ]}
            labels={['LOWLANDS', 'HIGHLANDS']}
            axis={['IMPACT BASINS', 'MARIA', 'CRATER RIMS']}
          />
        )}
        {panelNumber === '11' ? (
          <>
            <div className="bar-list geochemistry luna-geochemistry">
              {panel.entries.map(([label, field]) => {
                const fact = facts.find(
                  (candidate) => candidate.field === field,
                )
                const value =
                  typeof fact?.value === 'number' ? fact.value : null
                return (
                  <div
                    key={field}
                    title={
                      fact
                        ? `${fact.source_locator}. Scope: ${fact.scope}.`
                        : undefined
                    }
                  >
                    <span>{label}</span>
                    <i>
                      <b style={{ width: `${value ?? 0}%` }} />
                    </i>
                    <strong>{referenceValue(field)}</strong>
                  </div>
                )
              })}
            </div>
            <div className="luna-geochemistry__scope">
              WARREN 2005 · MANTLE + CRUST · CORE EXCLUDED
            </div>
          </>
        ) : (
          <div
            className={`data-grid compact-grid${['01', '02', '07'].includes(panelNumber) ? '' : ' magnetic-shield-grid'}`}
          >
            {panel.entries.map(([label, field]) => {
              const fact = facts.find((candidate) => candidate.field === field)
              return (
                <div
                  key={field}
                  title={
                    fact
                      ? `Reference date: ${fact.as_of}. Scope: ${fact.scope}. Source: ${fact.source_locator}.`
                      : undefined
                  }
                >
                  <span>{label}</span>
                  <strong>{referenceValue(field)}</strong>
                </div>
              )
            })}
          </div>
        )}
      </Panel>
    </>
  )
}

function LunaDashboard({
  referenceFacts,
  isReferenceApiOnline,
  ...scienceComputerProps
}: ScienceComputerProps & {
  referenceFacts: ReferenceFact[]
  isReferenceApiOnline: boolean
}) {
  const [viewerMode, setViewerMode] = useState<LunaViewerMode>('imagery')
  const [scanCoverage, setScanCoverage] = useState('LOADING LUNAR TILES')
  const [cameraAltitude, setCameraAltitude] = useState('6,000 KM')

  return (
    <div className="console__main luna-console">
      <aside className="rail">
        <div className="rail-block">
          PLANETARY PROFILE
          <i />
        </div>
        {leftPanels.map((panel) => (
          <FactPanel
            key={panel.title}
            panel={panel}
            facts={referenceFacts}
            online={isReferenceApiOnline}
          />
        ))}
      </aside>

      <section className="center-column">
        <section className="viewer-shell">
          <header className="viewer-shell__header">
            <span>PRIMARY VIEWER</span>
            <div className="layer-chips">
              {(['imagery', 'relief'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={viewerMode === mode ? 'layer-chip--active' : ''}
                  aria-pressed={viewerMode === mode}
                  onClick={() => setViewerMode(mode)}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
            <span>PROJ · SELENOCENTRIC</span>
          </header>
          <LunaViewer
            mode={viewerMode}
            onCameraAltitudeChange={setCameraAltitude}
            onCoverageChange={setScanCoverage}
          />
          <footer className="telemetry">
            <span>
              BODY<strong>MOON</strong>
            </span>
            <span>
              ALTITUDE<strong>{cameraAltitude}</strong>
            </span>
            <span>
              LAYER<strong>{viewerMode.toUpperCase()}</strong>
            </span>
            <span>
              RESOLUTION<strong>USGS WMS</strong>
            </span>
            <span>
              TILE COVERAGE<strong>{scanCoverage}</strong>
            </span>
          </footer>
        </section>
        <ScienceComputer bodyId="luna" {...scienceComputerProps} />
      </section>

      <aside className="rail">
        <div className="rail-block">
          SURFACE &amp; WATER
          <i />
        </div>
        {rightPanels.map((panel) => (
          <FactPanel
            key={panel.title}
            panel={panel}
            facts={referenceFacts}
            online={isReferenceApiOnline}
          />
        ))}
      </aside>
    </div>
  )
}

export default LunaDashboard
