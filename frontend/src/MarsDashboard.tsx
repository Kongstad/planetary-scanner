import MarsViewer from './MarsViewer.tsx'

type ReferenceFact = {
  field: string
  value: number | string
  unit: string | null
}

type MarsDashboardProps = {
  referenceFacts: ReferenceFact[]
  isReferenceApiOnline: boolean
  scienceComputerQualifier: string
  query: string
  retrievalStatus: string
  groundedAnswer: string | null
  isRetrieving: boolean
  queryElapsedSeconds: number
  lastQueryElapsedSeconds: number | null
  onQueryChange: (query: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}

type PanelProps = {
  title: string
  qualifier: string
  children: React.ReactNode
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
  const value = referenceFacts.find((candidate) => candidate.field === field)?.value
  return typeof value === 'number' ? value : 0
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
    <div className={`data-grid compact-grid${className ? ` ${className}` : ''}`}>
      {entries.map(({ label, field }) => (
        <div key={field}>
          <span>{label}</span>
          <strong>{formatReferenceValue(referenceFacts, isReferenceApiOnline, field)}</strong>
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
  scienceComputerQualifier,
  query,
  retrievalStatus,
  groundedAnswer,
  isRetrieving,
  queryElapsedSeconds,
  lastQueryElapsedSeconds,
  onQueryChange,
  onSubmit,
}: MarsDashboardProps) {
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
        <div className="rail-block">PLANETARY PROFILE<i /></div>
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
        <div className="rail-block">ENVIRONMENT<i /></div>
        <Panel title="03 · ORBITAL ENVIRONMENT" qualifier="NASA / ESA RELAY · MAY 2026">
          <FactGrid
            className="magnetic-shield-grid"
            entries={[
              { label: 'RELAY ORBITERS', field: 'operational_relay_orbiter_count' },
              { label: 'RELAY FLEET', field: 'operational_relay_orbiters' },
              { label: 'BACKUP RELAY', field: 'relay_backup_orbiter' },
              { label: 'HIGHEST-THROUGHPUT RELAY', field: 'highest_throughput_relay' },
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
        <div className="rail-block">LIFE<i /></div>
        <Panel title="06 · BIOSPHERE" qualifier="CURRENT ASSESSMENT">
          <div className="biosphere-status biosphere-status--unconfirmed"><strong>NOT CONFIRMED</strong><span>NO BIOSPHERE DETECTED</span></div>
          <StatusGrid entries={[
            {
              label: 'CURRENT LIFE',
              value: String(referenceFacts.find((fact) => fact.field === 'current_life_status')?.value
                ?? (isReferenceApiOnline ? 'REFERENCE PENDING' : 'SYSTEMS OFFLINE')),
            },
            { label: 'SUBSURFACE DETECTION', value: 'LOCALIZED PROBE REQUIRED' },
            { label: 'SURFACE BIOSPHERE', value: 'NOT DETECTED' },
            { label: 'COMPLEX LIFE', value: 'NOT DETECTED' },
          ]} />
        </Panel>
        <Panel title="07 · CIVILISATION" qualifier="CURRENT ASSESSMENT">
          <div className="data-grid compact-grid">
            <div><span>LOCAL CIVILISATION</span><strong>NONE PRESENT</strong></div>
            <div><span>TECHNOLOGICAL SPECIES</span><strong>NONE DETECTED</strong></div>
            <div><span>VISIBLE DEBRIS</span><strong>EARTH EXPLORATION PROBES</strong></div>
            <div><span>CONTACT POSTURE</span><strong>NOT APPLICABLE</strong></div>
          </div>
        </Panel>
      </aside>

      <section className="center-column">
        <section className="viewer-shell">
          <header className="viewer-shell__header">
            <span>PRIMARY VIEWER</span>
            <div className="layer-chips"><button className="layer-chip--active" type="button">IMAGERY</button></div>
            <span>PROJ · PLANETOCENTRIC MARS</span>
          </header>
          <MarsViewer />
          <footer className="telemetry">
            <span>BODY<strong>MARS</strong></span><span>BASELINE<strong>VIKING GLOBAL MOSAIC</strong></span><span>RESOLUTION<strong>925 M SOURCE</strong></span><span>SCAN COVERAGE<strong>GLOBAL BASELINE</strong></span>
          </footer>
        </section>
        <Panel title="SCIENCE COMPUTER" qualifier={scienceComputerQualifier}>
          <div className="science-computer">
            <div className="message"><span>RETRIEVAL{isRetrieving ? ` · ${queryElapsedSeconds.toFixed(1)} s` : lastQueryElapsedSeconds !== null ? ` · COMPLETE ${lastQueryElapsedSeconds.toFixed(1)} s` : ''}</span><p>{retrievalStatus}</p></div>
            {groundedAnswer && <div className="grounded-answer"><span>ANSWER</span><p>{groundedAnswer}</p></div>}
          </div>
          <form className="query-form" onSubmit={onSubmit}><label htmlFor="mars-query">&gt;</label><input id="mars-query" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Ask about Mars, or compare Mars and Earth..." /><button type="submit" disabled={isRetrieving}>{isRetrieving ? 'SEARCHING' : 'QUERY'}</button></form>
        </Panel>
      </section>

      <aside className="rail">
        <div className="rail-block">SURFACE &amp; WATER<i /></div>
        <Panel title="08 · SURFACE TEMPERATURE" qualifier="REFERENCE CLIMATOLOGY">
          <div className="temperature">
            <strong>{formatReferenceValue(referenceFacts, isReferenceApiOnline, 'global_mean_surface_temperature')}</strong>
            <small>AVERAGE · MARS REFERENCE</small>
          </div>
          <div className="temperature-ramp mars-temperature-ramp"><i /></div>
          <div className="data-grid compact-grid magnetic-shield-grid">
            <div><span>WARM EXTREME</span><strong>{formatReferenceValue(referenceFacts, isReferenceApiOnline, 'daytime_surface_temperature_range')}</strong></div>
            <div><span>COLD EXTREME</span><strong>{formatReferenceValue(referenceFacts, isReferenceApiOnline, 'nighttime_surface_temperature_range')}</strong></div>
          </div>
        </Panel>
        <Panel title="09 · HYDROLOGY & ICE" qualifier="MARS REFERENCE">
          {facts(
            [
              { label: 'POLAR / SUBSURFACE ICE', field: 'water_ice' },
              { label: 'PAST LIQUID WATER', field: 'past_liquid_water_evidence' },
              { label: 'PRESENT SURFACE LIQUID', field: 'present_liquid_water' },
              { label: 'GLOBAL OCEAN', field: 'present_global_ocean' },
            ],
            'magnetic-shield-grid',
          )}
        </Panel>
        <Panel title="10 · TOPOGRAPHY &amp; RELIEF" qualifier="MOLA AREOID">
          <div className="mars-elevation-profile" aria-label="MOLA global elevation distribution profile">
            <div className="mars-elevation-profile__heading"><span>GLOBAL ELEVATION DISTRIBUTION</span><strong>RELATIVE AREA</strong></div>
            <div className="mars-elevation-profile__bars">
              {[22, 38, 57, 78, 90, 84, 68, 51, 37, 29, 35, 48, 61, 54, 39, 25, 16].map((height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="mars-elevation-profile__labels"><span>LOWLANDS</span><span>HIGHLANDS</span></div>
            <div className="mars-elevation-profile__axis"><span>−8.2 km</span><span>0 km</span><span>+21.2 km</span></div>
          </div>
          {facts([{ label: 'HIGHEST ELEVATION', field: 'highest_elevation' }, { label: 'LOWEST ELEVATION', field: 'lowest_elevation' }, { label: 'GLOBAL RELIEF', field: 'global_relief' }, { label: 'MOLA TERRAIN', field: 'mola_terrain' }])}
        </Panel>
        <div className="rail-block">GEOLOGY &amp; INTERIOR<i /></div>
        <Panel title="11 · BULK GEOCHEMISTRY" qualifier="WHOLE-PLANET MODEL · WT%">
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
                  <i><b style={{ width: `${value}%` }} /></i>
                  <strong>{formatReferenceValue(referenceFacts, isReferenceApiOnline, field)}</strong>
                </div>
              )
            })}
          </div>
        </Panel>
        <Panel title="12 · VOLATILE INVENTORY" qualifier="CURRENT DETECTION">
          <StatusGrid entries={[
            { label: 'METHANE SOURCE', value: 'NOT CONFIRMED' },
            { label: 'ACTIVE OUTGASSING', value: 'NOT DETECTED' },
            { label: 'HYDROTHERMAL SYSTEMS', value: 'NOT DETECTED' },
            { label: 'SUBSURFACE BRINES', value: 'NOT DETECTED' },
          ]} />
        </Panel>
        <Panel title="13 · PLANETARY INTERIOR" qualifier="INSIGHT MODELS">{facts([{ label: 'CORE STATE', field: 'core_state' }, { label: 'CRUST', field: 'crust_thickness' }, { label: 'MANTLE', field: 'mantle_thickness' }, { label: 'TECTONIC REGIME', field: 'tectonic_regime' }], 'magnetic-shield-grid')}</Panel>
        <div className="rail-block">ANOMALOUS DETECTION<i /></div>
        <Panel title="14 · DILITHIUM DETECTOR" qualifier="FICTIONAL ANALYSIS">
          <div className="state-line"><span>DEPOSIT STATUS</span><b className="status-chip status-chip--absent">NO DILITHIUM DETECTED</b></div>
          <div className="data-grid compact-grid">
            <div><span>ANALYSIS COVERAGE</span><strong>GLOBAL BASELINE</strong></div>
            <div><span>DEPOSIT CLASS</span><strong>NONE</strong></div>
            <div><span>RESOURCE ESTIMATE</span><strong>0 Mt</strong></div>
            <div><span>ANOMALY CONFIDENCE</span><strong>NO ANOMALY</strong></div>
          </div>
        </Panel>
      </aside>
    </div>
  )
}

export default MarsDashboard
