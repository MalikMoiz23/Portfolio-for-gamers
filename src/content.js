/* ============================================================================
 * CONTENT.JS — THE ONLY FILE YOU NEED TO EDIT
 * ----------------------------------------------------------------------------
 * Everything the visitor reads lives here. The 3D corridor builds itself from
 * the ROOMS array: one door per room, in order, alternating down the hallway.
 *
 * Add a room  -> push an object into ROOMS. A door appears.
 * Remove one  -> delete the object. The corridor shortens.
 * Reorder     -> move the object. The doors move with it.
 *
 * Block kinds you can use inside a room's `blocks` array:
 *   { kind: 'text',     body: '...' }
 *   { kind: 'list',     items: ['...', '...'] }
 *   { kind: 'cards',    items: [{ title, meta, body, tags: [], href }] }
 *   { kind: 'bars',     items: [{ label, value }] }
 *   { kind: 'timeline', items: [{ when, what, where, body }] }
 *   { kind: 'links',    items: [{ label, value, href }] }
 *
 * `accent` is the neon a room runs on: the light under its door, the glow on
 * its LED strips, the tint on its boards and the colour the HUD borrows while
 * you are standing in it. Pick saturated colours — everything else is black.
 *
 * ABOUT is the one room that does not use `blocks`. It uses `pages` instead:
 * each entry becomes one panel on the sliding board, and you click the arrows
 * either side to move between them. Add a page and an extra dot appears; the
 * board handles the rest. Every page takes the same block kinds listed above.
 * ========================================================================== */

export const PROFILE = {
  name: 'ABDUL MOIZ HAROON',
  role: 'Full-Stack Engineer · Web & Real-Time 3D',
  location: 'Lahore, Pakistan',
  // Shown on the title screen under the big PORTFOLIO sign.
  tagline: 'Scroll to enter.',
  // Used by the plain-text fallback page and the contact room.
  email: 'hello@example.com',
}

/* DUMMY CONTENT — every fact below is placeholder. Swap it for the real thing
 * and nothing else in the project needs to change. */

