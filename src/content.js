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
 *   { kind: 'bars',     items: [{ label, value }] }   value is 0-100
 *   { kind: 'timeline', items: [{ when, what, where, body }] }
 *   { kind: 'links',    items: [{ label, value, href }] }
 * ========================================================================== */

export const PROFILE = {
  name: 'YOUR NAME',
  role: 'Full-Stack Engineer',
  location: 'City, Country',
  // Shown on the title screen under the big PORTFOLIO sign.
  tagline: 'Scroll to enter.',
  // Used by the plain-text fallback page and the contact room.
  email: 'you@example.com',
}

export const ROOMS = [
  {
    id: 'about',
    plate: 'ABOUT', // text stencilled on the door
    title: 'ABOUT',
    subtitle: 'Who is walking around in here',
    accent: '#6fa8ff', // the colour of the light bleeding under this door
    blocks: [
      {
        kind: 'text',
        body:
          'Replace this with two or three sentences about yourself. Who you are, ' +
          'what you build, and why someone should keep walking down this hallway. ' +
          'Keep it short — nobody reads long paragraphs in a dark corridor.',
      },
      {
        kind: 'list',
        items: [
          'Something you are unreasonably good at',
          'Something you are currently learning',
          'Something that is not work',
        ],
      },
    ],
  },

  {
    id: 'projects',
    plate: 'PROJECTS',
    title: 'PROJECTS',
    subtitle: 'Things that shipped',
    accent: '#ff8a4c',
    blocks: [
      {
        kind: 'cards',
        items: [
          {
            title: 'PROJECT_01',
            meta: '2025 · Web',
            body: 'One or two lines on what it does and what problem it solved.',
            tags: ['React', 'Node', 'Postgres'],
            href: 'https://example.com',
          },
          {
            title: 'PROJECT_02',
            meta: '2024 · Tooling',
            body: 'One or two lines on what it does and what problem it solved.',
            tags: ['Python', 'Docker'],
            href: 'https://example.com',
          },
          {
            title: 'PROJECT_03',
            meta: '2024 · Mobile',
            body: 'One or two lines on what it does and what problem it solved.',
            tags: ['React Native'],
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
    accent: '#4cd9a0',
    blocks: [
      {
        kind: 'bars',
        items: [
          { label: 'JavaScript / TypeScript', value: 90 },
          { label: 'React / Next.js', value: 85 },
          { label: 'Node / APIs', value: 80 },
          { label: 'Databases', value: 70 },
          { label: 'DevOps', value: 55 },
        ],
      },
      {
        kind: 'list',
        items: ['Also: Git, Figma, Linux', 'Also: whatever else belongs here'],
      },
    ],
  },

  {
    id: 'experience',
    plate: 'HISTORY',
    title: 'EXPERIENCE',
    subtitle: 'Where the time went',
    accent: '#c88cff',
    blocks: [
      {
        kind: 'timeline',
        items: [
          {
            when: '2024 — now',
            what: 'Job Title',
            where: 'Company Name',
            body: 'One line on what you owned and what changed because of you.',
          },
          {
            when: '2022 — 2024',
            what: 'Job Title',
            where: 'Company Name',
            body: 'One line on what you owned and what changed because of you.',
          },
          {
            when: '2018 — 2022',
            what: 'Degree',
            where: 'University Name',
            body: 'Field of study. Notable thing, if there is one.',
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
    accent: '#ff5c5c',
    blocks: [
      {
        kind: 'links',
        items: [
          { label: 'Email', value: 'you@example.com', href: 'mailto:you@example.com' },
          { label: 'GitHub', value: 'github.com/you', href: 'https://github.com/you' },
          { label: 'LinkedIn', value: 'linkedin.com/in/you', href: 'https://linkedin.com/in/you' },
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
