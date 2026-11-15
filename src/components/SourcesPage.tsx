import { useEffect } from 'react'
import { COMMUNITY_SOURCE, SOURCE_SECTIONS, type Source } from '../construction/sources'

function SourceItem({ s }: { s: Source }) {
  return (
    <li>
      <a href={s.url} target="_blank" rel="noopener noreferrer">
        {s.title}
      </a>
      <span className="sources__publisher">{s.publisher}</span>
      <span className="sources__url">{s.url}</span>
    </li>
  )
}

/** Sources behind the game's rules and data, at ?view=sources. Each rule has its own section (#boundary, #overlap…). */
export function SourcesPage() {
  useEffect(() => {
    // The page renders after the browser has looked for the #anchor, so scroll to it here.
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
    }
    go()
    window.addEventListener('hashchange', go)
    return () => window.removeEventListener('hashchange', go)
  }, [])
  return (
    <div className="sources">
      <main className="sources__page">
        <header className="sources__head">
          <a className="sources__back" href="./">
            ◂ Back to ParkLab
          </a>
          <h1>Sources</h1>
          <p>Where the park data and the government regulations in ParkLab come from. Links open in a new tab.</p>
        </header>

        <section className="sources__community" aria-labelledby="community-title">
          <h2 id="community-title">What residents are saying</h2>
          <p>The Markham community on Reddit discusses the City’s park construction plans:</p>
          <ul className="sources__list">
            <SourceItem s={COMMUNITY_SOURCE} />
          </ul>
        </section>

        <nav className="sources__toc" aria-label="Sections">
          {SOURCE_SECTIONS.map((sec, i) => (
            <a key={sec.id} href={`#${sec.id}`}>
              {i + 1}. {sec.title}
            </a>
          ))}
        </nav>

        {SOURCE_SECTIONS.map((sec, i) => (
          <section key={sec.id} id={sec.id} className="sources__section">
            <h2>
              <span className="sources__num">{i + 1}</span>
              {sec.title}
            </h2>
            <p className="sources__use">{sec.use}</p>
            <ul className="sources__list">
              {sec.sources.map((s) => (
                <SourceItem key={s.url} s={s} />
              ))}
            </ul>
          </section>
        ))}

        <footer className="sources__foot">ParkLab is a learning tool, not a planning forecast. The residents and their requests are fictional.</footer>
      </main>
    </div>
  )
}