export const ROOMS = [
  {
    id: 'about',
    plate: 'ABOUT', // text stencilled on the door
    title: 'ABOUT',
    subtitle: 'Who is walking around in here',
    accent: '#00e5ff', // the colour of the light bleeding under this door
    /* One entry per panel of the sliding board. `blocks` below is the same
     * content flattened, and is what the plain-text resume reads. */
    pages: [
      {
        title: 'ABOUT ME',
        subtitle: 'Who is walking around in here',
        blocks: [
          {
            kind: 'text',
            body:
              'I build things for the web that have to hold up under real traffic — ' +
              'APIs, dashboards, and lately anything that renders at sixty frames a ' +
              'second in a browser tab. Seven years in, mostly product teams, mostly ' +
              'the part of the stack nobody volunteers for.',
          },
          {
            kind: 'text',
            body:
              'I care about the boring parts: load times, error budgets, and code a ' +
              'stranger can read on a Monday. The rest is decoration.',
          },
        ],
      },
      {
        title: 'THE FACTS',
        subtitle: 'Everything that fits on one card',
        blocks: [
          {
            kind: 'links',
            items: [
              { label: 'Based in', value: 'Lahore, Pakistan · UTC+5' },
              { label: 'Experience', value: '7 years shipping production software' },
              { label: 'Focus', value: 'TypeScript · React · Node · WebGL' },
              { label: 'Availability', value: 'Open to contract and full-time' },
              { label: 'Languages', value: 'English, Urdu, Punjabi' },
            ],
          },
        ],
      },
      {
        title: 'HOW I WORK',
        subtitle: 'What you get if you hire me',
        blocks: [
          {
            kind: 'list',
            items: [
              'Ship small, ship often — a week is the longest anything stays unmerged',
              'Measure before optimising, and write down the number',
              'Boring technology, unless there is a reason on paper',
              'The person reviewing this on a Monday is the audience',
            ],
          },
        ],
      },
      {
        title: 'OFF THE CLOCK',
        subtitle: 'The parts that are not a job',
        blocks: [
          {
            kind: 'list',
            items: [
              'Unreasonably good at: making slow pages fast',
              'Currently learning: compute shaders and WebGPU',
              'Not work: bouldering, film photography, mechanical keyboards',
              'Will argue about: tabs, monorepos, and premature abstraction',
            ],
          },
        ],
      },
    ],
    blocks: [
      {
        kind: 'text',
        body:
          'I build things for the web that have to hold up under real traffic — ' +
          'APIs, dashboards, and lately anything that renders at sixty frames a ' +
          'second in a browser tab. Seven years in, mostly product teams, mostly ' +
          'the part of the stack nobody volunteers for.',
      },
      {
        kind: 'text',
        body:
          'I care about the boring parts: load times, error budgets, and code a ' +
          'stranger can read on a Monday. The rest is decoration.',
      },
      {
        kind: 'links',
        items: [
          { label: 'Based in', value: 'Lahore, Pakistan · UTC+5' },
          { label: 'Experience', value: '7 years shipping production software' },
          { label: 'Focus', value: 'TypeScript · React · Node · WebGL' },
          { label: 'Availability', value: 'Open to contract and full-time' },
          { label: 'Languages', value: 'English, Urdu, Punjabi' },
        ],
      },
      {
        kind: 'list',
        items: [
          'Ship small, ship often — a week is the longest anything stays unmerged',
          'Measure before optimising, and write down the number',
          'Unreasonably good at: making slow pages fast',
          'Currently learning: compute shaders and WebGPU',
          'Not work: bouldering, film photography, mechanical keyboards',
        ],
      },
    ],
  },

  {
    id: 'projects',
    plate: 'PROJECTS',
    title: 'PROJECTS',
    subtitle: 'Things that shipped',
    accent: '#ff3d81',
    blocks: [
      {
        kind: 'cards',
        items: [
          {
            title: 'ATLAS_CONSOLE',
            meta: '2025 · Web',
            body: 'Operations dashboard for a logistics fleet. Live map, 40k events a minute, one engineer on call instead of three.',
            tags: ['React', 'TypeScript', 'Node', 'Postgres', 'Redis'],
            href: 'https://example.com',
          },
          {
            title: 'HOLLOW_ENGINE',
            meta: '2025 · Real-time 3D',
            body: 'A browser renderer for architectural walkthroughs. Procedural materials, no downloads, runs on a laptop GPU.',
            tags: ['Three.js', 'WebGL', 'GLSL'],
            href: 'https://example.com',
          },
          {
            title: 'PIPEWRENCH',
            meta: '2024 · Tooling',
            body: 'CLI that turns a messy monorepo into reproducible builds. Cut CI from 22 minutes to 4.',
            tags: ['Python', 'Docker', 'GitHub Actions'],
            href: 'https://example.com',
          },
          {
            title: 'FIELDNOTE',
            meta: '2024 · Mobile',
            body: 'Offline-first inspection app for site engineers. Syncs when the signal comes back, never loses a form.',
            tags: ['React Native', 'SQLite'],
            href: '',
          },
        ],
      },
    ],
  },

  {
    id: 'skills',
    plate: 'SKILLS',
    title: 'SKILLS',
    subtitle: 'The toolbox',
    accent: '#39ff9e',
    blocks: [
      {
        kind: 'bars',
        items: [
          { label: 'TypeScript / JavaScript', value: 92 },
          { label: 'React / Next.js', value: 88 },
          { label: 'Node / API design', value: 85 },
          { label: 'Three.js / WebGL', value: 74 },
          { label: 'Postgres / SQL', value: 78 },
          { label: 'Python', value: 66 },
          { label: 'Docker / CI / AWS', value: 62 },
        ],
      },
      {
        kind: 'list',
        items: [
          'Daily: Git, Vite, Vitest, Playwright, Linux',
          'Comfortable: Figma, Prisma, Redis, GraphQL',
          'Have shipped with: Rust, Go, Kubernetes',
        ],
      },
    ],
  },

  {
    id: 'experience',
    plate: 'HISTORY',
    title: 'EXPERIENCE',
    subtitle: 'Where the time went',
    accent: '#a855ff',
    blocks: [
      {
        kind: 'timeline',
        items: [
          {
            when: '2024 — now',
            what: 'Senior Software Engineer',
            where: 'Northgate Systems',
            body: 'Own the real-time layer. Rebuilt the event pipeline; p95 dropped from 1.9s to 240ms.',
          },
          {
            when: '2022 — 2024',
            what: 'Full-Stack Engineer',
            where: 'Vellum Labs',
            body: 'Shipped the customer portal end to end. Took it from pilot to 30k monthly users.',
          },
          {
            when: '2020 — 2022',
            what: 'Software Engineer',
            where: 'Cobalt Interactive',
            body: 'Front-end for three client products. Set up the design system everyone still uses.',
          },
          {
            when: '2016 — 2020',
            what: 'BS Computer Science',
            where: 'University of Engineering & Technology',
            body: 'Graphics and distributed systems. Final year project on real-time mesh streaming.',
          },
        ],
      },
    ],
  },

  {
    id: 'contact',
    plate: 'EXIT',
    title: 'CONTACT',
    subtitle: 'The way out',
    accent: '#ff5e3a',
    blocks: [
      {
        kind: 'links',
        items: [
          { label: 'Email', value: 'hello@example.com', href: 'mailto:hello@example.com' },
          { label: 'GitHub', value: 'github.com/example', href: 'https://github.com/example' },
          { label: 'LinkedIn', value: 'linkedin.com/in/example', href: 'https://linkedin.com/in/example' },
          // for this one to work, drop your PDF in at public/resume.pdf
          { label: 'Resume', value: 'Download PDF', href: '/resume.pdf' },
        ],
      },
      {
        kind: 'text',
        body: 'Thanks for walking all the way down. Turn the lights off on your way out.',
      },
    ],
  },
]
