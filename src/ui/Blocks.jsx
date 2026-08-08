/* Renders the block kinds declared in content.js. Add a kind here and in the
 * comment at the top of content.js, and it becomes available in every room. */
export default function Blocks({ blocks, accent }) {
  return (
    <>
      {blocks.map((b, i) => (
        <Block key={i} block={b} accent={accent} />
      ))}
    </>
  )
}

function Block({ block, accent }) {
  switch (block.kind) {
    case 'text':
      return <p className="blk-text">{block.body}</p>

    case 'list':
      return (
        <ul className="blk-list">
          {block.items.map((it, i) => (
            <li key={i}>
              <span className="blk-tick" style={{ color: accent }}>
                ▸
              </span>
              {it}
            </li>
          ))}
        </ul>
      )

    case 'cards':
      return (
        <div className="blk-cards">
          {block.items.map((c, i) => {
            const Tag = c.href ? 'a' : 'div'
            return (
              <Tag
                key={i}
                className="card"
                {...(c.href ? { href: c.href, target: '_blank', rel: 'noreferrer noopener' } : {})}
              >
                <div className="card-head">
                  <span className="card-title">{c.title}</span>
                  {c.meta && <span className="card-meta">{c.meta}</span>}
                </div>
                {c.body && <p className="card-body">{c.body}</p>}
                {c.tags?.length > 0 && (
                  <div className="card-tags">
                    {c.tags.map((t, k) => (
                      <span key={k} className="tag" style={{ borderColor: `${accent}55`, color: accent }}>
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {c.href && <span className="card-go">OPEN →</span>}
              </Tag>
            )
          })}
        </div>
      )

    case 'bars':
      return (
        <div className="blk-bars">
          {block.items.map((b, i) => (
            <div className="bar-row" key={i}>
              <span className="bar-label">{b.label}</span>
              <span className="bar-track">
                <span
                  className="bar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, b.value))}%`, background: accent }}
                />
              </span>
              <span className="bar-val">{b.value}</span>
            </div>
          ))}
        </div>
      )

    case 'timeline':
      return (
        <ol className="blk-time">
          {block.items.map((t, i) => (
            <li key={i}>
              <span className="time-dot" style={{ background: accent }} />
              <span className="time-when">{t.when}</span>
              <span className="time-what">{t.what}</span>
              <span className="time-where">{t.where}</span>
              {t.body && <span className="time-body">{t.body}</span>}
            </li>
          ))}
        </ol>
      )

    case 'links':
      return (
        <div className="blk-links">
          {block.items.map((l, i) => (
            <a key={i} className="link-row" href={l.href} target="_blank" rel="noreferrer noopener">
              <span className="link-label">{l.label}</span>
              <span className="link-value" style={{ color: accent }}>
                {l.value}
              </span>
            </a>
          ))}
        </div>
      )

    default:
      return null
  }
}
