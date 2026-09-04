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

const vitalStatistics = [
  ['MEAN RADIUS', '6 371.0 km'],
  ['MASS', '5.972e24 kg'],
  ['SURF. GRAVITY', '9.807 m/s²'],
  ['ROTATION', '23h 56m 04s'],
  ['BOND ALBEDO', '0.306'],
  ['SATELLITES', '1'],
]

const orbitalElements = [
  ['Semi-major axis', '1.0000 AU'],
  ['Eccentricity', '0.0167'],
  ['Orbital period', '365.256 d'],
  ['Inclination', '0.000°'],
  ['Axial tilt', '23.44°'],
  ['Orbital velocity', '29.78 km/s'],
]

const atmosphere = [
  ['NITROGEN N₂', '78.08%', 78],
  ['OXYGEN O₂', '20.95%', 21],
  ['ARGON Ar', '0.93%', 8],
  ['WATER H₂O', '0.25%', 6],
  ['CARBON DIOXIDE', '424 ppm', 4],
]

const composition = [
  ['SILICATES', '58%', 58],
  ['CARBONATES', '17%', 17],
  ['IRON OXIDES', '11%', 11],
  ['CLAY GROUP', '9%', 9],
  ['EVAPORITES', '5%', 5],
]

const geochemistry = [
  ['OXYGEN O', '46.6%', 47], ['SILICON Si', '27.7%', 28], ['ALUMINIUM Al', '8.10%', 8],
  ['IRON Fe', '5.00%', 5],
]

const biosignatures = [
  ['O₂ + CH₄ PAIR', 'REDOX DISEQUILIBRIUM'], ['N₂O', '336 ppb ATMOSPHERIC'],
]

const volatileInventory = [
  { label: 'CARBON C', total: '1.85e20 kg', reservoirs: [{ name: 'CRUSTAL CARBONATE', percentage: 50, tone: 'soil' }, { name: 'OCEAN DIC', percentage: 45, tone: 'ocean' }, { name: 'BIOSPHERE', percentage: 5, tone: 'biosphere' }] },
  { label: 'WATER H₂O', total: '1.386e21 kg', reservoirs: [{ name: 'OCEAN', percentage: 97, tone: 'ocean' }, { name: 'ICE SHEETS', percentage: 2, tone: 'ice' }, { name: 'ATMOSPHERE', percentage: 1, tone: 'atmosphere' }] },
  { label: 'NITROGEN N', total: '4.00e18 kg', reservoirs: [{ name: 'ATMOSPHERE N₂', percentage: 99.6, tone: 'atmosphere' }, { name: 'FIXED NITRATE', percentage: 0.4, tone: 'nitrate' }] },
]

