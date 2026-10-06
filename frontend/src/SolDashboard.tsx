import { useState } from 'react'
import Panel from './Panel.tsx'
import ScienceComputer, {
  type ScienceComputerProps,
} from './ScienceComputer.tsx'
import SolGlobeViewer from './SolGlobeViewer.tsx'
import SolViewer, {
  type SolarTelemetry,
  type SolViewerMode,
} from './SolViewer.tsx'
import type { ReferenceFact } from './reference.ts'
import { solarGlobeMap } from './solarGlobeMap.ts'

type SolDashboardProps = ScienceComputerProps & {
  referenceFacts: ReferenceFact[]
  isReferenceApiOnline: boolean
}

type FactEntry = [label: string, field: string]

const TEMPERATURE_SCALE_MIN_C = -200
const TEMPERATURE_SCALE_MAX_C = 6000
const SPECTRAL_CLASSES = [
  ['O', '#8cb6ff'],
  ['B', '#bfd4ff'],
  ['A', '#edf2ff'],
  ['F', '#fff3c6'],
  ['G', '#f4cf65'],
  ['K', '#eca85d'],
  ['M', '#d97158'],
] as const
const COMPOSITION: [label: string, field: string, ppm: boolean][] = [
  ['HYDROGEN H', 'hydrogen_number_fraction', false],
  ['HELIUM He', 'helium_number_fraction', false],
  ['OXYGEN O', 'oxygen_abundance', true],
  ['CARBON C', 'carbon_abundance', true],
  ['NEON Ne', 'neon_abundance', true],
  ['NITROGEN N', 'nitrogen_abundance', true],
]

function formatSolarFact(fact: ReferenceFact): string {
  const isKelvin = typeof fact.value === 'number' && fact.unit === 'K'
  const value = isKelvin ? Number(fact.value) - 273.15 : fact.value
  const unit = isKelvin ? '°C' : fact.unit
  let text = String(value)
  if (typeof value === 'number') {
    text =
      Math.abs(value) >= 1e10
        ? value.toExponential(4).replace(/\.0+(?=e)/, '')
        : value.toLocaleString('en-US', {
            maximumFractionDigits: isKelvin ? 0 : 4,
          })
  }
  return `${text}${unit ? ` ${unit}` : ''}`
}

