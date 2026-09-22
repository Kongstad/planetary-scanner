import { useState } from 'react'
import LunaViewer from './LunaViewer.tsx'

type PanelProps = {
  title: string
  qualifier: string
}

const leftPanels: PanelProps[] = [
  { title: '01 · CLASSIFICATION', qualifier: 'CATALOG' },
  { title: '02 · ORBITAL ELEMENTS', qualifier: 'ORBIT & ROTATION' },
  { title: '03 · ORBITAL ENVIRONMENT', qualifier: 'MISSION CONTEXT' },
  { title: '04 · MAGNETIC ENVIRONMENT', qualifier: 'CONTENT PENDING' },
  { title: '05 · EXOSPHERE', qualifier: 'CONTENT PENDING' },
  { title: '06 · BIOSPHERE', qualifier: 'CONTENT PENDING' },
  { title: '07 · CIVILISATION', qualifier: 'CONTENT PENDING' },
]

const rightPanels: PanelProps[] = [
  { title: '08 · SURFACE TEMPERATURE', qualifier: 'CONTENT PENDING' },
  { title: '09 · WATER & VOLATILES', qualifier: 'CONTENT PENDING' },
  { title: '10 · TOPOGRAPHY & RELIEF', qualifier: 'CONTENT PENDING' },
  { title: '11 · BULK GEOCHEMISTRY', qualifier: 'CONTENT PENDING' },
  { title: '12 · VOLATILE INVENTORY', qualifier: 'CONTENT PENDING' },
  { title: '13 · PLANETARY INTERIOR', qualifier: 'CONTENT PENDING' },
  { title: '14 · ANOMALOUS DETECTION', qualifier: 'CONTENT PENDING' },
]

function PlaceholderPanel({ title, qualifier }: PanelProps) {
  return (
    <section className="panel luna-placeholder-panel">
      <header className="panel__header">
        <span>{title}</span>
        <span>{qualifier}</span>
      </header>
      <div className="panel__body">
        <span>CONTENT PENDING</span>
      </div>
    </section>
  )
}

function LunaDashboard() {
  const [cameraAltitude, setCameraAltitude] = useState('6,000 KM')

  return (
    <div className="console__main">
      <aside className="rail">
        <div className="rail-block">LUNAR PROFILE<i /></div>
        {leftPanels.map((panel) => <PlaceholderPanel key={panel.title} {...panel} />)}
      </aside>

      <section className="center-column">
        <section className="viewer-shell">
          <header className="viewer-shell__header">
            <span>PRIMARY VIEWER</span>
            <div className="layer-chips">
              <button type="button" disabled>IMAGERY</button>
              <button type="button" disabled>RELIEF</button>
            </div>
            <span>PROJ · SELENOCENTRIC</span>
          </header>
          <LunaViewer onCameraAltitudeChange={setCameraAltitude} />
          <footer className="telemetry">
            <span>PHASE ANGLE<strong>CONTENT PENDING</strong></span><span>SUB-SPACECRAFT<strong>CONTENT PENDING</strong></span><span>DOWNLINK<strong>UNAVAILABLE</strong></span><span>ALTITUDE<strong>{cameraAltitude}</strong></span><span>SCAN COVERAGE<strong>CONTENT PENDING</strong></span>
          </footer>
        </section>
        <section className="panel">
          <header className="panel__header">
            <span>SCIENCE COMPUTER</span>
            <span>LUNAR REFERENCE DATA PENDING</span>
          </header>
          <div className="panel__body">
            <div className="science-computer">
              <div className="message"><span>RETRIEVAL</span><p>Lunar records have not been added to the local reference corpus.</p></div>
            </div>
            <form className="query-form">
              <label htmlFor="luna-query">&gt;</label>
              <input id="luna-query" placeholder="Lunar Science Computer pending..." disabled />
              <button type="button" disabled>QUERY</button>
            </form>
          </div>
        </section>
      </section>

      <aside className="rail">
        <div className="rail-block">LUNAR SURFACE &amp; INTERIOR<i /></div>
        {rightPanels.map((panel) => <PlaceholderPanel key={panel.title} {...panel} />)}
      </aside>
    </div>
  )
}

export default LunaDashboard