function App() {
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
            <div><span>SENSOR ARRAY</span><strong className="status-online"><i />ONLINE</strong></div>
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
              {vitalStatistics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          </Panel>
          <Panel title="02 · ORBITAL ELEMENTS" qualifier="J2000">
            <dl className="data-list">
              {orbitalElements.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
            </dl>
          </Panel>
          <div className="rail-block">ENVIRONMENT<i /></div>
          <Panel title="03 · ORBITAL ENVIRONMENT" qualifier="">
            <div className="data-grid compact-grid"><div><span>CATALOGUED OBJECTS</span><strong>40 000+</strong></div><div><span>ACTIVE PAYLOADS</span><strong>11 000+</strong></div><div><span>ROCKET BODIES</span><strong>2 500+</strong></div><div><span>TRACKED DEBRIS</span><strong>26 000+</strong></div></div>
          </Panel>
          <Panel title="04 · MAGNETIC SHIELD" qualifier="GEOMAGNETIC">
            <div className="state-line"><span>GLOBAL DIPOLE</span><b className="status-chip">SHIELDED</b></div>
            <div className="data-grid compact-grid"><div><span>SURFACE FIELD</span><strong>25–65 µT</strong></div><div><span>SURFACE DOSE</span><strong>0.6 mSv/yr</strong></div><div><span>INNER BELT ALT.</span><strong>1 000–12 000 km</strong></div><div><span>INNER BELT</span><strong>PROTONS · HIGH</strong></div><div><span>OUTER BELT ALT.</span><strong>13 000–60 000 km</strong></div><div><span>OUTER BELT</span><strong>ELECTRONS · VAR.</strong></div></div>
          </Panel>
          <Panel title="05 · ATMOSPHERE" qualifier="1013 hPa">
            <div className="bar-list">
              {atmosphere.map(([label, value, weight]) => <div key={label}><span>{label}</span><strong>{value}</strong><i><b style={{ width: `${weight}%` }} /></i></div>)}
            </div>
          </Panel>
          <div className="rail-block">LIFE<i /></div>
          <Panel title="06 · BIOSPHERE" qualifier="BIOSIGNATURE">
            <div className="biosphere-status"><strong>CONFIRMED</strong><span>SURFACE + OCEAN · GLOBAL</span></div>
            <h2 className="group-title">DETECTION</h2>
            <div className="detection-list">{biosignatures.map(([label, detail]) => <div key={label}><span><strong>{label}</strong><small>{detail}</small></span><b className="status-chip">STRONG</b></div>)}</div>
            <h2 className="group-title">STANDING STOCK</h2>
            <div className="data-grid compact-grid biosphere-metrics"><div><span>TOTAL BIOMASS</span><strong>550 Gt C</strong></div><div><span>NET PRIMARY PROD.</span><strong>104 Gt C/yr</strong></div><div><span>OCEAN CHLOROPHYLL</span><strong>0.31 mg/m³</strong></div><div><span>TROPHIC DEPTH</span><strong>5 LEVELS</strong></div></div>
          </Panel>
          <Panel title="07 · CIVILISATION" qualifier="TECHNOSIGNATURE">
            <div className="data-grid"><div><span>TECH. CIVILISATIONS</span><strong>1</strong></div><div><span>LIFEFORM TYPE</span><strong>CARBON · MULTICELL.</strong></div><div><span>DOMINANT LIFEFORM</span><strong>HOMO SAPIENS</strong></div><div><span>DOMINANT POPULATION</span><strong>~8.2 B</strong></div><div><span>CIVILISATION SCALE</span><strong>KARDASEV ~0.73</strong></div><div><span>SUSTAINABILITY</span><strong className="status-chip status-chip--undetermined">UNDETERMINED</strong></div><div><span>CONTACT POSTURE</span><strong className="status-chip status-chip--defensive">DEFENSIVE</strong></div><div><span>PRIME DIRECTIVE</span><strong>ACTIVE · AVOID CONTACT</strong></div><div><span>DESCRIBED SPECIES</span><strong>~2.2 M</strong></div><div><span>EST. EUK. SPECIES</span><strong>~8.7 M</strong></div></div>
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
          <Panel title="SCIENCE COMPUTER" qualifier="REFERENCE CORPUS · 18 402 DOCUMENTS">
            <div className="science-computer">
              <div className="message"><span>COMPUTER</span><p>Sensor lock acquired. Reference corpus is not initialized. Reference panels are provisional display fixtures.</p></div>
            </div>
            <form className="query-form" onSubmit={(event) => event.preventDefault()}><label htmlFor="query">&gt;</label><input id="query" placeholder="Query the science computer about Earth..." /><button type="submit">QUERY</button></form>
          </Panel>
        </section>
        <aside className="rail">
          <div className="rail-block">SURFACE &amp; WATER<i /></div>
          <Panel title="08 · SURFACE TEMPERATURE" qualifier="THERMAL IR"><div className="temperature"><strong>+15.0 °C</strong><span>± 0.2</span><small>MEAN · GLOBAL</small></div><div className="temperature-ramp"><i /></div><div className="range"><span>−89 °C</span><span>+57 °C</span></div><div className="data-grid compact-grid"><div><span>DAY SIDE</span><strong>+22.4 °C</strong></div><div><span>NIGHT SIDE</span><strong>+9.1 °C</strong></div><div><span>SEA SURFACE</span><strong>+17.5 °C</strong></div><div><span>ANOMALY</span><strong>+1.42 °C</strong></div></div></Panel>
          <Panel title="09 · HYDROLOGY & ICE" qualifier="MICROWAVE"><div className="data-grid"><div><span>SURFACE WATER</span><strong>71.0%</strong></div><div><span>SEA ICE EXTENT</span><strong>13.1 M km²</strong></div><div><span>GLACIAL MASS</span><strong>2.15e19 kg</strong></div><div><span>ATMOS. WATER VAPOUR</span><strong>12 900 km³</strong></div></div></Panel>
          <Panel title="10 · HYPSOMETRY" qualifier="COPERNICUS DEM"><div className="hypsometry-chart"><div className="hypsometry-y-axis" aria-hidden="true"><span>RELATIVE AREA</span><i /><i /><i /></div><div className="hypsometry-plot"><div className="profile" aria-label="Bimodal global elevation distribution"><span className="sea-level">SEA LEVEL</span>{[18, 29, 43, 61, 76, 88, 94, 86, 69, 51, 35, 24, 20, 25, 37, 54, 66, 58, 42, 28, 17].map((height, index) => <i className={index < 12 ? 'profile-bar profile-bar--ocean' : 'profile-bar profile-bar--land'} key={index} style={{ height: `${height}%` }} />)}</div><div className="hypsometry-labels"><span>OCEAN BASINS</span><span>CONTINENTAL LAND</span></div><div className="hypsometry-axis"><span>−10 km</span><span>−5 km</span><span>0 km</span><span>+5 km</span><span>+9 km</span></div></div></div><div className="data-grid compact-grid"><div><span>MEDIAN ELEV.</span><strong>−2 440 m</strong></div><div><span>TOTAL RELIEF</span><strong>19 784 m</strong></div><div><span>RMS SLOPE</span><strong>1.9°</strong></div><div><span>DISTRIBUTION</span><strong>BIMODAL</strong></div></div></Panel>
          <div className="rail-block">GEOLOGY &amp; INTERIOR<i /></div>
          <Panel title="11 · BULK GEOCHEMISTRY" qualifier="UPPER CONTINENTAL CRUST"><div className="bar-list geochemistry">{geochemistry.map(([label, value, weight]) => <div key={label}><span>{label}</span><i><b style={{ width: `${weight}%` }} /></i><strong>{value}</strong></div>)}</div></Panel>
          <Panel title="12 · SPECTRAL MINERALOGY" qualifier="VNIR/SWIR"><div className="bar-list composition">{composition.map(([label, value, weight]) => <div key={label}><span>{label}</span><strong>{value}</strong><i><b style={{ width: `${weight}%` }} /></i></div>)}</div></Panel>
          <Panel title="13 · VOLATILE INVENTORY" qualifier="REFERENCE ESTIMATES"><div className="volatile-list">{volatileInventory.map(({ label, total, reservoirs }) => <div key={label}><strong>{label}</strong><b>{total}</b><div className="reservoir-bar" aria-label={`${label} reservoir partition`}>{reservoirs.map(({ name, percentage, tone }) => <i className={`reservoir-segment reservoir-segment--${tone}`} key={name} style={{ width: `${percentage}%` }} />)}</div><div className="reservoir-legend">{reservoirs.map(({ name, percentage, tone }) => <span className={`reservoir-legend__item reservoir-legend__item--${tone}`} key={name}>{name} <b>{percentage}%</b></span>)}</div></div>)}</div></Panel>
          <Panel title="14 · PLANETARY INTERIOR" qualifier="SEISMOLOGY · GEODYNAMICS"><div className="data-grid"><div><span>CORE STATE</span><strong>LIQUID / SOLID</strong></div><div><span>INNER CORE R.</span><strong>1 221 km</strong></div><div><span>CMB DEPTH</span><strong>2 890 km</strong></div><div><span>GLOBAL HEAT FLOW</span><strong>47 TW</strong></div><div><span>RADIOGENIC HEAT</span><strong>20 TW</strong></div><div><span>GEODYNAMO</span><strong>ACTIVE</strong></div><div><span>QUAKES / DAY · M≥2.5</span><strong>~1 300</strong></div><div><span>MEAN MAGNITUDE</span><strong>~M 3.0</strong></div></div></Panel>
          <div className="rail-block">ANOMALOUS DETECTION<i /></div>
          <Panel title="15 · DILITHIUM DETECTOR" qualifier="FICTIONAL ANALYSIS"><div className="state-line"><span>DEPOSIT STATUS</span><b className="status-chip">HIGH GRADE</b></div><div className="data-grid compact-grid"><div><span>LOCATION</span><strong>GREENLAND ICE SHEET</strong></div><div><span>HOST MATERIAL</span><strong>SUBGLACIAL BEDROCK</strong></div><div><span>SUBSURFACE DEPTH</span><strong>3.17 km</strong></div><div><span>EST. RESOURCE</span><strong>12.4 Mt</strong></div></div></Panel>
        </aside>
      </div>
    </main>
  )
}

export default App