function SolDashboard({
  referenceFacts,
  isReferenceApiOnline,
  ...scienceComputerProps
}: SolDashboardProps) {
  const [mode, setMode] = useState<SolViewerMode>('euv')
  const [viewMode, setViewMode] = useState<'globe' | 'disk'>('globe')
  const [cameraAltitude, setCameraAltitude] = useState('2,261,025 KM')
  const [telemetry, setTelemetry] = useState<SolarTelemetry>({
    observedAt: 'LOADING',
    instrument: 'SDO',
    resolution: 'NATIVE IMAGE',
  })
  const activeTelemetry =
    viewMode === 'globe'
      ? {
          observedAt: solarGlobeMap.period,
          instrument: `${solarGlobeMap.wavelength} · CR ${solarGlobeMap.carringtonRotation}`,
          resolution: `${solarGlobeMap.width.toLocaleString('en-US')} × ${solarGlobeMap.height.toLocaleString('en-US')} PX · MAP`,
        }
      : telemetry
  const factsByField = new Map(referenceFacts.map((fact) => [fact.field, fact]))
  const value = (field: string) => {
    const fact = factsByField.get(field)
    return fact
      ? formatSolarFact(fact)
      : isReferenceApiOnline
        ? 'REFERENCE PENDING'
        : 'SYSTEMS OFFLINE'
  }
  const numeric = (field: string) => {
    const number = factsByField.get(field)?.value
    return typeof number === 'number' ? number : 0
  }
  const temperaturePosition = Math.min(
    100,
    Math.max(
      0,
      ((numeric('effective_temperature') - 273.15 - TEMPERATURE_SCALE_MIN_C) /
        (TEMPERATURE_SCALE_MAX_C - TEMPERATURE_SCALE_MIN_C)) *
        100,
    ),
  )
  const facts = (entries: FactEntry[], compact = false) => (
    <div
      className={`data-grid compact-grid${compact ? ' magnetic-shield-grid' : ''}`}
    >
      {entries.map(([label, field], index) => (
        <div
          key={field}
          className={
            entries.length % 2 !== 0 && index === entries.length - 1
              ? 'data-grid__wide'
              : undefined
          }
        >
          <span>{label}</span>
          <strong>{value(field)}</strong>
        </div>
      ))}
    </div>
  )
  const section = (
    title: string,
    qualifier: string,
    entries: FactEntry[],
    compact = false,
  ) => (
    <Panel title={title} qualifier={qualifier}>
      {facts(entries, compact)}
    </Panel>
  )

  return (
    <div className="console__main">
      <aside className="rail">
        <div className="rail-block">
          STELLAR PROFILE
          <i />
        </div>
        <Panel title="01 · CLASSIFICATION" qualifier="CATALOG">
          <h1>SOL</h1>
          <p className="designation">SUN · G2 V / MAIN SEQUENCE</p>
          {facts([
            ['MEAN RADIUS', 'mean_radius'],
            ['MASS', 'mass'],
            ['EQUAT. GRAVITY', 'equatorial_surface_gravity'],
            ['MEAN DENSITY', 'mean_density'],
            ['SPECTRAL CLASS', 'spectral_type'],
            ['AGE', 'age'],
          ])}
        </Panel>
        {section('02 · ORBIT & ROTATION', 'DIFFERENTIAL ROTATION', [
          ['EQUATOR · APPROX.', 'equatorial_rotation'],
          ['POLES · APPROX.', 'polar_rotation'],
          ['AXIAL TILT', 'axial_tilt'],
          ['GALACTIC ORBIT', 'galactic_orbital_period'],
          ['GALACTIC SPEED', 'galactic_speed'],
          ['GALACTIC LOCATION', 'galactic_location'],
        ])}
        <div className="rail-block">
          ENVIRONMENT
          <i />
        </div>
        <Panel
          title="03 · OBSERVATION"
          qualifier={
            viewMode === 'globe' ? 'SDO / SYNOPTIC MAP' : 'SDO / HELIOVIEWER'
          }
        >
          <div className="data-grid compact-grid magnetic-shield-grid">
            <div>
              <span>INSTRUMENT / BAND</span>
              <strong>{activeTelemetry.instrument}</strong>
            </div>
            <div>
              <span>
                {viewMode === 'globe' ? 'MAP DETAIL' : 'NATIVE SCALE'}
              </span>
              <strong>{activeTelemetry.resolution}</strong>
            </div>
            <div>
              <span>MEAN EARTH DISTANCE</span>
              <strong>{value('earth_mean_distance')}</strong>
            </div>
            <div>
              <span>DISK AT 1 AU</span>
              <strong>{value('apparent_diameter')}</strong>
            </div>
            <div className="data-grid__wide">
              <span>
                {viewMode === 'globe'
                  ? 'ROTATION COMPOSITE · DATE RANGE'
                  : 'ACTUAL OBSERVATION · UTC'}
              </span>
              <strong>{activeTelemetry.observedAt}</strong>
            </div>
          </div>
        </Panel>
        {section(
          '04 · MAGNETIC FIELD',
          'TYPICAL FIELD STRENGTHS',
          [
            ['POLAR FIELD', 'polar_field'],
            ['SUNSPOTS', 'sunspot_field'],
            ['PROMINENCES', 'prominence_field'],
            ['CHROMOSPHERIC PLAGE', 'plage_field'],
          ],
          true,
        )}
        {section('05 · SOLAR ATMOSPHERE', 'REFERENCE LAYERS', [
          ['PHOTOSPHERE DEPTH', 'photosphere_thickness'],
          ['CHROMOSPHERE DEPTH', 'chromosphere_thickness'],
          ['PRESSURE · OPTICAL τ=1', 'photosphere_pressure'],
          ['CHROMOSPHERE TOP', 'chromosphere_top_temperature'],
        ])}
        <div className="rail-block">
          STELLAR CLASS & EVOLUTION
          <i />
        </div>
        <Panel
          title="06 · STELLAR CLASSIFICATION"
          qualifier="SPECTRAL / LUMINOSITY"
        >
          <div className="panel-status sol-stellar-class">
            <strong>{value('spectral_type')}</strong>
            <span>{value('stellar_type')}</span>
          </div>
          <div
            className="sol-spectral-sequence"
            role="img"
            aria-label="Spectral sequence from hotter O stars to cooler M stars. The Sun belongs to class G."
          >
            {SPECTRAL_CLASSES.map(([type, color]) => (
              <span
                key={type}
                className={type === 'G' ? 'sol-spectral-sequence__active' : ''}
                style={{ backgroundColor: color }}
              >
                {type}
              </span>
            ))}
          </div>
          <div className="sol-spectral-axis">
            <span>HOTTER</span>
            <span>G · SOL</span>
            <span>COOLER</span>
          </div>
          {facts([
            ['SPECTRAL SUBTYPE', 'spectral_class'],
            ['LUMINOSITY CLASS', 'luminosity_class'],
            ['CURRENT STAGE', 'evolutionary_stage'],
            ['CORE REACTION', 'energy_source'],
          ])}
        </Panel>
        {section('07 · STELLAR EVOLUTION', 'ROUNDED ESTIMATES', [
          ['CURRENT AGE', 'age'],
          ['MAIN SEQUENCE LEFT', 'remaining_main_sequence'],
          ['FUTURE EVOLUTION', 'future_evolution'],
          ['SOLAR SYSTEM MASS', 'solar_system_mass_fraction'],
        ])}
      </aside>
      <section className="center-column">
        <section className="viewer-shell">
          <header className="viewer-shell__header">
            <span>PRIMARY VIEWER</span>
            <div className="layer-chips">
              <button
                className={viewMode === 'globe' ? 'layer-chip--active' : ''}
                type="button"
                onClick={() => setViewMode('globe')}
              >
                GLOBE
              </button>
              {(
                [
                  ['visible', 'VISIBLE'],
                  ['euv', 'EUV 171'],
                  ['chromosphere', 'EUV 304'],
                  ['magnetic', 'MAGNETIC'],
                ] as const
              ).map(([layer, label]) => (
                <button
                  key={layer}
                  className={
                    viewMode === 'disk' && mode === layer
                      ? 'layer-chip--active'
                      : ''
                  }
                  type="button"
                  onClick={() => {
                    setMode(layer)
                    setViewMode('disk')
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>
              PROJ · {viewMode === 'globe' ? 'SOLAR GLOBE' : 'SOLAR DISK'}
            </span>
          </header>
          {viewMode === 'globe' ? (
            <SolGlobeViewer onCameraAltitudeChange={setCameraAltitude} />
          ) : (
            <SolViewer mode={mode} onObservationChange={setTelemetry} />
          )}
          <footer className="telemetry">
            <span>
              BODY<strong>SOL</strong>
            </span>
            <span>
              {viewMode === 'globe' ? 'ALTITUDE' : 'VIEW'}
              <strong>
                {viewMode === 'globe' ? cameraAltitude : 'PAN / ZOOM'}
              </strong>
            </span>
            <span>
              ACTIVE LAYER<strong>{activeTelemetry.instrument}</strong>
            </span>
            <span>
              {viewMode === 'globe' ? 'MAP DETAIL' : 'NATIVE SCALE'}
              <strong>{activeTelemetry.resolution}</strong>
            </span>
            <span>
              {viewMode === 'globe' ? 'ROTATION COMPOSITE' : 'OBSERVED · UTC'}
              <strong>{activeTelemetry.observedAt}</strong>
            </span>
          </footer>
        </section>
        <ScienceComputer bodyId="sol" {...scienceComputerProps} />
      </section>
      <aside className="rail">
        <div className="rail-block">
          SURFACE & ENERGY
          <i />
        </div>
        <Panel
          title="08 · PHOTOSPHERE TEMPERATURE"
          qualifier="EFFECTIVE TEMPERATURE"
        >
          <div className="temperature">
            <strong>{value('effective_temperature')}</strong>
            <small>PHOTOSPHERE · REFERENCE</small>
          </div>
          <div
            className="temperature-ramp mars-temperature-ramp"
            role="img"
            aria-label={`Temperature scale from ${TEMPERATURE_SCALE_MIN_C} °C to ${TEMPERATURE_SCALE_MAX_C} °C; photosphere ${value('effective_temperature')}`}
          >
            <i style={{ left: `${temperaturePosition}%` }} />
          </div>
          <div className="range">
            <span>
              {TEMPERATURE_SCALE_MIN_C.toLocaleString('en-US')} °C · COLD
            </span>
            <span>
              {TEMPERATURE_SCALE_MAX_C.toLocaleString('en-US')} °C · HOT
            </span>
          </div>
          {facts(
            [
              ['PHOTOSPHERE TOP', 'photosphere_top_temperature'],
              ['PHOTOSPHERE BASE', 'photosphere_bottom_temperature'],
              ['CORONA · UP TO', 'coronal_temperature'],
              ['CHROMOSPHERE TOP', 'chromosphere_top_temperature'],
            ],
            true,
          )}
        </Panel>
        {section(
          '09 · ENERGY OUTPUT',
          'FUSION POWERED',
          [
            ['LUMINOSITY', 'luminosity'],
            ['FUEL / REACTION', 'energy_source'],
            ['ENERGY TRANSPORT', 'energy_transport'],
            ['ESCAPE VELOCITY', 'escape_velocity'],
          ],
          true,
        )}
        {section('10 · PHOTOSPHERIC FEATURES', 'PLASMA SURFACE', [
          ['SURFACE STATE', 'surface_state'],
          ['SUNSPOT ORIGIN', 'sunspot_origin'],
          ['CORONAL HOLES', 'coronal_holes'],
          ['PROMINENCES', 'prominences'],
        ])}
        <div className="rail-block">
          COMPOSITION & INTERIOR
          <i />
        </div>
        <Panel
          title="11 · ELEMENTAL COMPOSITION"
          qualifier="PHOTOSPHERE · BY NUMBER"
        >
          <div className="bar-list geochemistry">
            {COMPOSITION.map(([label, field, ppm], index) => (
              <div key={field}>
                <span>{label}</span>
                <i>
                  <b
                    style={{
                      width: `${numeric(field) / (ppm ? 10000 : 1)}%`,
                      background: `hsl(${43 - index * 4} 80% ${68 - index * 3}%)`,
                    }}
                  />
                </i>
                <strong>{value(field)}</strong>
              </div>
            ))}
          </div>
          {facts([
            ['IRON Fe', 'iron_abundance'],
            ['MAGNESIUM Mg', 'magnesium_abundance'],
            ['SILICON Si', 'silicon_abundance'],
            ['SULFUR S', 'sulfur_abundance'],
          ])}
        </Panel>
        {section('12 · SOLAR WIND', 'HELIOPHYSICS REFERENCE', [
          ['OUTFLOW', 'solar_wind'],
          ['HELIOSPHERE', 'heliosphere_extent'],
          ['FIELD GEOMETRY', 'magnetic_geometry'],
          ['EARTH RESPONSE', 'earth_impacts'],
        ])}
        {section(
          '13 · STELLAR INTERIOR',
          'CENTRAL MODEL VALUES',
          [
            ['CORE TEMPERATURE', 'core_temperature'],
            ['CORE DENSITY', 'core_density'],
            ['CORE PRESSURE', 'core_pressure'],
            ['INTERIOR ZONES', 'interior_layers'],
          ],
          true,
        )}
        <div className="rail-block">
          SOLAR ACTIVITY
          <i />
        </div>
        {section('14 · ACTIVITY & ERUPTIONS', 'REFERENCE · NOT LIVE ALERTS', [
          ['ACTIVITY CYCLE', 'activity_cycle'],
          ['POLARITY REVERSAL', 'polarity_reversal'],
          ['SOLAR FLARES', 'solar_flares'],
          ['CMEs', 'coronal_mass_ejections'],
          ['CORONAL HEATING', 'coronal_heating'],
        ])}
      </aside>
    </div>
  )
}

export default SolDashboard
