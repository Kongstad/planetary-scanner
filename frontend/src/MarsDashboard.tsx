import { useState } from 'react'
import ElevationProfile from './ElevationProfile.tsx'
import MarsViewer, { type MarsViewerMode } from './MarsViewer.tsx'
import Panel from './Panel.tsx'
import type { ReferenceFact } from './reference.ts'
import ScienceComputer, {
  type ScienceComputerProps,
} from './ScienceComputer.tsx'

type MarsDashboardProps = ScienceComputerProps & {
  referenceFacts: ReferenceFact[]
  isReferenceApiOnline: boolean
}

type FactGridEntry = {
  label: string
  field: string
}

type StatusGridEntry = {
  label: string
  value: string
}

function formatReferenceValue(
  referenceFacts: ReferenceFact[],
  isReferenceApiOnline: boolean,
  field: string,
) {
  const fact = referenceFacts.find((candidate) => candidate.field === field)
  if (!fact) {
    return isReferenceApiOnline ? 'REFERENCE PENDING' : 'SYSTEMS OFFLINE'
  }
  if (!fact.unit || fact.unit === '1' || fact.unit === 'count') {
    return String(fact.value)
  }
  return `${fact.value} ${fact.unit}`
}

function numericReferenceValue(referenceFacts: ReferenceFact[], field: string) {
  const value = referenceFacts.find(
    (candidate) => candidate.field === field,
  )?.value
  return typeof value === 'number' ? value : 0
}

function FactGrid({
  entries,
  referenceFacts,
  isReferenceApiOnline,
  className,
}: {
  entries: FactGridEntry[]
  referenceFacts: ReferenceFact[]
  isReferenceApiOnline: boolean
  className?: string
}) {
  return (
    <div
      className={`data-grid compact-grid${className ? ` ${className}` : ''}`}
    >
      {entries.map(({ label, field }) => (
        <div key={field}>
          <span>{label}</span>
          <strong>
            {formatReferenceValue(referenceFacts, isReferenceApiOnline, field)}
          </strong>
        </div>
      ))}
    </div>
  )
}

function StatusGrid({ entries }: { entries: StatusGridEntry[] }) {
  return (
    <div className="data-grid compact-grid">
      {entries.map(({ label, value }) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  )
}

function MarsDashboard({
  referenceFacts,
  isReferenceApiOnline,
  ...scienceComputerProps
}: MarsDashboardProps) {
  const [cameraAltitude, setCameraAltitude] = useState('11,000 KM')
  const [imageryCoverage, setImageryCoverage] = useState(
    'GLOBAL BASELINE · ZOOM BELOW 200 KM',
  )
  const [viewerMode, setViewerMode] = useState<MarsViewerMode>('imagery')
  const facts = (entries: FactGridEntry[], className?: string) => (
    <FactGrid
      className={className}
      entries={entries}
      referenceFacts={referenceFacts}
      isReferenceApiOnline={isReferenceApiOnline}
    />
  )

  return (
    <div className="console__main">
      <aside className="rail">
        <div className="rail-block">
          PLANETARY PROFILE
          <i />
        </div>
        <Panel title="01 · CLASSIFICATION" qualifier="CATALOG">
          <h1>MARS</h1>
          <p className="designation">SOL IV · TERRESTRIAL / SILICATE</p>
          {facts([
            { label: 'MEAN RADIUS', field: 'mean_radius' },
            { label: 'MASS', field: 'mass' },
            { label: 'EQUAT. GRAVITY', field: 'equatorial_surface_gravity' },
            { label: 'ROTATION', field: 'rotation_period' },
            { label: 'GEOM. ALBEDO', field: 'geometric_albedo' },
            { label: 'SATELLITES', field: 'natural_satellite_names' },
          ])}
        </Panel>
        <Panel title="02 · ORBITAL ELEMENTS" qualifier="ORBIT & ROTATION">
          {facts([
            { label: 'SEMI-MAJOR AXIS', field: 'semi_major_axis' },
            { label: 'ECCENTRICITY', field: 'orbital_eccentricity' },
            { label: 'ORBITAL PERIOD', field: 'orbital_period' },
            { label: 'INCLINATION', field: 'orbital_inclination' },
            { label: 'AXIAL TILT', field: 'axial_tilt' },
            { label: 'ESCAPE VELOCITY', field: 'equatorial_escape_velocity' },
          ])}
        </Panel>
        <div className="rail-block">
          ENVIRONMENT
          <i />
        </div>
        <Panel
          title="03 · ORBITAL ENVIRONMENT"
          qualifier="NASA / ESA RELAY · MAY 2026"
        >
          <FactGrid
            className="magnetic-shield-grid"
            entries={[
              {
                label: 'RELAY ORBITERS',
                field: 'operational_relay_orbiter_count',
              },
              { label: 'RELAY FLEET', field: 'operational_relay_orbiters' },
              { label: 'BACKUP RELAY', field: 'relay_backup_orbiter' },
              {
                label: 'HIGHEST-THROUGHPUT RELAY',
                field: 'highest_throughput_relay',
              },
            ]}
            referenceFacts={referenceFacts}
            isReferenceApiOnline={isReferenceApiOnline}
          />
        </Panel>
        <Panel title="04 · MAGNETIC SHIELD" qualifier="REMANENT CRUSTAL FIELD">
          <FactGrid
            className="magnetic-shield-grid"
            entries={[
              { label: 'GLOBAL FIELD', field: 'global_magnetic_field_status' },
              { label: 'CRUSTAL FIELD', field: 'crustal_magnetization' },
              { label: 'SOLAR WIND', field: 'solar_wind_interaction' },
              { label: 'AURORAL RESPONSE', field: 'auroral_response' },
            ]}
            referenceFacts={referenceFacts}
            isReferenceApiOnline={isReferenceApiOnline}
          />
        </Panel>
        <Panel title="05 · ATMOSPHERE" qualifier="NEAR SURFACE">
          {facts([
            { label: 'CARBON DIOXIDE', field: 'atmospheric_carbon_dioxide' },
            { label: 'NITROGEN', field: 'atmospheric_nitrogen' },
            { label: 'ARGON', field: 'atmospheric_argon' },
            { label: 'SURFACE PRESSURE', field: 'surface_pressure' },
          ])}
        </Panel>
        <div className="rail-block">
          LIFE
          <i />
        </div>
        <Panel title="06 · BIOSPHERE" qualifier="CURRENT ASSESSMENT">
          <div className="biosphere-status biosphere-status--unconfirmed">
            <strong>NOT CONFIRMED</strong>
            <span>NO BIOSPHERE DETECTED</span>
          </div>
          <StatusGrid
            entries={[
              {
                label: 'CURRENT LIFE',
                value: String(
                  referenceFacts.find(
                    (fact) => fact.field === 'current_life_status',
                  )?.value ??
                    (isReferenceApiOnline
                      ? 'REFERENCE PENDING'
                      : 'SYSTEMS OFFLINE'),
                ),
              },
              {
                label: 'SUBSURFACE DETECTION',
                value: 'LOCALIZED PROBE REQUIRED',
              },
              { label: 'SURFACE BIOSPHERE', value: 'NOT DETECTED' },
              { label: 'COMPLEX LIFE', value: 'NOT DETECTED' },
            ]}
          />
        </Panel>
        <Panel title="07 · CIVILISATION" qualifier="CURRENT ASSESSMENT">
          <div className="data-grid compact-grid">
            <div>
              <span>LOCAL CIVILISATION</span>
              <strong>NONE PRESENT</strong>
            </div>
            <div>
              <span>TECHNOLOGICAL SPECIES</span>
              <strong>NONE DETECTED</strong>
            </div>
            <div>
              <span>VISIBLE DEBRIS</span>
              <strong>EARTH EXPLORATION PROBES</strong>
            </div>
            <div>
              <span>CONTACT POSTURE</span>
              <strong>NOT APPLICABLE</strong>
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
                className={viewerMode === 'imagery' ? 'layer-chip--active' : ''}
                type="button"
                onClick={() => setViewerMode('imagery')}
              >
                IMAGERY
              </button>
              <button
                className={
                  viewerMode === 'infrared' ? 'layer-chip--active' : ''
                }
                type="button"
                onClick={() => setViewerMode('infrared')}
              >
                IR
              </button>
              <button
                className={viewerMode === 'relief' ? 'layer-chip--active' : ''}
                type="button"
                onClick={() => setViewerMode('relief')}
              >
                RELIEF
              </button>
            </div>
            <span>PROJ · PLANETOCENTRIC MARS</span>
          </header>
          <MarsViewer
            mode={viewerMode}
            onCameraAltitudeChange={setCameraAltitude}
            onCoverageChange={setImageryCoverage}
          />
          <footer className="telemetry">
            <span>
              BODY<strong>MARS</strong>
            </span>
            <span>
              ALTITUDE<strong>{cameraAltitude}</strong>
            </span>
            <span>
              ACTIVE LAYER
              <strong>
                {viewerMode === 'imagery'
                  ? 'MDIM 2.1 COLOUR'
                  : viewerMode === 'infrared'
                    ? 'THEMIS IR'
                    : 'MOLA COLOR RELIEF'}
              </strong>
            </span>
            <span>
              RESOLUTION
              <strong>
                {viewerMode === 'imagery'
                  ? '231 M'
                  : viewerMode === 'infrared'
                    ? '~100 M'
                    : '~463 M GRID'}
              </strong>
            </span>
            <span>
              TILE COVERAGE<strong>{imageryCoverage}</strong>
            </span>
          </footer>
        </section>
        <ScienceComputer bodyId="mars" {...scienceComputerProps} />
      </section>

      <aside className="rail">
        <div className="rail-block">
          SURFACE &amp; WATER
          <i />
        </div>
        <Panel
          title="08 · SURFACE TEMPERATURE"
          qualifier="REFERENCE CLIMATOLOGY"
        >
          <div className="temperature">
            <strong>
              {formatReferenceValue(
                referenceFacts,
                isReferenceApiOnline,
                'global_mean_surface_temperature',
              )}
            </strong>
            <small>AVERAGE · MARS REFERENCE</small>
          </div>
          <div className="temperature-ramp mars-temperature-ramp">
            <i style={{ left: '18%' }} />
          </div>
          <div className="data-grid compact-grid magnetic-shield-grid">
            <div>
              <span>WARM EXTREME</span>
              <strong>
                {formatReferenceValue(
                  referenceFacts,
                  isReferenceApiOnline,
                  'daytime_surface_temperature_range',
                )}
              </strong>
            </div>
            <div>
              <span>COLD EXTREME</span>
              <strong>
                {formatReferenceValue(
                  referenceFacts,
                  isReferenceApiOnline,
                  'nighttime_surface_temperature_range',
                )}
              </strong>
            </div>
          </div>
        </Panel>
        <Panel title="09 · HYDROLOGY & ICE" qualifier="MARS REFERENCE">
          {facts(
            [
              { label: 'POLAR / SUBSURFACE ICE', field: 'water_ice' },
              {
                label: 'PAST LIQUID WATER',
                field: 'past_liquid_water_evidence',
              },
              {
                label: 'PRESENT SURFACE LIQUID',
                field: 'present_liquid_water',
              },
              { label: 'GLOBAL OCEAN', field: 'present_global_ocean' },
            ],
            'magnetic-shield-grid',
          )}
        </Panel>
        <Panel title="10 · TOPOGRAPHY &amp; RELIEF" qualifier="MOLA AREOID">
          <ElevationProfile
            heading="GLOBAL ELEVATION DISTRIBUTION"
            qualifier="RELATIVE AREA"
            description="MOLA global elevation distribution profile"
            heights={[
              22, 38, 57, 78, 90, 84, 68, 51, 37, 29, 35, 48, 61, 54, 39, 25,
              16,
            ]}
            labels={['LOWLANDS', 'HIGHLANDS']}
            axis={['−8.2 km', '0 km', '+21.2 km']}
          />
          {facts([
            { label: 'HIGHEST ELEVATION', field: 'highest_elevation' },
            { label: 'LOWEST ELEVATION', field: 'lowest_elevation' },
            { label: 'GLOBAL RELIEF', field: 'global_relief' },
            { label: 'MOLA TERRAIN', field: 'mola_terrain' },
          ])}
        </Panel>
        <div className="rail-block">
          GEOLOGY &amp; INTERIOR
          <i />
        </div>
        <Panel
          title="11 · BULK GEOCHEMISTRY"
          qualifier="WHOLE-PLANET MODEL · WT%"
        >
          <div className="bar-list geochemistry mars-geochemistry">
            {[
              ['IRON Fe', 'bulk_iron_fraction'],
              ['OXYGEN O', 'bulk_oxygen_fraction'],
              ['SILICON Si', 'bulk_silicon_fraction'],
              ['MAGNESIUM Mg', 'bulk_magnesium_fraction'],
            ].map(([label, field]) => {
              const value = numericReferenceValue(referenceFacts, field)
              return (
                <div key={field}>
                  <span>{label}</span>
                  <i>
                    <b style={{ width: `${value}%` }} />
                  </i>
                  <strong>
                    {formatReferenceValue(
                      referenceFacts,
                      isReferenceApiOnline,
                      field,
                    )}
                  </strong>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="12 · VOLATILE INVENTORY" qualifier="CURRENT DETECTION">
          <StatusGrid
            entries={[
              { label: 'METHANE SOURCE', value: 'NOT CONFIRMED' },
              { label: 'ACTIVE OUTGASSING', value: 'NOT DETECTED' },
              { label: 'HYDROTHERMAL SYSTEMS', value: 'NOT DETECTED' },
              { label: 'SUBSURFACE BRINES', value: 'NOT DETECTED' },
            ]}
          />
        </Panel>
        <Panel title="13 · PLANETARY INTERIOR" qualifier="INSIGHT MODELS">
          {facts(
            [
              { label: 'CORE STATE', field: 'core_state' },
              { label: 'CRUST', field: 'crust_thickness' },
              { label: 'MANTLE', field: 'mantle_thickness' },
              { label: 'TECTONIC REGIME', field: 'tectonic_regime' },
            ],
            'magnetic-shield-grid',
          )}
        </Panel>
        <div className="rail-block">
          ANOMALOUS DETECTION
          <i />
        </div>
        <Panel title="14 · DILITHIUM DETECTOR" qualifier="FICTIONAL ANALYSIS">
          <div className="state-line">
            <span>DEPOSIT STATUS</span>
            <b className="status-chip status-chip--absent">
              NO DILITHIUM DETECTED
            </b>
          </div>
          <div className="data-grid compact-grid">
            <div>
              <span>ANALYSIS COVERAGE</span>
              <strong>GLOBAL BASELINE</strong>
            </div>
            <div>
              <span>DEPOSIT CLASS</span>
              <strong>NONE</strong>
            </div>
            <div>
              <span>RESOURCE ESTIMATE</span>
              <strong>0 Mt</strong>
            </div>
            <div>
              <span>ANOMALY CONFIDENCE</span>
              <strong>NO ANOMALY</strong>
            </div>
          </div>
        </Panel>
      </aside>
    </div>
  )
}

export default MarsDashboard
